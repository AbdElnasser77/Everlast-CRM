"use client";

// Tells template managers when Meta approves or rejects a template:
//   - a toast the moment it happens (socket event from the API),
//   - a count for the sidebar badge on "Templates", covering decisions made
//     while they were away, until they next open the Templates page.
// Renders nothing itself.

import { useCallback, useEffect } from "react";
import { apiGetTemplates } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import { useToast } from "@/components/ui/toast";
import { decidedSince, getTemplatesSeenAt, TEMPLATES_SEEN_EVENT } from "@/lib/templateUpdates";

interface StatusChanged {
  templateId: number;
  name: string;
  status: "APPROVED" | "REJECTED";
  reason: string | null;
}

export default function TemplateStatusWatcher({ onCount }: { onCount: (n: number) => void }) {
  const toast = useToast();

  const recount = useCallback(() => {
    apiGetTemplates()
      .then((res) => onCount(decidedSince(res.data, getTemplatesSeenAt()).length))
      .catch(() => {});
  }, [onCount]);

  useEffect(() => {
    const first = setTimeout(recount, 0);
    const socket = getSocket();
    const onChanged = (e: StatusChanged) => {
      if (e.status === "APPROVED") {
        toast.success(`Template "${e.name}" was approved by Meta — it's ready to use.`);
      } else {
        toast.error(`Template "${e.name}" was rejected by Meta${e.reason ? `: ${e.reason}` : "."}`);
      }
      recount();
    };
    socket.on("template.status_changed", onChanged);
    window.addEventListener(TEMPLATES_SEEN_EVENT, recount);
    return () => {
      clearTimeout(first);
      socket.off("template.status_changed", onChanged);
      window.removeEventListener(TEMPLATES_SEEN_EVENT, recount);
    };
  }, [recount, toast]);

  return null;
}
