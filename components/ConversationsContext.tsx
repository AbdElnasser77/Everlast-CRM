"use client";

import { createContext, useContext } from "react";
import type { Conversation } from "@/types";

interface ConversationsContextValue {
  conversations: Conversation[];
  // Without this a consumer cannot tell "still loading" from "does not exist",
  // which matters after a number switch: the list is briefly empty and a
  // conversation lookup legitimately misses.
  loading: boolean;
  markRead: (id: string) => void;
}

export const ConversationsContext = createContext<ConversationsContextValue>({
  conversations: [],
  loading: true,
  markRead: () => {},
});

export function useConversationsContext(): ConversationsContextValue {
  return useContext(ConversationsContext);
}
