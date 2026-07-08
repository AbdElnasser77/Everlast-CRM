"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { apiGetConversations, apiMarkRead } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import type { Conversation } from "@/types";

const PAGE_SIZE = 50;

// Single source of truth for ordering: unread always pins above read, and
// each group stays newest-first. Applied at every point the list is built
// (initial fetch, live refresh, load-more) so no code path can accidentally
// skip it — sorting only in the render layer left a gap where load-more's
// appended page could land unread items below already-read ones.
function sortConversations(list: Conversation[]): Conversation[] {
  return [...list].sort((a, b) => {
    const unreadDiff = (a.unreadCount > 0 ? 0 : 1) - (b.unreadCount > 0 ? 0 : 1);
    if (unreadDiff !== 0) return unreadDiff;
    return new Date(b.lastMessageAt ?? 0).getTime() - new Date(a.lastMessageAt ?? 0).getTime();
  });
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

export function useConversations(): UseConversationsReturn {
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

  const fetchConversations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiGetConversations(1, PAGE_SIZE, undefined, searchRef.current || undefined);
      setConversations(sortConversations(res.data));
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

  // Initial load + debounced re-fetch whenever the search term changes.
  useEffect(() => {
    searchRef.current = search;
    const delay = search ? 300 : 0;
    const t = setTimeout(() => { fetchConversations(); }, delay);
    return () => clearTimeout(t);
  }, [search, fetchConversations]);

  // Live-update path for socket events — deliberately NOT fetchConversations.
  // That one flips `loading` (flashing the whole sidebar to a skeleton on
  // every single incoming message) and replaces the list with just page 1
  // (silently dropping anything loaded via scroll). This re-pulls page 1
  // quietly and merges it into whatever's already loaded instead.
  const refreshLive = useCallback(async () => {
    try {
      const res = await apiGetConversations(1, PAGE_SIZE, undefined, searchRef.current || undefined);
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
      const res = await apiGetConversations(nextPage, PAGE_SIZE, undefined, searchRef.current || undefined);
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
                    ? { id: payload.agentId, username: payload.agentUsername ?? "" }
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
    // Optimistic: zero out locally right away, and re-sort since this moves
    // the conversation out of the pinned-unread group immediately.
    setConversations((prev) =>
      sortConversations(
        prev.map((c) => (String(c.id ?? c._id) === id ? { ...c, unreadCount: 0 } : c))
      )
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
