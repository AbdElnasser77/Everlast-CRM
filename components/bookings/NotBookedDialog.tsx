"use client";

import { useState } from "react";
import type { NotBookedReason } from "@/types";
import { NOT_BOOKED_REASONS } from "@/lib/bookingRequests";
import { DialogButtons, DialogShell, inputCls, inputErrCls, labelCls } from "@/components/bookings/DialogShell";

/**
 * Close a booking request without an appointment: why, and a note (required
 * for "Other"). onSave returns the server's refusal (e.g. it still has live
 * appointments) or null when saved.
 */
export function NotBookedDialog({
  patient,
  onCancel,
  onSave,
}: {
  patient?: string | null;
  onCancel: () => void;
  onSave: (reason: NotBookedReason, note?: string) => Promise<string | null>;
}) {
  const [reason, setReason] = useState<NotBookedReason | null>(null);
  const [note, setNote] = useState("");
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
    setError(null);
    setSaving(true);
    try {
      const err = await onSave(reason, note.trim() || undefined);
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
                  onChange={() => { setReason(r.value); setError(null); setNoteError(false); }}
                  className="accent-brand"
                />
                {r.label}
              </label>
            );
          })}
        </div>
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
