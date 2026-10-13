"use client";

import { useState } from "react";
import { CircleCheck, Plus, Sparkles, Trash2 } from "lucide-react";
import type { AppointmentInput, LeadSourceInput } from "@/types";
import { fmtWhen, localToIso, nextHalfHour, toDateInput, toTimeInput } from "@/lib/chatOutcome";
import {
  type SourceDraft, preferredDateInput, preferredTimeInput, provenHow, requestService, requestSourceInfo,
  sourceDraftFrom, sourceInputFrom, sourceKnown,
} from "@/lib/bookingRequests";
import { DialogButtons, DialogShell, inputCls, inputErrCls, labelCls } from "@/components/bookings/DialogShell";
import { type BookSourceState, LeadSourcePicker, type SaveError, useSourceOptions } from "@/components/bookings/LeadSourcePicker";

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
 * Above the appointments: "Where did this patient come from?". Proven
 * (AUTOMATIC) or already confirmed sources show as a line with "Change"; a
 * SUGGESTED campaign is preselected for the agent to confirm or change;
 * nothing known means the picker is required. `source` is passed to onSave
 * unless the request's known source is left unchanged.
 *
 * onSave returns the server's refusal (shown here, e.g. "Enter the service
 * (appointment 2)"; source refusals show in the source block) or null when
 * saved — the caller closes the dialog.
 */
export function BookDialog({
  requested,
  patient,
  adding = false,
  sourceRequest = null,
  onCancel,
  onSave,
}: {
  requested?: Record<string, unknown> | null;
  /** "Sara Ahmed" — named in the intro when known. */
  patient?: string | null;
  /** The request is already booked; these are extra appointments. */
  adding?: boolean;
  onCancel: () => void;
  /** The request's source state; null when booking a chat that has no request yet. */
  sourceRequest?: BookSourceState;
  onSave: (appointments: AppointmentInput[], source?: LeadSourceInput) => Promise<string | SaveError | null>;
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

  // Where the patient came from.
  const { options, loading: optionsLoading } = useSourceOptions();
  const known = sourceKnown(sourceRequest);
  const [initialDraft] = useState<SourceDraft>(() => sourceDraftFrom(sourceRequest));
  const [draft, setDraft] = useState<SourceDraft>(initialDraft);
  const [changing, setChanging] = useState(!known);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const suggested = sourceRequest?.sourceStatus === "SUGGESTED" || (!known && !sourceRequest?.leadSource && !!sourceRequest?.suggestedCampaign);
  const unchanged =
    draft.leadSource === initialDraft.leadSource &&
    draft.campaignId === initialDraft.campaignId &&
    draft.note.trim() === initialDraft.note.trim();

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
    // The source: omitted when the request's proven/confirmed one is left as is.
    let source: LeadSourceInput | undefined;
    let srcErr: string | null = null;
    if (changing && !(known && unchanged)) {
      const v = sourceInputFrom(draft);
      if (v.ok) source = v.input;
      else srcErr = v.error;
    }
    setErrors(errs);
    setSourceError(srcErr);
    if (Object.keys(errs).length || srcErr) {
      setServerError(Object.keys(errs).length && rows.length > 1 ? "Fix the highlighted appointments." : null);
      return;
    }
    setServerError(null);
    setSaving(true);
    try {
      const err = await onSave(appointments, source);
      if (typeof err === "string") setServerError(err);
      else if (err?.field === "source") { setChanging(true); setSourceError(err.message); }
      else if (err) setServerError(err.message);
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
        <div className="px-6 overflow-y-auto min-h-0 space-y-3 pb-2 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-brand/25 [&::-webkit-scrollbar-thumb]:rounded-full">
          <section aria-labelledby="book-source-h" className={`rounded-xl border p-3.5 ${sourceError ? "border-red-200 bg-red-50/30" : "border-gray-200 bg-white"}`}>
            <p id="book-source-h" className="text-[12px] font-bold text-gray-700 mb-2">Where did this patient come from?</p>
            {!changing && sourceRequest ? (
              <KnownSource req={sourceRequest} onChange={() => setChanging(true)} />
            ) : (
              <>
                {suggested && sourceRequest?.suggestedCampaign && (
                  <p className="mb-2.5 flex items-start gap-1.5 text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                    <Sparkles className="w-3.5 h-3.5 mt-px shrink-0" />
                    <span>
                      <span className="font-semibold">Suggested</span> — they received <span className="font-semibold">{sourceRequest.suggestedCampaign.name}</span> recently. Confirm or change.
                    </span>
                  </p>
                )}
                <LeadSourcePicker
                  draft={draft}
                  onChange={(d) => { setDraft(d); setSourceError(null); }}
                  options={options}
                  loading={optionsLoading}
                  extraCampaigns={[sourceRequest?.campaign, sourceRequest?.suggestedCampaign]}
                  error={sourceError}
                  idPrefix="book"
                />
                {known && sourceRequest && (
                  <button
                    type="button"
                    onClick={() => { setChanging(false); setDraft(initialDraft); setSourceError(null); }}
                    className="mt-2 text-[12px] font-medium text-gray-500 hover:text-gray-800 underline-offset-2 hover:underline cursor-pointer"
                  >
                    Keep “{requestSourceInfo(sourceRequest).text}”
                  </button>
                )}
              </>
            )}
          </section>

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
            className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-dashed border-brand/40 text-[13px] font-semibold text-brand-fg hover:bg-brand-100 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
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

/** A proven or already-confirmed source, with "Change". */
function KnownSource({ req, onChange }: { req: NonNullable<BookSourceState>; onChange: () => void }) {
  const info = requestSourceInfo(req);
  const proven = req.sourceStatus === "AUTOMATIC";
  return (
    <div className="flex items-start gap-2 text-[12.5px] text-brand-fg bg-brand-50 border border-brand/20 rounded-lg px-2.5 py-2">
      <CircleCheck className="w-4 h-4 mt-px shrink-0" />
      <p className="flex-1 min-w-0">
        {proven && info.campaign ? (
          <>From campaign <span className="font-semibold">{info.campaign.name}</span> — {provenHow(req).replace(/^They/, "they")}.</>
        ) : (
          <><span className="font-semibold">{info.text.replace(/ · confirmed$/, "")}</span> — confirmed by an agent.</>
        )}
      </p>
      <button type="button" onClick={onChange} className="shrink-0 text-[12px] font-semibold text-brand-fg hover:underline underline-offset-2 cursor-pointer">
        Change
      </button>
    </div>
  );
}
