"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Moon } from "lucide-react";
import { apiGetSettings, apiSaveQuietHours } from "@/lib/api";
import type { QuietHoursSetting } from "@/types";
import { useToast } from "@/components/ui/toast";
import { PageSpinner } from "@/components/ui/spinner";
import {
  LoadError,
  SectionCard,
  Toggle,
  errorMessage,
  inputCls,
  labelCls,
  primaryBtnCls,
} from "@/components/settings/shared";

// The server stores "HH:MM", 24-hour. A plain text field rather than
// <input type="time">, which shows AM/PM in an en-US browser.
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

const DEFAULT_TZ = "Asia/Dubai";

export function QuietHoursPanel() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [source, setSource] = useState<QuietHoursSetting["source"]>("settings");
  const [enabled, setEnabled] = useState(true);
  const [start, setStart] = useState("21:00");
  const [end, setEnd] = useState("09:00");
  const [timezone, setTimezone] = useState(DEFAULT_TZ);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Plain promise callbacks (not an async function called from the effect),
  // so no state is set synchronously inside the effect.
  const load = useCallback(() => {
    return apiGetSettings()
      .then((res) => {
        const qh = res.data.quietHours;
        setEnabled(qh.enabled);
        setStart(qh.start);
        setEnd(qh.end);
        setTimezone(qh.timezone || DEFAULT_TZ);
        setSource(qh.source);
        setLoadError(null);
      })
      .catch((err) => setLoadError(errorMessage(err, "Couldn't load quiet hours.")))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Every IANA zone the browser knows, with the saved one kept even if it
  // somehow isn't in the list.
  const zones = useMemo(() => {
    let all: string[] = [];
    try {
      all = Intl.supportedValuesOf("timeZone");
    } catch {
      all = [DEFAULT_TZ];
    }
    return all.includes(timezone) ? all : [timezone, ...all];
  }, [timezone]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const s = start.trim();
    const en = end.trim();
    if (!HHMM.test(s) || !HHMM.test(en)) { setError("Start and end must be 24-hour times like 21:00."); return; }
    if (s === en) { setError("Start and end can't be the same time."); return; }
    setSaving(true);
    setError(null);
    try {
      const res = await apiSaveQuietHours({ enabled, start: s, end: en, timezone });
      setStart(res.data.start);
      setEnd(res.data.end);
      setTimezone(res.data.timezone);
      setEnabled(res.data.enabled);
      setSource("settings");
      toast.success("Quiet hours saved");
    } catch (err) {
      setError(errorMessage(err, "Failed to save quiet hours"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <PageSpinner label="Loading quiet hours" />;
  if (loadError) return <div className="px-6 py-6"><LoadError message={loadError} onRetry={() => { setLoading(true); load(); }} /></div>;

  return (
    <div className="px-6 py-6 max-w-2xl">
      <form onSubmit={handleSave}>
        <SectionCard
          title="Quiet hours"
          description="No campaign messages are sent inside this window. Inbox replies are not affected."
        >
          <div className="space-y-5">
            {source === "server" && (
              <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[12px] text-gray-500">
                Using the server default until you save.
              </div>
            )}

            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[13px] font-semibold text-gray-700">Quiet hours on</p>
                <p className="text-[12px] text-gray-400 mt-0.5">Turn off to let campaigns send at any time of day.</p>
              </div>
              <Toggle checked={enabled} onChange={setEnabled} label="Quiet hours on" />
            </div>

            <div className={`grid grid-cols-1 sm:grid-cols-3 gap-4 ${enabled ? "" : "opacity-50"}`}>
              <div>
                <label className={labelCls}>Starts</label>
                <input type="text" value={start} onChange={(e) => setStart(e.target.value)} placeholder="21:00" maxLength={5} disabled={!enabled} className={`${inputCls} font-mono`} />
              </div>
              <div>
                <label className={labelCls}>Ends</label>
                <input type="text" value={end} onChange={(e) => setEnd(e.target.value)} placeholder="09:00" maxLength={5} disabled={!enabled} className={`${inputCls} font-mono`} />
              </div>
              <div>
                <label className={labelCls}>Time zone</label>
                <select value={timezone} onChange={(e) => setTimezone(e.target.value)} disabled={!enabled} className={`${inputCls} cursor-pointer`}>
                  {zones.map((z) => (
                    <option key={z} value={z}>{z}</option>
                  ))}
                </select>
              </div>
            </div>
            <p className="text-[12px] text-gray-400 -mt-2">24-hour times. A window that ends earlier than it starts runs overnight.</p>

            {/* What it means in practice */}
            <div className="flex items-start gap-3 bg-[#EEF6F1] rounded-xl px-4 py-3">
              <Moon className="w-4 h-4 text-[#3B694C] shrink-0 mt-0.5" />
              <ul className="text-[12px] text-gray-600 space-y-1">
                <li>A campaign that reaches quiet hours pauses, and continues by itself when they end.</li>
                <li>Scheduling a campaign to start inside quiet hours is refused.</li>
              </ul>
            </div>

            {error && <p className="text-[13px] text-red-500 font-medium">{error}</p>}

            <div className="flex justify-end">
              <button type="submit" disabled={saving} className={primaryBtnCls}>
                {saving ? "Saving…" : "Save quiet hours"}
              </button>
            </div>
          </div>
        </SectionCard>
      </form>
    </div>
  );
}
