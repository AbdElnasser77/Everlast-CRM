"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { AppointmentInput } from "@/types";
import { fmtWhen, localToIso, nextHalfHour, toDateInput, toTimeInput } from "@/lib/chatOutcome";
import { preferredDateInput, preferredTimeInput, requestService } from "@/lib/bookingRequests";
import { DialogButtons, DialogShell, inputCls, inputErrCls, labelCls } from "@/components/bookings/DialogShell";

const MAX_ROWS = 10;
// Row keys: only need to be unique within the page.
let rowSeq = 0;

type Row = { key: number; service: string; date: string; time: string; doctor: string; dok32Ref: string; note: string };
type RowErrors = { service?: string; when?: string };

/**
 * Record what was booked in Dok32: one or more appointments (laser + cleaning,
 * or two family members). Service, date and time are required; doctor, the
 * Dok32 reference and a note are optional. Prefilled from what the patient
 * asked for when that parses.
 *
 * onSave returns the server's refusal (shown here, e.g. "Enter the service
 * (appointment 2)") or null when saved — the caller closes the dialog.
 */
export function BookDialog({
  requested,
  patient,
  adding = false,
  onCancel,
  onSave,
}: {
  requested?: Record<string, unknown> | null;
  /** "Sara Ahmed" — named in the intro when known. */
  patient?: string | null;
  /** The request is already booked; these are extra appointments. */
  adding?: boolean;
  onCancel: () => void;
  onSave: (appointments: AppointmentInput[]) => Promise<string | null>;
}) {
  const [start] = useState(() => nextHalfHour());
  const today = toDateInput(new Date());

  const blankRow = (from?: Row): Row => ({
    key: ++rowSeq,
    service: "",
    date: from?.date ?? toDateInput(start),
    time: from?.time ?? toTimeInput(start),
    doctor: from?.doctor ?? "",
    dok32Ref: "",
    note: "",
  });

  const [rows, setRows] = useState<Row[]>(() => {
    const first = blankRow();
    if (!adding) {
      first.service = requestService({ requested: requested ?? {} }) ?? "";
      const d = preferredDateInput(requested);
      const t = preferredTimeInput(requested);
      if (d) first.date = d;
      // A preferred day other than today starts at a sensible hour, not "now + 30m".
      if (t) first.time = t;
      else if (d && d !== toDateInput(start)) first.time = "10:00";
    }
    return [first];
  });
  const [errors, setErrors] = useState<Record<number, RowErrors>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const update = (key: number, patch: Partial<Row>) => {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    setErrors((es) => {
      if (!es[key]) return es;
      const next = { ...es[key] };
      if ("service" in patch) delete next.service;
      if ("date" in patch || "time" in patch) delete next.when;
      return { ...es, [key]: next };
    });
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<number, RowErrors> = {};
    const appointments: AppointmentInput[] = [];
    for (const r of rows) {
      const re: RowErrors = {};
      if (!r.service.trim()) re.service = "Enter the service.";
      const at = localToIso(r.date, r.time);
      if (!at) re.when = "Pick the date and time.";
      else if (new Date(at).getTime() < Date.now()) re.when = "That time has already passed.";
      if (re.service || re.when) errs[r.key] = re;
      else {
        appointments.push({
          service: r.service.trim(),
          appointmentAt: at!,
          doctor: r.doctor.trim() || undefined,
          dok32Ref: r.dok32Ref.trim() || undefined,
          note: r.note.trim() || undefined,
        });
      }
    }
    setErrors(errs);
    if (Object.keys(errs).length) {
      setServerError(rows.length > 1 ? "Fix the highlighted appointments." : null);
      return;
    }
    setServerError(null);
    setSaving(true);
    try {
      const err = await onSave(appointments);
      if (err) setServerError(err);
    } finally {
      setSaving(false);
    }
  }

  const n = rows.length;
  const intro = adding
    ? `Add appointments to ${patient ? `${patient}'s` : "this"} booking — e.g. something they added later.`
    : `Book it in Dok32 first, then record it here${patient ? ` for ${patient}` : ""}. Add a row per appointment — a second service or a family member.`;

  return (
    <DialogShell title={adding ? "Add appointments" : "Record the booking"} intro={intro} onCancel={onCancel} saving={saving} width="w-[620px]">
      <form onSubmit={submit} noValidate className="flex flex-col min-h-0">
        <div className="px-6 overflow-y-auto min-h-0 space-y-3 pb-2 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-[#3B694C]/25 [&::-webkit-scrollbar-thumb]:rounded-full">
          {rows.map((r, i) => {
            const re = errors[r.key] ?? {};
            const at = localToIso(r.date, r.time);
            return (
              <fieldset key={r.key} aria-label={n > 1 ? `Appointment ${i + 1}` : "Appointment"} className={`rounded-xl border p-3.5 ${re.service || re.when ? "border-red-200 bg-red-50/30" : "border-gray-200 bg-[#FAFBFA]"}`}>
                <div className="flex items-center gap-2 mb-2.5">
                  <p className="flex-1 text-[12px] font-bold text-gray-700">
                    {n > 1 ? `Appointment ${i + 1}` : "Appointment"}
                    {at && !re.when && <span className="ml-1.5 font-normal text-gray-400">· {fmtWhen(at)}</span>}
                  </p>
                  {n > 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        setRows((rs) => rs.filter((x) => x.key !== r.key));
                        setErrors((es) => { const next = { ...es }; delete next[r.key]; return next; });
                      }}
                      title={`Remove appointment ${i + 1}`}
                      className="w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
                  <label className="col-span-2">
                    <span className={labelCls}>Service</span>
                    <input
                      value={r.service}
                      onChange={(e) => update(r.key, { service: e.target.value })}
                      maxLength={200}
                      placeholder="e.g. Laser hair removal"
                      aria-invalid={!!re.service}
                      autoFocus={i === 0 && !r.service}
                      className={re.service ? inputErrCls : inputCls}
                    />
                    {re.service && <span className="mt-1 block text-[12px] text-red-500 font-medium">{re.service}</span>}
                  </label>
                  <label>
                    <span className={labelCls}>Date</span>
                    <input type="date" value={r.date} min={today} onChange={(e) => update(r.key, { date: e.target.value })} aria-invalid={!!re.when} className={re.when ? inputErrCls : inputCls} />
                  </label>
                  <label>
                    <span className={labelCls}>Time</span>
                    <input type="time" step={300} value={r.time} onChange={(e) => update(r.key, { time: e.target.value })} aria-invalid={!!re.when} className={re.when ? inputErrCls : inputCls} />
                  </label>
                  {re.when && <p className="col-span-2 -mt-1 text-[12px] text-red-500 font-medium">{re.when}</p>}
                  <label>
                    <span className={labelCls}>Doctor <span className="font-normal text-gray-400">(optional)</span></span>
                    <input value={r.doctor} onChange={(e) => update(r.key, { doctor: e.target.value })} maxLength={120} placeholder="e.g. Dr. Sara" className={inputCls} />
                  </label>
                  <label>
                    <span className={labelCls}>Dok32 reference <span className="font-normal text-gray-400">(optional)</span></span>
                    <input value={r.dok32Ref} onChange={(e) => update(r.key, { dok32Ref: e.target.value })} maxLength={100} placeholder="e.g. 48213" className={inputCls} />
                  </label>
                  <label className="col-span-2">
                    <span className={labelCls}>Note <span className="font-normal text-gray-400">(optional)</span></span>
                    <input value={r.note} onChange={(e) => update(r.key, { note: e.target.value })} maxLength={1000} placeholder="e.g. First visit, bring previous X-rays" className={inputCls} />
                  </label>
                </div>
              </fieldset>
            );
          })}

          <button
            type="button"
            disabled={n >= MAX_ROWS}
            onClick={() => setRows((rs) => [...rs, blankRow(rs[rs.length - 1])])}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-dashed border-[#3B694C]/40 text-[13px] font-semibold text-[#3B694C] hover:bg-[#EEF6F1] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          >
            <Plus className="w-4 h-4" />
            {n >= MAX_ROWS ? `Up to ${MAX_ROWS} appointments at a time` : "Add another appointment"}
          </button>
        </div>

        <div className="px-6 pb-6 pt-3 border-t border-gray-100 mt-1 shrink-0 space-y-3">
          {serverError && <p role="alert" className="text-[13px] text-red-500 font-medium">{serverError}</p>}
          <DialogButtons saving={saving} onCancel={onCancel} label={n > 1 ? `Save ${n} appointments` : "Save booking"} />
        </div>
      </form>
    </DialogShell>
  );
}
