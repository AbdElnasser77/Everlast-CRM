"use client";

import { useState, useEffect, useCallback } from "react";
import { apiGetConversations, apiMarkRead } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import type { Conversation } from "@/types";

interface UseConversationsReturn {
  conversations: Conversation[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  markRead: (id: string) => void;
}

export function useConversations(): UseConversationsReturn {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchConversations = useCallback(async () => {
    try {
      setError(null);
      const res = await apiGetConversations();
      setConversations(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load conversations");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

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

    socket.on("conversation.updated", fetchConversations);
    socket.on("conversation.assigned", handleConversationAssigned);
    socket.on("conversation.status_changed", handleConversationStatusChanged);

    return () => {
      socket.off("conversation.updated", fetchConversations);
      socket.off("conversation.assigned", handleConversationAssigned);
      socket.off("conversation.status_changed", handleConversationStatusChanged);
    };
  }, [fetchConversations]);

  const markRead = useCallback((id: string) => {
    // Optimistic: zero out locally right away
    setConversations((prev) =>
      prev.map((c) =>
        String(c.id ?? c._id) === id ? { ...c, unreadCount: 0 } : c
      )
    );
    // Persist to backend in the background
    apiMarkRead(id).catch(() => {});
  }, []);

  return { conversations, loading, error, refetch: fetchConversations, markRead };
}
