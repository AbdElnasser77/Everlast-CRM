"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { apiGetConversations, apiMarkRead } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import type { Conversation, ConversationView } from "@/types";

const PAGE_SIZE = 50;

// Single source of truth for ordering, applied at every point the list is
// built (initial fetch, live refresh, load-more) so no code path can skip it.
// WhatsApp order: most recent message first, nothing else. Unread chats used
// to be pinned above the rest, which made a chat jump down the list the moment
// you opened it (opening marks it read). Read state never moves a row now —
// only a new message does. Matches the server's lastMessageAt ordering, so
// pages merge without reshuffling.
function sortConversations(list: Conversation[]): Conversation[] {
  return [...list].sort(
    (a, b) => new Date(b.lastMessageAt ?? 0).getTime() - new Date(a.lastMessageAt ?? 0).getTime(),
  );
}

interface UseConversationsReturn {
  conversations: Conversation[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  loadMore: () => void;
  error: string | null;
  refetch: () => Promise<void>;
  markRead: (id: string) => void;
  search: string;
  setSearch: (value: string) => void;
}

const idOf = (c: Conversation) => String(c.id ?? c._id);

/**
 * @param view      the inbox view — all / mine / unassigned / campaign_replies —
 *                  filtered on the SERVER, so a match on page 3 still appears.
 * @param pinnedId  the conversation currently open. It is kept in the list even
 *                  when a refresh says it no longer belongs to the view (e.g. you
 *                  just assigned it to a colleague while in "Unassigned"): the
 *                  thread page finds its conversation in this list, and would
 *                  otherwise treat it as gone and navigate away from it.
 */
export function useConversations(
  { view = "all", pinnedId = null }: { view?: ConversationView; pinnedId?: string | null } = {},
): UseConversationsReturn {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Refs avoid stale-closure issues in the loadMore guard and let the
  // search-triggered effect and the socket-triggered refetch agree on the
  // current search term without re-subscribing the socket every keystroke.
  const pageRef = useRef(1);
  const loadingMoreRef = useRef(false);
  const hasMoreRef = useRef(false);
  const searchRef = useRef("");
  const viewRef = useRef<ConversationView>(view);
  const pinnedRef = useRef<string | null>(pinnedId);
  useEffect(() => { pinnedRef.current = pinnedId; }, [pinnedId]);

  // Replace the list with a fresh page, keeping the open conversation if the
  // fresh page doesn't include it.
  const withPinned = (fresh: Conversation[], prev: Conversation[]) => {
    const pin = pinnedRef.current;
    if (!pin || fresh.some((c) => idOf(c) === pin)) return fresh;
    const kept = prev.find((c) => idOf(c) === pin);
    return kept ? [kept, ...fresh] : fresh;
  };

  const fetchConversations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiGetConversations(1, PAGE_SIZE, undefined, searchRef.current || undefined, viewRef.current);
      setConversations((prev) => sortConversations(withPinned(res.data, prev)));
      pageRef.current = 1;
      const more = res.data.length >= PAGE_SIZE;
      setHasMore(more);
      hasMoreRef.current = more;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load conversations");
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load + re-fetch whenever the search term (debounced) or the view changes.
  useEffect(() => {
    searchRef.current = search;
    const viewChanged = viewRef.current !== view;
    viewRef.current = view;
    const delay = search && !viewChanged ? 300 : 0;
    const t = setTimeout(() => { fetchConversations(); }, delay);
    return () => clearTimeout(t);
  }, [search, view, fetchConversations]);

  // Live-update path for socket events — deliberately NOT fetchConversations.
  // That one flips `loading` (flashing the whole sidebar to a skeleton on
  // every single incoming message) and replaces the list with just page 1
  // (silently dropping anything loaded via scroll). This re-pulls page 1
  // quietly and merges it into whatever's already loaded instead.
  //
  // In a filtered view (Mine / Unassigned / Campaign replies) a merge would never
  // REMOVE a row that stopped matching — a chat you just assigned away would
  // linger in "Unassigned". So there, page 1 replaces the list instead, keeping
  // the open conversation.
  const refreshLive = useCallback(async () => {
    try {
      const res = await apiGetConversations(1, PAGE_SIZE, undefined, searchRef.current || undefined, viewRef.current);
      if (viewRef.current !== "all") {
        setConversations((prev) => sortConversations(withPinned(res.data, prev)));
        return;
      }
      setConversations((prev) => {
        const freshMap = new Map(res.data.map((c) => [String(c.id ?? c._id), c]));
        const knownIds = new Set(prev.map((c) => String(c.id ?? c._id)));
        const merged = prev.map((c) => freshMap.get(String(c.id ?? c._id)) ?? c);
        const brandNew = res.data.filter((c) => !knownIds.has(String(c.id ?? c._id)));
        return sortConversations([...brandNew, ...merged]);
      });
    } catch {
      // keep whatever's currently shown
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !hasMoreRef.current) return;
    const nextPage = pageRef.current + 1;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const res = await apiGetConversations(nextPage, PAGE_SIZE, undefined, searchRef.current || undefined, viewRef.current);
      setConversations((prev) => {
        const existingIds = new Set(prev.map((c) => String(c.id ?? c._id)));
        const fresh = res.data.filter((c) => !existingIds.has(String(c.id ?? c._id)));
        return sortConversations([...prev, ...fresh]);
      });
      const more = res.data.length >= PAGE_SIZE;
      setHasMore(more);
      hasMoreRef.current = more;
      pageRef.current = nextPage;
    } catch {
      // silently keep what we have
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    const socket = getSocket();

    const handleConversationAssigned = (payload: {
      conversationId: string | number;
      agentId: number | null;
      agentUsername: string | null;
    }) => {
      setConversations((prev) =>
        prev.map((c) =>
          String(payload.conversationId) === String(c.id ?? c._id)
            ? {
                ...c,
                assignedAgentId: payload.agentId ?? null,
                assignedAgent:
                  payload.agentId != null
                    ? { id: payload.agentId, name: null, username: payload.agentUsername ?? "" }
                    : null,
              }
            : c
        )
      );
    };

    const handleConversationStatusChanged = (payload: {
      conversationId: string | number;
      status: string;
    }) => {
      setConversations((prev) =>
        prev.map((c) =>
          String(payload.conversationId) === String(c.id ?? c._id)
            ? { ...c, status: payload.status as "OPEN" | "PENDING" | "RESOLVED" }
            : c
        )
      );
    };

    // `connect` fires on the initial connect AND every reconnect. Socket.IO
    // doesn't replay events broadcast while a client was disconnected (e.g.
    // during a backend restart), so without this, a new conversation/message
    // that arrived in that gap would silently never appear until a manual
    // page refresh. Refreshing on every (re)connect closes that gap.
    socket.on("conversation.updated", refreshLive);
    socket.on("connect", refreshLive);
    socket.on("conversation.assigned", handleConversationAssigned);
    socket.on("conversation.status_changed", handleConversationStatusChanged);

    return () => {
      socket.off("conversation.updated", refreshLive);
      socket.off("connect", refreshLive);
      socket.off("conversation.assigned", handleConversationAssigned);
      socket.off("conversation.status_changed", handleConversationStatusChanged);
    };
  }, [refreshLive]);

  const markRead = useCallback((id: string) => {
    // Optimistic: zero out locally right away. No re-sort: read state doesn't
    // affect order, so the row stays exactly where it is.
    setConversations((prev) =>
      prev.map((c) => (String(c.id ?? c._id) === id ? { ...c, unreadCount: 0 } : c))
    );
    // Persist to backend in the background
    apiMarkRead(id).catch(() => {});
  }, []);

  return {
    conversations,
    loading,
    loadingMore,
    hasMore,
    loadMore,
    error,
    refetch: fetchConversations,
    markRead,
    search,
    setSearch,
  };
}
