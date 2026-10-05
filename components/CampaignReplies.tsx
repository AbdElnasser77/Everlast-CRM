"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { MessageSquare } from "lucide-react";
import { apiGetCampaignReplies } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import { useCurrentUser } from "@/components/CurrentUserProvider";
import { Spinner } from "@/components/ui/spinner";
import type { CampaignReply } from "@/types";

const PAGE_SIZE = 25;

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
    " · " +
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function replyPreview(r: CampaignReply): string {
  if (!r.reply) return "—";
  if (r.reply.messageType === "TEXT" || r.reply.messageType === "TEMPLATE") return r.reply.content || "—";
  return `[${r.reply.messageType.toLowerCase()}]`;
}

/**
 * Who answered this campaign, and whether anyone has answered them back.
 *
 * "Needs response" = the patient spoke last and the chat isn't resolved; the
 * server works that out. Everyone with campaign:read sees the list; "Open chat"
 * only shows for people with an inbox (conversation:write) — Marketing reads
 * results here but doesn't reply.
 *
 * Refreshes on `campaign.replied` for this campaign, and on any conversation
 * change, since an agent's reply flips a row from Needs response to Handled.
 */
export function CampaignReplies({ campaignId }: { campaignId: number }) {
  const { can } = useCurrentUser();
  const canOpenChat = can("conversation:write");
  const [rows, setRows] = useState<CampaignReply[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState(false);

  const load = useCallback((p: number) => {
    apiGetCampaignReplies(campaignId, p, PAGE_SIZE)
      .then((res) => {
        setRows(res.data);
        setTotal(res.pagination.total);
        setTotalPages(Math.max(1, res.pagination.totalPages));
        setError(false);
      })
      .catch(() => setError(true));
  }, [campaignId]);

  useEffect(() => { load(page); }, [load, page]);

  useEffect(() => {
    const socket = getSocket();
    let t: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => load(page), 500);
    };
    const onReplied = (p: { campaignId?: number }) => { if (p?.campaignId === campaignId) refresh(); };
    socket.on("campaign.replied", onReplied);
    socket.on("conversation.updated", refresh);
    return () => {
      if (t) clearTimeout(t);
      socket.off("campaign.replied", onReplied);
      socket.off("conversation.updated", refresh);
    };
  }, [campaignId, load, page]);

  const waiting = (rows ?? []).filter((r) => r.needsResponse).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] font-bold tracking-wider text-gray-400 uppercase">
          Replies · {total}
          {waiting > 0 && <span className="ml-2 normal-case tracking-normal font-semibold text-amber-600">{waiting} need a response</span>}
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        {rows === null && !error ? (
          <div className="flex justify-center py-8"><Spinner size="sm" label="Loading replies" /></div>
        ) : error ? (
          <p className="px-5 py-6 text-[13px] text-gray-400 text-center">Couldn&apos;t load replies.</p>
        ) : rows!.length === 0 ? (
          <div className="flex flex-col items-center gap-1.5 py-8 text-center">
            <MessageSquare className="w-5 h-5 text-gray-300" />
            <p className="text-[13px] text-gray-400">No replies yet.</p>
            <p className="text-[11.5px] text-gray-300 max-w-xs">
              A reply counts when the patient quotes or taps a button on the campaign message, or writes within 7 days of receiving it.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {rows!.map((r) => {
              const owner = r.conversation?.assignedAgent;
              return (
                <li key={r.recipientId} className="flex items-center gap-4 px-5 py-3">
                  <div className="w-44 shrink-0 min-w-0">
                    <p className="text-[13px] font-semibold text-gray-800 truncate">{r.customer.name || r.customer.phone}</p>
                    {r.customer.name && <p className="text-[11.5px] text-gray-400 truncate">{r.customer.phone}</p>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] text-gray-600 truncate">{replyPreview(r)}</p>
                    <p className="text-[11px] text-gray-400">
                      {formatWhen(r.repliedAt)}
                      {owner ? ` · ${owner.name || owner.username}` : r.conversation && r.conversation.status !== "RESOLVED" ? " · Unassigned" : ""}
                    </p>
                  </div>
                  <span className={`shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                    r.needsResponse ? "bg-amber-50 text-amber-700" : "bg-green-50 text-green-700"
                  }`}>
                    {r.needsResponse ? "Needs response" : "Handled"}
                  </span>
                  {canOpenChat && r.conversation && (
                    <Link
                      href={`/chats/${r.conversation.id}`}
                      className="shrink-0 text-[12px] font-medium text-[#3B694C] hover:underline"
                    >
                      Open chat
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-end gap-2 px-5 py-2.5 border-t border-gray-100 text-[12px] text-gray-500">
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-2 py-1 rounded-lg hover:bg-gray-50 disabled:opacity-40 cursor-pointer disabled:cursor-default">Previous</button>
            <span>{page} / {totalPages}</span>
            <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="px-2 py-1 rounded-lg hover:bg-gray-50 disabled:opacity-40 cursor-pointer disabled:cursor-default">Next</button>
          </div>
        )}
      </div>
    </div>
  );
}
