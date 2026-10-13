"use client";

import { useEffect, useMemo, useState } from "react";
import { ApiError, apiGetBookingSourceOptions } from "@/lib/api";
import type { BookingRequest, BookingSourceOptions, LeadSource, LeadSourceInput } from "@/types";
import {
  LEAD_SOURCE_LABEL, LEAD_SOURCE_ORDER, type SourceDraft, type SourceFields,
  requestSourceInfo, sourceDraftFrom, sourceInputFrom,
} from "@/lib/bookingRequests";
import { DialogButtons, DialogShell, inputCls, inputErrCls, labelCls } from "@/components/bookings/DialogShell";

type CampaignOption = BookingSourceOptions["campaigns"][number];

/** The line's lead sources and recent campaigns, for the picker. Falls back to built-in labels. */
export function useSourceOptions() {
  const [options, setOptions] = useState<BookingSourceOptions | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    apiGetBookingSourceOptions()
      .then((res) => { if (!cancelled) setOptions(res.data); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, []);
  return { options, loading: !options && !failed, failed };
}

/**
 * A save error, split so source refusals (400 SOURCE_REQUIRED and friends)
 * show inside the "Where did this patient come from?" block.
 */
export type SaveError = { message: string; field?: "source" };

export function toSaveError(err: unknown, fallback: string): SaveError {
  const message = err instanceof Error && err.message ? err.message : fallback;
  if (err instanceof ApiError) {
    const code = err.code ?? "";
    const field = err.details?.field ?? "";
    if (/SOURCE|CAMPAIGN/.test(code) || /^(source|leadSource|campaignId)/.test(String(field))) {
      return { message: code === "SOURCE_REQUIRED" && !err.message ? "Choose where this patient came from." : message, field: "source" };
    }
  }
  return { message };
}

/**
 * Lead source choices as a segmented list; "A campaign" adds a campaign
 * select, "Other" a note. `extraCampaigns` makes sure the request's credited /
 * suggested campaign is choosable even when it's older than the list.
 */
export function LeadSourcePicker({
  draft,
  onChange,
  options,
  loading,
  extraCampaigns = [],
  error,
  idPrefix = "src",
}: {
  draft: SourceDraft;
  onChange: (d: SourceDraft) => void;
  options: BookingSourceOptions | null;
  loading?: boolean;
  extraCampaigns?: ({ id: number; name: string } | null | undefined)[];
  error?: string | null;
  idPrefix?: string;
}) {
  const sources = useMemo<{ value: LeadSource; label: string }[]>(() => {
    if (options?.leadSources?.length) return options.leadSources;
    return LEAD_SOURCE_ORDER.map((value) => ({ value, label: LEAD_SOURCE_LABEL[value] }));
  }, [options]);

  const campaigns = useMemo<CampaignOption[]>(() => {
    const list: CampaignOption[] = [...(options?.campaigns ?? [])];
    for (const c of extraCampaigns) {
      if (c && !list.some((x) => x.id === c.id)) list.unshift({ id: c.id, name: c.name, startedAt: null });
    }
    return list;
  }, [options, extraCampaigns]);

  const needCampaign = draft.leadSource === "CAMPAIGN" && !draft.campaignId;
  const needNote = draft.leadSource === "OTHER" && !draft.note.trim();
  const fmtStarted = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : null;

  return (
    <div className="space-y-2.5">
      <div role="radiogroup" aria-label="Where did this patient come from?" aria-invalid={!!error && !draft.leadSource} className="flex flex-wrap gap-1.5">
        {sources.map((s) => {
          const on = draft.leadSource === s.value;
          return (
            <button
              key={s.value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange({ ...draft, leadSource: s.value })}
              className={`text-[12px] px-2.5 py-1 rounded-full border transition-colors cursor-pointer ${
                on
                  ? "bg-brand-200 border-brand text-brand-fg font-semibold"
                  : error && !draft.leadSource
                    ? "border-red-300 text-gray-600 hover:bg-gray-50"
                    : "border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      {draft.leadSource === "CAMPAIGN" && (
        <label className="block">
          <span className={labelCls}>Which campaign?</span>
          <select
            id={`${idPrefix}-campaign`}
            value={draft.campaignId ?? ""}
            onChange={(e) => onChange({ ...draft, campaignId: e.target.value ? Number(e.target.value) : null })}
            aria-invalid={!!error && needCampaign}
            className={error && needCampaign ? inputErrCls : inputCls}
          >
            <option value="">{loading ? "Loading campaigns…" : campaigns.length ? "Pick the campaign" : "No recent campaigns on this line"}</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}{fmtStarted(c.startedAt) ? ` · ${fmtStarted(c.startedAt)}` : ""}
              </option>
            ))}
          </select>
        </label>
      )}

      {draft.leadSource === "OTHER" && (
        <label className="block">
          <span className={labelCls}>Where from?</span>
          <input
            id={`${idPrefix}-note`}
            value={draft.note}
            onChange={(e) => onChange({ ...draft, note: e.target.value })}
            maxLength={200}
            placeholder="e.g. Saw our sign at the mall"
            aria-invalid={!!error && needNote}
            className={error && needNote ? inputErrCls : inputCls}
          />
        </label>
      )}

      {error && <p role="alert" className="text-[12px] text-red-500 font-medium">{error}</p>}
    </div>
  );
}

/** Set or correct where a request's patient came from (it becomes CONFIRMED). */
export function ChangeSourceDialog({
  req,
  onCancel,
  onSave,
}: {
  req: BookingRequest;
  onCancel: () => void;
  onSave: (source: LeadSourceInput) => Promise<SaveError | null>;
}) {
  const { options, loading } = useSourceOptions();
  const [draft, setDraft] = useState<SourceDraft>(() => sourceDraftFrom(req));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const current = requestSourceInfo(req);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = sourceInputFrom(draft);
    if (!v.ok) return setError(v.error);
    setError(null);
    setSaving(true);
    try {
      const err = await onSave(v.input);
      if (err) setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <DialogShell
      title="Where did this patient come from?"
      intro={<>Now: <span className="font-semibold text-gray-700">{current.text}</span>. What you pick here is what counts — the request&apos;s appointments follow it.</>}
      onCancel={onCancel}
      saving={saving}
      width="w-[480px]"
    >
      <form onSubmit={submit} noValidate className="px-6 pb-6 space-y-4">
        <LeadSourcePicker
          draft={draft}
          onChange={(d) => { setDraft(d); setError(null); }}
          options={options}
          loading={loading}
          extraCampaigns={[req.campaign, req.suggestedCampaign]}
          error={error}
          idPrefix={`chg-${req.id}`}
        />
        <DialogButtons saving={saving} onCancel={onCancel} label="Save source" />
      </form>
    </DialogShell>
  );
}

/** Just the fields the Book dialog reads about a request's source. */
export type BookSourceState = Partial<SourceFields> | null;
