"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Bot, CheckCircle2, AlertTriangle } from "lucide-react";
import { apiGetSettings, apiSaveAiAssistant } from "@/lib/api";
import type { AiAssistantSetting, AiStatus } from "@/types";
import { useToast } from "@/components/ui/toast";
import { PageSpinner } from "@/components/ui/spinner";
import { useActiveNumber } from "@/components/WhatsAppNumberProvider";
import { AiModelPanel } from "@/components/settings/AiModelPanel";
import {
  LoadError,
  SectionCard,
  Toggle,
  errorMessage,
  inputCls,
  labelCls,
  primaryBtnCls,
} from "@/components/settings/shared";

// The AI assistant that answers patients from the approved knowledge base.
// Off until switched on here for chosen lines; it never answers a chat a flow
// or a person is handling, and hands anything it can't answer to the team.
// A second sub-tab, "AI model & Cloudflare", holds the provider settings.

const SUB_TABS = [
  { key: "assistant", label: "Assistant" },
  { key: "model", label: "AI model & Cloudflare" },
] as const;
type SubTab = (typeof SUB_TABS)[number]["key"];

export function AiAssistantPanel() {
  const [sub, setSub] = useState<SubTab>("assistant");
  return (
    <div className="px-6 py-6 max-w-2xl space-y-5">
      <div role="tablist" aria-label="AI assistant sections" className="inline-flex rounded-xl border border-gray-200 bg-white p-1">
        {SUB_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={sub === t.key}
            onClick={() => setSub(t.key)}
            className={`px-3 py-1.5 rounded-lg text-[13px] font-semibold transition-colors cursor-pointer ${
              sub === t.key ? "bg-brand-100 text-brand-fg" : "text-gray-500 hover:text-gray-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {sub === "assistant" ? <AssistantSettings onOpenModel={() => setSub("model")} /> : <AiModelPanel />}
    </div>
  );
}

function AssistantSettings({ onOpenModel }: { onOpenModel: () => void }) {
  const toast = useToast();
  const { numbers } = useActiveNumber();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<AiAssistantSetting | null>(null);
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    return apiGetSettings()
      .then((res) => {
        setForm(res.data.aiAssistant);
        setStatus(res.data.aiStatus);
        setLoadError(null);
      })
      .catch((err) => setLoadError(errorMessage(err, "Couldn't load the AI assistant settings.")))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const set = <K extends keyof AiAssistantSetting>(key: K, value: AiAssistantSetting[K]) =>
    setForm((f) => (f ? { ...f, [key]: value } : f));

  function toggleLine(id: number) {
    if (!form) return;
    set("numberIds", form.numberIds.includes(id) ? form.numberIds.filter((n) => n !== id) : [...form.numberIds, id]);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    if (!form.assistantName.trim() || !form.handoffMessage.trim() || !form.urgentMessage.trim()) {
      setError("The name, the hand-over message and the urgent message are required.");
      return;
    }
    const hours = Number(form.quietAfterAgentReplyHours);
    if (!Number.isInteger(hours) || hours < 0 || hours > 168) {
      setError("Quiet after a team reply must be a whole number of hours between 0 and 168.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await apiSaveAiAssistant({ ...form, quietAfterAgentReplyHours: hours });
      setForm(res.data);
      toast.success("AI assistant settings saved");
    } catch (err) {
      setError(errorMessage(err, "Failed to save the AI assistant settings"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <PageSpinner label="Loading AI assistant settings" />;
  if (loadError || !form) {
    return <LoadError message={loadError || "No data"} onRetry={() => { setLoading(true); load(); }} />;
  }

  const activeLines = numbers.filter((n) => n.isActive);
  // A line that was chosen and since switched off still shows, so it can be unticked.
  const lines = [...activeLines, ...numbers.filter((n) => !n.isActive && form.numberIds.includes(n.id))];
  const ready = Boolean(status?.configured);

  return (
    <div className="space-y-5">
      {/* Can it work at all? */}
      <div className={`flex items-start gap-3 rounded-2xl border px-5 py-4 ${ready ? "bg-white border-gray-200" : "bg-amber-50 border-amber-200"}`}>
        {ready ? <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" /> : <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />}
        <div className="text-[13px]">
          <p className="font-semibold text-gray-800">
            {ready ? "Cloudflare AI is configured" : "Cloudflare AI isn't configured yet"}
          </p>
          <p className="text-[12px] text-gray-500 mt-0.5">
            {ready
              ? `Model ${status?.chatModel} · search ${status?.embedModel}`
              : "Add the Cloudflare account ID and API token under AI model & Cloudflare. Until then the assistant stays silent."}{" "}
            <button type="button" onClick={onOpenModel} className="font-semibold text-brand-fg hover:underline cursor-pointer">
              {ready ? "Change model" : "Set it up"}
            </button>
          </p>
          <p className="text-[12px] text-gray-500 mt-1">
            {status?.approved == null
              ? "Couldn't count the knowledge base articles."
              : `${status.approved} approved article${status.approved === 1 ? "" : "s"}, ${status.indexed ?? 0} searchable.`}{" "}
            <Link href="/knowledge" className="font-semibold text-brand-fg hover:underline">Open the knowledge base</Link>
          </p>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-5">
        <SectionCard
          title="AI assistant"
          description="Answers patients' questions from the approved knowledge base, and hands everything else to the team."
        >
          <div className="space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[13px] font-semibold text-gray-700">Assistant on</p>
                <p className="text-[12px] text-gray-400 mt-0.5">It only answers on the lines ticked below.</p>
              </div>
              <Toggle checked={form.enabled} onChange={(v) => set("enabled", v)} label="Assistant on" />
            </div>

            <div className={form.enabled ? "" : "opacity-50"}>
              <p className={labelCls}>Lines it answers on</p>
              {lines.length === 0 ? (
                <p className="text-[12px] text-gray-400">No WhatsApp lines yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {lines.map((n) => (
                    <label key={n.id} className="flex items-center gap-2.5 text-[13px] text-gray-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.numberIds.includes(n.id)}
                        onChange={() => toggleLine(n.id)}
                        disabled={!form.enabled}
                        className="w-4 h-4 accent-[var(--color-brand)] cursor-pointer"
                      />
                      <span className="font-medium">{n.label}</span>
                      {n.displayPhoneNumber && <span className="text-gray-400">{n.displayPhoneNumber}</span>}
                      {!n.isActive && <span className="text-[11px] text-amber-700">(switched off)</span>}
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Assistant&apos;s name</label>
                <input type="text" value={form.assistantName} onChange={(e) => set("assistantName", e.target.value)} maxLength={60} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Quiet after a team reply (hours)</label>
                <input
                  type="number"
                  min={0}
                  max={168}
                  value={form.quietAfterAgentReplyHours}
                  onChange={(e) => set("quietAfterAgentReplyHours", e.target.value === "" ? 0 : Number(e.target.value))}
                  className={inputCls}
                />
              </div>
            </div>
            <p className="text-[12px] text-gray-400 -mt-2">
              After someone on the team writes in a chat, the assistant stays out of it for this long. 0 = only while the chat is assigned.
            </p>
          </div>
        </SectionCard>

        <SectionCard title="Messages" description="Sent by the assistant when it hands a patient to the team. Arabic versions go to patients who write in Arabic.">
          <div className="space-y-4">
            <div>
              <label className={labelCls}>Hand-over message</label>
              <textarea dir="auto" rows={2} value={form.handoffMessage} onChange={(e) => set("handoffMessage", e.target.value)} maxLength={1000} className={`${inputCls} resize-y`} />
            </div>
            <div>
              <label className={labelCls}>Hand-over message (Arabic)</label>
              <textarea dir="auto" rows={2} value={form.handoffMessageAr} onChange={(e) => set("handoffMessageAr", e.target.value)} maxLength={1000} className={`${inputCls} resize-y`} />
            </div>
            <div>
              <label className={labelCls}>Urgent message</label>
              <textarea dir="auto" rows={3} value={form.urgentMessage} onChange={(e) => set("urgentMessage", e.target.value)} maxLength={1000} className={`${inputCls} resize-y`} />
              <p className="text-[12px] text-gray-400 mt-1">
                Sent at once when a patient mentions severe pain, swelling, bleeding, fever, breathing trouble and the like — and the team is alerted as urgent.
              </p>
            </div>
            <div>
              <label className={labelCls}>Urgent message (Arabic)</label>
              <textarea dir="auto" rows={3} value={form.urgentMessageAr} onChange={(e) => set("urgentMessageAr", e.target.value)} maxLength={1000} className={`${inputCls} resize-y`} />
            </div>
            <div>
              <label className={labelCls}>Clinic note (optional)</label>
              <textarea
                dir="auto"
                rows={2}
                value={form.outOfHoursNote}
                onChange={(e) => set("outOfHoursNote", e.target.value)}
                maxLength={1000}
                placeholder="e.g. Our team replies between 9am and 9pm, Saturday to Thursday."
                className={`${inputCls} resize-y`}
              />
              <p className="text-[12px] text-gray-400 mt-1">Something the assistant may tell patients, such as when the team replies.</p>
            </div>
          </div>
        </SectionCard>

        <div className="flex items-start gap-3 bg-brand-100 rounded-xl px-4 py-3">
          <Bot className="w-4 h-4 text-brand-fg shrink-0 mt-0.5" />
          <ul className="text-[12px] text-gray-600 space-y-1">
            <li>It never answers a chat that is assigned, in a flow, or opted out.</li>
            <li>Once it hands a chat over it stays silent until the team marks the chat Resolved.</li>
            <li>Its messages show an &quot;AI&quot; badge in the inbox.</li>
          </ul>
        </div>

        {error && <p className="text-[13px] text-red-500 font-medium">{error}</p>}

        <div className="flex justify-end">
          <button type="submit" disabled={saving} className={primaryBtnCls}>
            {saving ? "Saving…" : "Save AI assistant settings"}
          </button>
        </div>
      </form>
    </div>
  );
}
