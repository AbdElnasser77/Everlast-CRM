"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { apiGetMessages, apiMarkRead } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import type { Message } from "@/types";

const PAGE_SIZE = 50;

interface UseMessagesReturn {
  messages: Message[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  loadMore: () => void;
  error: string | null;
  appendOptimistic: (msg: Message) => void;
  confirmOptimistic: (tempId: string, confirmed: Message) => void;
  typingUsers: string[];
}

function getLocalId(m: Message): string {
  return m._id != null ? String(m._id) : m.id != null ? String(m.id) : "";
}

function isTemp(m: Message): boolean {
  return getLocalId(m).startsWith("temp-");
}

export function emitTypingStart(conversationId: number | string, username: string): void {
  getSocket().emit("typing.start", { conversationId, username });
}

export function emitTypingStop(conversationId: number | string, username: string): void {
  getSocket().emit("typing.stop", { conversationId, username });
}

export function useMessages(conversationId: string): UseMessagesReturn {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);

  // Refs avoid stale-closure issues in the loadMore guard
  const pageRef = useRef(1);
  const loadingMoreRef = useRef(false);
  const hasMoreRef = useRef(false);

  // Initial load — backend returns DESC (newest first), reverse for display
  useEffect(() => {
    if (!conversationId) return;
    setLoading(true);
    setMessages([]);
    setError(null);
    setHasMore(false);
    hasMoreRef.current = false;
    pageRef.current = 1;

    apiGetMessages(conversationId, 1, PAGE_SIZE)
      .then((res) => {
        setMessages([...res.data].reverse());
        const more = res.data.length >= PAGE_SIZE;
        setHasMore(more);
        hasMoreRef.current = more;
        apiMarkRead(conversationId).catch(() => {});
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load messages");
      })
      .finally(() => setLoading(false));
  }, [conversationId]);

  // Load older messages (scroll-up triggered)
  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !hasMoreRef.current) return;
    const nextPage = pageRef.current + 1;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const res = await apiGetMessages(conversationId, nextPage, PAGE_SIZE);
      const older = [...res.data].reverse();
      setMessages((prev) => [...older, ...prev]);
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
  }, [conversationId]);

  // Real-time socket events
  useEffect(() => {
    if (!conversationId) return;
    const socket = getSocket();

    const handleMessageCreated = ({
      message,
      conversationId: cid,
    }: {
      message: Message;
      conversationId: unknown;
    }) => {
      if (String(cid) !== conversationId) return;

      setMessages((prev) => {
        const incoming = getLocalId(message);
        if (incoming && prev.some((m) => getLocalId(m) === incoming)) return prev;

        if (String(message.senderType) === "AGENT") {
          const tempIdx = prev.findIndex((m) => {
            if (!isTemp(m)) return false;
            return message.messageType === "TEXT"
              ? m.content === message.content
              : m.messageType === message.messageType;
          });
          if (tempIdx !== -1) {
            const next = [...prev];
            next[tempIdx] = message;
            return next;
          }
        }

        if (String(message.senderType) === "CUSTOMER") {
          apiMarkRead(conversationId).catch(() => {});
        }

        return [...prev, message];
      });
    };

    const handleStatusUpdated = ({
      messageId,
      status,
    }: {
      messageId: number | string;
      status: string;
    }) => {
      const targetId = String(messageId);
      setMessages((prev) => {
        const idx = prev.findIndex((m) => getLocalId(m) === targetId);
        if (idx === -1) return prev;
        const next = [...prev];
        next[idx] = { ...next[idx], status: status as import("@/types").Message["status"] };
        return next;
      });
    };

    const handleTypingStart = ({
      conversationId: cid,
      username,
    }: {
      conversationId: number | string;
      username: string;
    }) => {
      if (String(cid) !== conversationId) return;
      setTypingUsers((prev) =>
        prev.includes(username) ? prev : [...prev, username]
      );
    };

    const handleTypingStop = ({
      conversationId: cid,
      username,
    }: {
      conversationId: number | string;
      username: string;
    }) => {
      if (String(cid) !== conversationId) return;
      setTypingUsers((prev) => prev.filter((u) => u !== username));
    };

    const handleMediaReady = ({
      messageId,
      mediaUrl,
    }: {
      messageId: number | string;
      mediaUrl: string;
    }) => {
      const targetId = String(messageId);
      setMessages((prev) => {
        const idx = prev.findIndex((m) => getLocalId(m) === targetId);
        if (idx === -1) return prev;
        const next = [...prev];
        next[idx] = { ...next[idx], mediaUrl };
        return next;
      });
    };

    socket.on("message.created", handleMessageCreated);
    socket.on("message.status_updated", handleStatusUpdated);
    socket.on("message.media_ready", handleMediaReady);
    socket.on("typing.start", handleTypingStart);
    socket.on("typing.stop", handleTypingStop);

    return () => {
      socket.off("message.created", handleMessageCreated);
      socket.off("message.status_updated", handleStatusUpdated);
      socket.off("message.media_ready", handleMediaReady);
      socket.off("typing.start", handleTypingStart);
      socket.off("typing.stop", handleTypingStop);
    };
  }, [conversationId]);

  useEffect(() => {
    setTypingUsers([]);
  }, [conversationId]);

  const appendOptimistic = useCallback((msg: Message) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  const confirmOptimistic = useCallback((tempId: string, confirmed: Message) => {
    setMessages((prev) => {
      const idx = prev.findIndex((m) => getLocalId(m) === tempId);
      if (idx === -1) return prev;
      const next = [...prev];
      next[idx] = confirmed;
      return next;
    });
  }, []);

  return {
    messages,
    loading,
    loadingMore,
    hasMore,
    loadMore,
    error,
    appendOptimistic,
    confirmOptimistic,
    typingUsers,
  };
}
