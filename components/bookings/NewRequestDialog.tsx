"use client";

import { useState } from "react";
import { toDateInput } from "@/lib/chatOutcome";
import { DialogButtons, DialogShell, inputCls, labelCls } from "@/components/bookings/DialogShell";

/**
 * The patient asked to book in chat (not through the booking flow): open a
 * request for it. Everything is optional — it starts In progress, yours.
 */
export function NewRequestDialog({
  onCancel,
  onSave,
}: {
  onCancel: () => void;
  onSave: (body: { service?: string; preferredDate?: string; note?: string }) => Promise<string | null>;
}) {
  const [service, setService] = useState("");
  const [preferredDate, setPreferredDate] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const err = await onSave({
        service: service.trim() || undefined,
        preferredDate: preferredDate || undefined,
        note: note.trim() || undefined,
      });
      if (err) setError(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <DialogShell
      title="New booking request"
      intro="The patient asked to book in chat. This opens a request on the Bookings page, assigned to you."
      onCancel={onCancel}
      saving={saving}
    >
      <form onSubmit={submit} className="px-6 pb-6 space-y-3">
        <label className="block">
          <span className={labelCls}>Service <span className="font-normal text-gray-400">(optional)</span></span>
          <input autoFocus value={service} onChange={(e) => setService(e.target.value)} maxLength={200} placeholder="e.g. Teeth whitening" className={inputCls} />
        </label>
        <label className="block">
          <span className={labelCls}>Preferred date <span className="font-normal text-gray-400">(optional)</span></span>
          <input type="date" value={preferredDate} min={toDateInput(new Date())} onChange={(e) => setPreferredDate(e.target.value)} className={inputCls} />
        </label>
        <label className="block">
          <span className={labelCls}>Note <span className="font-normal text-gray-400">(optional)</span></span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={1000} placeholder="e.g. Prefers evenings, asked about the offer price" className={`${inputCls} resize-y`} />
        </label>
        {error && <p role="alert" className="text-[13px] text-red-500 font-medium">{error}</p>}
        <DialogButtons saving={saving} onCancel={onCancel} label="Open request" />
      </form>
    </DialogShell>
  );
}
