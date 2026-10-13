"use client";

import { useState, useEffect, useCallback } from "react";
import { apiGetSettings, apiSaveCampaignSafety } from "@/lib/api";
import type { CampaignSafetySetting } from "@/types";
import { useToast } from "@/components/ui/toast";
import { PageSpinner } from "@/components/ui/spinner";
import {
  LoadError,
  SectionCard,
  Toggle,
  errorMessage,
  inputCls,
  primaryBtnCls,
} from "@/components/settings/shared";

const MAX_CAP_DAYS = 90;

// One radio-style choice, same look as the role cards on the Users tab.
function LevelCard({
  selected,
  disabled,
  title,
  blurb,
  onSelect,
}: {
  selected: boolean;
  disabled: boolean;
  title: string;
  blurb: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={`border rounded-lg p-3 flex items-center gap-2 transition-all cursor-pointer text-left w-full disabled:cursor-not-allowed ${
        selected ? "border-brand bg-brand-100" : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
      }`}
    >
      <div
        className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
          selected ? "border-brand" : "border-gray-300"
        }`}
      >
        {selected && <div className="w-2 h-2 rounded-full bg-brand" />}
      </div>
      <div>
        <p className={`text-[13px] font-semibold ${selected ? "text-brand-fg" : "text-gray-700"}`}>{title}</p>
        <p className="text-[11px] text-gray-400 leading-tight mt-0.5">{blurb}</p>
      </div>
    </button>
  );
}

export function CampaignSafetyPanel() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Kept as text so the field can be emptied while typing; parsed on save.
  const [capDays, setCapDays] = useState("0");
  const [autoPause, setAutoPause] = useState(true);
  const [pauseAt, setPauseAt] = useState<CampaignSafetySetting["qualityPauseAt"]>("YELLOW");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Plain promise callbacks (not an async function called from the effect),
  // so no state is set synchronously inside the effect.
  const load = useCallback(() => {
    return apiGetSettings()
      .then((res) => {
        const cs = res.data.campaignSafety;
        setCapDays(String(cs.frequencyCapDays));
        setAutoPause(cs.qualityAutoPause);
        setPauseAt(cs.qualityPauseAt);
        setLoadError(null);
      })
      .catch((err) => setLoadError(errorMessage(err, "Couldn't load campaign safety.")))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const days = capDays.trim() === "" ? 0 : Number(capDays);
    if (!Number.isInteger(days) || days < 0 || days > MAX_CAP_DAYS) {
      setError(`The limit must be a whole number of days between 0 (no limit) and ${MAX_CAP_DAYS}.`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await apiSaveCampaignSafety({ frequencyCapDays: days, qualityAutoPause: autoPause, qualityPauseAt: pauseAt });
      setCapDays(String(res.data.frequencyCapDays));
      setAutoPause(res.data.qualityAutoPause);
      setPauseAt(res.data.qualityPauseAt);
      toast.success("Campaign safety saved");
    } catch (err) {
      setError(errorMessage(err, "Failed to save campaign safety"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <PageSpinner label="Loading campaign safety" />;
  if (loadError) return <div className="px-6 py-6"><LoadError message={loadError} onRetry={() => { setLoading(true); load(); }} /></div>;

  return (
    <div className="px-6 py-6 max-w-2xl">
      <form onSubmit={handleSave} className="space-y-4">
        {/* Frequency cap */}
        <SectionCard
          title="How often a patient can get a campaign"
          description="Too many marketing messages get a number reported or blocked. This keeps every patient below a limit."
        >
          <div className="flex items-center gap-2 flex-wrap text-[14px] text-gray-700">
            <span>At most one campaign per patient every</span>
            <input
              type="number"
              min={0}
              max={MAX_CAP_DAYS}
              value={capDays}
              onChange={(e) => setCapDays(e.target.value)}
              className={`${inputCls} w-20 px-3 py-2 text-center`}
            />
            <span>days</span>
          </div>
          <p className="text-[12px] text-gray-400 mt-2">
            0 = no limit (max {MAX_CAP_DAYS}). Patients over the limit are skipped and show as Skipped in the campaign, with the reason.
          </p>
        </SectionCard>

        {/* Quality auto-pause */}
        <SectionCard
          title="Protect the number's quality"
          description="Meta rates every number GREEN, YELLOW or RED. A RED number gets its messaging limit cut or is banned."
        >
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[13px] font-semibold text-gray-700">Pause campaigns when the number&apos;s quality drops</p>
                <p className="text-[12px] text-gray-400 mt-0.5">
                  Running campaigns on that number pause, and new ones can&apos;t start until quality recovers. Quality is
                  checked every 30 minutes and admins are alerted.
                </p>
              </div>
              <Toggle checked={autoPause} onChange={setAutoPause} label="Pause campaigns when quality drops" />
            </div>

            <div className={`grid grid-cols-2 gap-3 ${autoPause ? "" : "opacity-50"}`}>
              <LevelCard
                selected={pauseAt === "YELLOW"}
                disabled={!autoPause}
                title="At YELLOW (recommended)"
                blurb="Stop early, while there's still time to recover"
                onSelect={() => setPauseAt("YELLOW")}
              />
              <LevelCard
                selected={pauseAt === "RED"}
                disabled={!autoPause}
                title="Only at RED"
                blurb="Keep sending through YELLOW"
                onSelect={() => setPauseAt("RED")}
              />
            </div>
          </div>
        </SectionCard>

        {error && <p className="text-[13px] text-red-500 font-medium">{error}</p>}

        <div className="flex justify-end">
          <button type="submit" disabled={saving} className={primaryBtnCls}>
            {saving ? "Saving…" : "Save campaign safety"}
          </button>
        </div>
      </form>
    </div>
  );
}
