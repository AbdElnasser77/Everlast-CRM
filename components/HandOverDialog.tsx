"use client";

// Handing someone's open chats to a colleague, or back to the shared queue. One dialog for every way that happens:
//   - end of shift (the agent's own status menu) — POST /users/me/hand-over,
//   - a supervisor covering an absence (Supervision → Team) — POST /supervision/hand-over,
//   - deactivating an account (Settings → Users) — PUT /users/:id { isActive: false, handOverTo }.
// The caller does the request; this only picks who receives the work.

import { useEffect, useState, type ReactNode } from "react";
import { Inbox } from "lucide-react";
import { apiGetAssignableUsers } from "@/lib/api";
import type { AssignableUser, HandOverResult } from "@/types";
import { DialogButtons, DialogShell, labelCls } from "@/components/DialogShell";
import { Spinner } from "@/components/ui/spinner";

const PRESENCE_DOT: Record<AssignableUser["status"], string> = {
  ONLINE: "bg-green-500",
  ON_BREAK: "bg-amber-400",
  OFFLINE: "bg-gray-300",
};
const PRESENCE_LABEL: Record<AssignableUser["status"], string> = {
  ONLINE: "Online",
  ON_BREAK: "On break",
  OFFLINE: "Offline",
};

const nameOf = (u: { name?: string | null; username: string }) => u.name || u.username;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "Handed over 3 chats to Sara" / "… back to the queue" / "Nothing to hand over". */
export function handOverSummary(r: Pick<HandOverResult, "chats" | "to"> | null | undefined): string {
  if (!r || !r.chats) return "There were no open chats to hand over";
  return `Handed over ${plural(r.chats, "chat", "chats")} ${r.to ? `to ${nameOf(r.to)}` : "back to the queue"}`;
}

export function HandOverDialog({
  title,
  intro,
  heading = "Hand their open chats to",
  excludeUserId,
  confirmLabel,
  danger = false,
  onCancel,
  onConfirm,
}: {
  title: string;
  intro?: ReactNode;
  heading?: string;
  /** Whose work it is — not offered as a recipient. */
  excludeUserId: number | null;
  confirmLabel: string;
  danger?: boolean;
  onCancel: () => void;
  /** Does the request; returns the server's refusal, or null when done. */
  onConfirm: (toUserId: number | null) => Promise<string | null>;
}) {
  const [people, setPeople] = useState<AssignableUser[] | null>(null);
  const [to, setTo] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiGetAssignableUsers()
      .then((res) => { if (!cancelled) setPeople(res.data.filter((u) => u.id !== excludeUserId)); })
      .catch(() => { if (!cancelled) setPeople([]); });
    return () => { cancelled = true; };
  }, [excludeUserId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const err = await onConfirm(to);
      if (err) setError(err);
    } finally {
      setSaving(false);
    }
  }

  const option = (active: boolean) =>
    `flex items-center gap-2.5 px-3 py-2 rounded-xl border text-[13px] cursor-pointer transition-colors ${
      active ? "bg-brand-100 border-brand text-brand-fg font-semibold" : "border-gray-200 text-gray-700 hover:bg-gray-50"
    }`;

  return (
    <DialogShell title={title} intro={intro} onCancel={onCancel} saving={saving}>
      <form onSubmit={submit} className="px-6 pb-6 space-y-3 min-h-0 flex flex-col">
        <span className={labelCls}>{heading}</span>
        <div role="radiogroup" aria-label={heading} className="space-y-1.5 overflow-y-auto max-h-[300px] -mx-1 px-1">
          <label className={option(to === null)}>
            <input type="radio" name="hand-over-to" checked={to === null} onChange={() => setTo(null)} className="accent-brand" />
            <span className="w-6 h-6 rounded-full border border-dashed border-amber-300 bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
              <Inbox className="w-3.5 h-3.5" />
            </span>
            <span className="flex-1 min-w-0">
              Back to the queue
              <span className="block text-[11px] font-normal text-gray-400">Their chats become unassigned</span>
            </span>
          </label>
          {people === null ? (
            <div className="flex items-center gap-2 px-3 py-2 text-[12px] text-gray-400">
              <Spinner size="xs" label="Loading" /> Loading colleagues…
            </div>
          ) : people.length === 0 ? (
            <p className="px-3 py-2 text-[12px] text-gray-400">No colleague can take chats right now.</p>
          ) : (
            people.map((u) => (
              <label key={u.id} className={option(to === u.id)}>
                <input type="radio" name="hand-over-to" checked={to === u.id} onChange={() => setTo(u.id)} className="accent-brand" />
                <span className="relative w-6 h-6 rounded-full bg-gray-100 text-gray-600 text-[10px] font-bold flex items-center justify-center shrink-0">
                  {nameOf(u).split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                  <span className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full ring-2 ring-white ${PRESENCE_DOT[u.status]}`} />
                </span>
                <span className="flex-1 min-w-0 truncate">{nameOf(u)}</span>
                <span className="text-[11px] font-normal text-gray-400 shrink-0">{PRESENCE_LABEL[u.status]}</span>
              </label>
            ))
          )}
        </div>
        {error && <p role="alert" className="text-[13px] text-red-500 font-medium">{error}</p>}
        <DialogButtons saving={saving} onCancel={onCancel} label={confirmLabel} danger={danger} />
      </form>
    </DialogShell>
  );
}
