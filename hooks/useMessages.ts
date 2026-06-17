"use client";

import { useState, useEffect, useCallback } from "react";
import { apiGetMessages, apiMarkRead } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import type { Message } from "@/types";

interface UseMessagesReturn {
  messages: Message[];
  loading: boolean;
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
  const [error, setError] = useState<string | null>(null);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);

  useEffect(() => {
    if (!conversationId) return;
    setLoading(true);
    setMessages([]);
    setError(null);

    apiGetMessages(conversationId)
      .then((res) => {
        setMessages(res.data);
        apiMarkRead(conversationId).catch(() => {});
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load messages");
      })
      .finally(() => setLoading(false));
  }, [conversationId]);

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
        // 1. ID dedup first — if confirmOptimistic already placed the real message,
        //    discard the socket echo immediately regardless of message type
        const incoming = getLocalId(message);
        if (incoming && prev.some((m) => getLocalId(m) === incoming)) return prev;

        // 2. Agent message: replace matching optimistic temp in-place
        if (String(message.senderType) === "AGENT") {
          const tempIdx = prev.findIndex((m) => {
            if (!isTemp(m)) return false;
            // TEXT: match by content; media: match by messageType
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

        // 3. New message — mark read if customer and append
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

    socket.on("message.created", handleMessageCreated);
    socket.on("message.status_updated", handleStatusUpdated);
    socket.on("typing.start", handleTypingStart);
    socket.on("typing.stop", handleTypingStop);

    return () => {
      socket.off("message.created", handleMessageCreated);
      socket.off("message.status_updated", handleStatusUpdated);
      socket.off("typing.start", handleTypingStart);
      socket.off("typing.stop", handleTypingStop);
    };
  }, [conversationId]);

  // Reset typing users when switching conversations
  useEffect(() => {
    setTypingUsers([]);
  }, [conversationId]);

  const appendOptimistic = useCallback((msg: Message) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  // Fallback: if socket replaces the temp first, this is a no-op.
  // If socket is slow / fails, this ensures the UI updates.
  const confirmOptimistic = useCallback((tempId: string, confirmed: Message) => {
    setMessages((prev) => {
      const idx = prev.findIndex((m) => getLocalId(m) === tempId);
      if (idx === -1) return prev;  // socket already replaced it — done
      const next = [...prev];
      next[idx] = confirmed;
      return next;
    });
  }, []);

  return { messages, loading, error, appendOptimistic, confirmOptimistic, typingUsers };
}
