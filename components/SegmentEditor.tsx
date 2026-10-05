"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Filter, Lock, Megaphone, Save } from "lucide-react";
import SegmentBuilder from "@/components/SegmentBuilder";
import { useToast } from "@/components/ui/toast";
import {
  apiCreateSegment,
  apiGetMe,
  apiGetSegment,
  apiUpdateSegment,
} from "@/lib/api";
import { can } from "@/lib/permissions";
import type { SegmentDefinition, SegmentPreview } from "@/types";

const EMPTY: SegmentDefinition = { match: "ALL", rules: [] };

const inputCls =
  "w-full text-[13px] rounded-xl border border-gray-200 px-3 py-2.5 outline-none focus:ring-2 focus:ring-[#3B694C]/20 focus:border-[#3B694C] transition-colors";

/**
 * The create and edit screens are the same screen — the only difference is
 * whether it starts from a saved row. Keeping them one component means the
 * rule editor, the guardrails and the save path can't drift apart between
 * "new" and "edit", which is where audience bugs like to hide.
 */
export default function SegmentEditor({ segmentId }: { segmentId?: number }) {
  const router = useRouter();
  const toast = useToast();
  const isEdit = segmentId !== undefined;

  const [access, setAccess] = useState<"checking" | "granted" | "denied">("checking");
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [definition, setDefinition] = useState<SegmentDefinition>(EMPTY);
  const [excludeOptedOut, setExcludeOptedOut] = useState(true);
  const [preview, setPreview] = useState<SegmentPreview | null>(null);

  // Editing a segment rewrites what future campaigns will target, so access is
  // checked up front rather than letting someone fill in the whole builder and
  // meet a 403 at save. Gated on the capability the server actually enforces
  // (segment:write) instead of on the ADMIN role — marketing holds that
  // permission, and a role check would lock them out of their own core tool.
  useEffect(() => {
    apiGetMe()
      .then((res) => setAccess(can(res.data, "segment:write") ? "granted" : "denied"))
      .catch(() => setAccess("denied"));
  }, []);

  useEffect(() => {
    if (!isEdit) return;
    apiGetSegment(segmentId)
      .then((res) => {
        const s = res.data;
        setName(s.name);
        setDescription(s.description ?? "");
        setDefinition(s.definition ?? EMPTY);
        setExcludeOptedOut(s.excludeOptedOut);
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : "Couldn't load that segment"))
      .finally(() => setLoading(false));
  }, [isEdit, segmentId, toast]);

  const noRules = definition.rules.length === 0;
  const canSave = !!name.trim() && !noRules && !saving;

  async function handleSave(thenCampaign = false) {
    if (!canSave) return;
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || undefined,
        definition,
        excludeOptedOut,
      };
      const res = isEdit
        ? await apiUpdateSegment(segmentId, payload)
        : await apiCreateSegment(payload);

      toast.success(isEdit ? "Segment updated." : "Segment created.");
      if (thenCampaign) router.push(`/campaigns/new?segmentId=${res.data.id}`);
      else router.push("/customers/segments");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save that segment");
    } finally {
      setSaving(false);
    }
  }

  if (access === "checking" || loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <svg className="w-6 h-6 animate-spin text-[#3B694C]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
      </div>
    );
  }

  if (access === "denied") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3">
        <Lock className="w-10 h-10 text-gray-300" />
        <h1 className="text-lg font-semibold text-gray-500">You can&rsquo;t edit segments</h1>
        <p className="text-[13px] text-gray-400">Ask an admin for marketing access to build audiences.</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-3 px-6 pt-6 pb-4 border-b border-gray-100">
        <button
          type="button"
          onClick={() => router.push("/customers/segments")}
          className="p-2 -ml-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
          title="Back to segments"
        >
          <ArrowLeft className="w-4.5 h-4.5" />
        </button>
        <div className="w-9 h-9 rounded-xl bg-[#EEF6F1] flex items-center justify-center shrink-0">
          <Filter className="w-4 h-4 text-[#3B694C]" />
        </div>
        <div className="min-w-0">
          <h1 className="text-[20px] font-bold text-gray-900 tracking-tight truncate">
            {isEdit ? name || "Segment" : "New segment"}
          </h1>
          <p className="text-[12.5px] text-gray-400 mt-0.5">
            Rules are re-checked every time this segment is used
          </p>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-6 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-gray-200 [&::-webkit-scrollbar-thumb]:rounded-full">
        <div className="max-w-[1100px] space-y-6">
          {/* Identity */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-[12px] font-semibold text-gray-600 mb-1 block">
                Segment name <span className="text-red-500">*</span>
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Lapsed dermatology patients"
                autoFocus={!isEdit}
                className={inputCls}
              />
            </div>
            <div>
              <label className="text-[12px] font-semibold text-gray-600 mb-1 block">Description</label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What is this audience for?"
                className={inputCls}
              />
            </div>
          </div>

          <div className="border-t border-gray-100 pt-6">
            <SegmentBuilder
              definition={definition}
              onChange={setDefinition}
              excludeOptedOut={excludeOptedOut}
              onExcludeOptedOutChange={setExcludeOptedOut}
              onPreview={setPreview}
            />
          </div>
        </div>
      </div>

      {/* Save bar */}
      <div className="shrink-0 flex items-center justify-between gap-4 px-6 py-4 border-t border-gray-100 bg-white flex-wrap">
        <p className="text-[12.5px] text-gray-400">
          {noRules
            ? "Add at least one rule to save."
            : preview
              ? `Currently reaches ${preview.reachable.toLocaleString()} contact${preview.reachable === 1 ? "" : "s"}.`
              : "Counting…"}
        </p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/customers/segments")}
            className="px-4 py-2.5 rounded-xl border border-gray-200 text-[13px] font-semibold text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => handleSave(true)}
            disabled={!canSave || !preview?.reachable}
            title={!preview?.reachable ? "Nobody matches these rules yet" : undefined}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 text-[13px] font-semibold text-gray-600 hover:bg-[#EEF6F1] hover:border-[#3B694C] hover:text-[#3B694C] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:border-gray-200 disabled:hover:text-gray-600 transition-colors cursor-pointer"
          >
            <Megaphone className="w-4 h-4" />
            Save &amp; create campaign
          </button>
          <button
            type="button"
            onClick={() => handleSave(false)}
            disabled={!canSave}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#3B694C] text-white text-[13px] font-semibold hover:bg-[#325a41] disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            <Save className="w-4 h-4" />
            {saving ? "Saving…" : isEdit ? "Save changes" : "Create segment"}
          </button>
        </div>
      </div>
    </div>
  );
}
