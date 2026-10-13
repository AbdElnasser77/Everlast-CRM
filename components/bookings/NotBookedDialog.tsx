"use client";

import { useState } from "react";
import type { NotBookedReason } from "@/types";
import { NOT_BOOKED_REASONS } from "@/lib/bookingRequests";
import { DialogButtons, DialogShell, inputCls, inputErrCls, labelCls } from "@/components/bookings/DialogShell";
import { fmtWhen, followUpPicks, toDateTimeInput } from "@/lib/chatOutcome";

// What the server does to the chat's outcome for each reason (see
// closeNotBooked on the API) — said up front so it's no surprise.
const CHAT_HINT: Record<NotBookedReason, string> = {
  NOT_INTERESTED: "The chat will be marked Not interested.",
  PRICE: "The chat will be marked Not interested.",
  BOOKED_ELSEWHERE: "The chat will be marked Not interested.",
  NO_ANSWER: "The chat will be marked No answer.",
  CALL_BACK_LATER: "The chat becomes Follow up at this time — you'll get a reminder when it's due.",
  OTHER: "The chat's outcome stays as it is.",
};

/**
 * Close a booking request without an appointment: why, and a note (required
 * for "Other"). "Will call back later" also needs when — the chat becomes
 * Follow up then. onSave returns the server's refusal (e.g. it still has live
 * appointments) or null when saved.
 */
export function NotBookedDialog({
  patient,
  onCancel,
  onSave,
}: {
  patient?: string | null;
  onCancel: () => void;
  onSave: (reason: NotBookedReason, note?: string, followUpAt?: string) => Promise<string | null>;
}) {
  const [reason, setReason] = useState<NotBookedReason | null>(null);
  const [note, setNote] = useState("");
  const [picks] = useState(followUpPicks);
  const [callBack, setCallBack] = useState(() => toDateTimeInput(picks[1].at));
  const [callBackError, setCallBackError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noteError, setNoteError] = useState(false);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason) return setError("Pick a reason.");
    if (reason === "OTHER" && !note.trim()) {
      setNoteError(true);
      return setError("Add a note saying what happened.");
    }
    let followUpAt: string | undefined;
    if (reason === "CALL_BACK_LATER") {
      const d = new Date(callBack);
      if (!callBack || Number.isNaN(d.getTime())) {
        setCallBackError(true);
        return setError("Choose when to call them back.");
      }
      if (d.getTime() < Date.now()) {
        setCallBackError(true);
        return setError("That time has already passed — pick a time in the future.");
      }
      followUpAt = d.toISOString();
    }
    setError(null);
    setSaving(true);
    try {
      const err = await onSave(reason, note.trim() || undefined, followUpAt);
      if (err) setError(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <DialogShell
      title="Couldn't book"
      intro={`Close ${patient ? `${patient}'s` : "this"} request without an appointment. It stays in the history, and you can reopen it later.`}
      onCancel={onCancel}
      saving={saving}
    >
      <form onSubmit={submit} noValidate className="px-6 pb-6 space-y-3">
        <div role="radiogroup" aria-label="Reason" className="grid grid-cols-2 gap-1.5">
          {NOT_BOOKED_REASONS.map((r) => {
            const active = reason === r.value;
            return (
              <label
                key={r.value}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-[13px] cursor-pointer transition-colors ${
                  active ? "bg-brand-100 border-brand text-brand-fg font-semibold" : "border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
              >
                <input
                  type="radio"
                  name="not-booked-reason"
                  value={r.value}
                  checked={active}
                  onChange={() => { setReason(r.value); setError(null); setNoteError(false); setCallBackError(false); }}
                  className="accent-brand"
                />
                {r.label}
              </label>
            );
          })}
        </div>
        {reason === "CALL_BACK_LATER" && (
          <div className="space-y-1.5">
            <span className={labelCls}>Call them back on <span className="font-normal text-red-500">(required)</span></span>
            <div className="flex flex-wrap gap-1.5">
              {picks.map((p) => {
                const v = toDateTimeInput(p.at);
                return (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => { setCallBack(v); setCallBackError(false); setError(null); }}
                    className={`text-[12px] px-2.5 py-1 rounded-full border transition-colors cursor-pointer ${callBack === v ? "bg-brand-200 border-brand text-brand-fg font-semibold" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
            <input
              type="datetime-local"
              aria-label="Call them back on"
              value={callBack}
              onChange={(e) => { setCallBack(e.target.value); setCallBackError(false); }}
              aria-invalid={callBackError}
              className={callBackError ? inputErrCls : inputCls}
            />
            {callBack && !Number.isNaN(new Date(callBack).getTime()) && (
              <p className="text-[12px] text-gray-400">{fmtWhen(new Date(callBack).toISOString())}</p>
            )}
          </div>
        )}
        {reason && (
          <p className="text-[12px] text-gray-500 bg-gray-50 border border-gray-100 rounded-lg px-2.5 py-1.5">{CHAT_HINT[reason]}</p>
        )}
        <label className="block">
          <span className={labelCls}>
            Note {reason === "OTHER" ? <span className="font-normal text-red-500">(required)</span> : <span className="font-normal text-gray-400">(optional)</span>}
          </span>
          <textarea
            value={note}
            onChange={(e) => { setNote(e.target.value); setNoteError(false); }}
            rows={3}
            maxLength={1000}
            aria-invalid={noteError}
            placeholder={reason === "CALL_BACK_LATER" ? "e.g. Will call after payday, try again on the 28th" : "e.g. Wants a female doctor, none free this month"}
            className={`${noteError ? inputErrCls : inputCls} resize-y`}
          />
        </label>
        {error && <p role="alert" className="text-[13px] text-red-500 font-medium">{error}</p>}
        <DialogButtons saving={saving} onCancel={onCancel} label="Close request" />
      </form>
    </DialogShell>
  );
}
