"use client";

import { useState } from "react";
import { apiChangeConversationStatus } from "@/lib/api";
import { useCurrentUser } from "@/components/CurrentUserProvider";
import { useToast } from "@/components/ui/toast";

type Status = "OPEN" | "PENDING" | "RESOLVED";

const OPTIONS: { value: Status; label: string; active: string }[] = [
  { value: "OPEN", label: "Open", active: "bg-white text-[#3B694C] shadow-sm" },
  { value: "PENDING", label: "Pending", active: "bg-white text-amber-600 shadow-sm" },
  { value: "RESOLVED", label: "Resolved", active: "bg-white text-gray-700 shadow-sm" },
];

/**
 * Where this conversation is in its lifecycle. Open = needs work, Pending =
 * waiting on something (the patient, a colleague), Resolved = done — and it
 * leaves the Mine / Unassigned queues. A new message from the patient reopens a
 * resolved chat automatically, on the server.
 *
 * Updates optimistically; the server's `conversation.status_changed` event is
 * what every other open inbox listens to.
 */
export function ConversationStatusControl({ conversationId, status }: { conversationId: string; status: Status }) {
  const { can } = useCurrentUser();
  const toast = useToast();
  const [pending, setPending] = useState<Status | null>(null);
  const shown = pending ?? status;

  async function change(next: Status) {
    if (next === shown) return;
    setPending(next);
    try {
      await apiChangeConversationStatus(conversationId, next);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't change the status");
    } finally {
      setPending(null);
    }
  }

  const editable = can("conversation:write");

  return (
    <div role="radiogroup" aria-label="Conversation status" className="flex items-center gap-0.5 p-0.5 rounded-lg bg-gray-100">
      {OPTIONS.map((o) => {
        const selected = shown === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={!editable || pending !== null}
            onClick={() => change(o.value)}
            className={`px-2.5 h-7 rounded-md text-[12px] font-medium transition-colors disabled:cursor-default ${
              selected ? o.active : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
