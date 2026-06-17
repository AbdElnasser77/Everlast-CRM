"use client";

import { createContext, useContext } from "react";
import type { Conversation } from "@/types";

interface ConversationsContextValue {
  conversations: Conversation[];
  markRead: (id: string) => void;
}

export const ConversationsContext = createContext<ConversationsContextValue>({
  conversations: [],
  markRead: () => {},
});

export function useConversationsContext(): ConversationsContextValue {
  return useContext(ConversationsContext);
}
