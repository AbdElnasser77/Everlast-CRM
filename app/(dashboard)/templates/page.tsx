"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  RefreshCw,
  Lock,
  Pencil,
  Trash2,
  Send,
  AlertCircle,
  X,
} from "lucide-react";
import {
  apiGetTemplates,
  apiCreateTemplate,
  apiUpdateTemplate,
  apiDeleteTemplate,
  apiSubmitTemplate,
  apiSyncTemplates,
} from "@/lib/api";
import type {
  Template,
  TemplateButton,
  TemplateCategory,
  TemplateStatus,
} from "@/types";

// ---------------------------------------------------------------------------
// Config / Badges
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<
  TemplateStatus,
  { label: string; bg: string; text: string; border: string }
> = {
  DRAFT: {
    label: "Draft",
    bg: "bg-gray-100",
    text: "text-gray-600",
    border: "border-gray-200",
  },
  SUBMITTED: {
    label: "Submitted",
    bg: "bg-blue-50",
    text: "text-blue-700",
    border: "border-blue-200",
  },
  APPROVED: {
    label: "Approved",
    bg: "bg-green-50",
    text: "text-green-700",
    border: "border-green-200",
  },
  REJECTED: {
    label: "Rejected",
    bg: "bg-red-50",
    text: "text-red-700",
    border: "border-red-200",
  },
};

const CATEGORY_CONFIG: Record<
  TemplateCategory,
  { label: string; bg: string; text: string }
> = {
  GENERAL: { label: "General", bg: "bg-[#EEF6F1]", text: "text-[#3B694C]" },
  RE_ENGAGEMENT: {
    label: "Re-engagement",
    bg: "bg-orange-50",
    text: "text-orange-700",
  },
  CAMPAIGN: { label: "Campaign", bg: "bg-purple-50", text: "text-purple-700" },
};

const LIMITS = { name: 512, header: 60, body: 1024, footer: 60, button: 25 };

function renderPreview(text: string): string {
  return text
    .replace(/\{\{customer_name\}\}/g, "Customer")
    .replace(/\{\{agent_name\}\}/g, "Agent");
}

function CharCount({ val, max }: { val: string; max: number }) {
  const over = val.length > max;
  return (
    <span
      className={`text-[11px] tabular-nums ${over ? "text-red-500 font-semibold" : "text-gray-400"}`}
    >
      {val.length}/{max}
    </span>
  );
}

function TemplateStatusBadge({ status }: { status: TemplateStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${cfg.bg} ${cfg.text} ${cfg.border}`}
    >
      {cfg.label}
    </span>
  );
}

function CategoryBadge({ category }: { category: TemplateCategory }) {
  const cfg = CATEGORY_CONFIG[category];
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${cfg.bg} ${cfg.text}`}
    >
      {cfg.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// TemplateFormModal
// ---------------------------------------------------------------------------

function TemplateFormModal({
  template,
  onClose,
  onSaved,
}: {
  template?: Template | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEditing = !!template;
  const [name, setName] = useState(template?.name ?? "");
  const [category, setCategory] = useState<TemplateCategory>(
    template?.category ?? "GENERAL",
  );
  const [language, setLanguage] = useState(template?.language ?? "en_US");
  const [header, setHeader] = useState(template?.header ?? "");
  const [body, setBody] = useState(template?.body ?? "");
  const [footer, setFooter] = useState(template?.footer ?? "");
  const [buttons, setButtons] = useState<TemplateButton[]>(
    template?.buttons ?? [],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function insertPlaceholder(ph: string) {
    setBody((prev) => prev + ph);
  }
  function addButton() {
    if (buttons.length >= 3) return;
    setButtons((prev) => [...prev, { id: `btn_${Date.now()}`, title: "" }]);
  }
  function updateButtonTitle(i: number, title: string) {
    setButtons((prev) => {
      const n = [...prev];
      n[i] = { ...n[i], title };
      return n;
    });
  }
  function removeButton(i: number) {
    setButtons((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !body.trim()) {
      setError("Name and body are required.");
      return;
    }
    if (header.length > LIMITS.header) {
      setError(`Header must be ≤ ${LIMITS.header} characters.`);
      return;
    }
    if (body.length > LIMITS.body) {
      setError(`Body must be ≤ ${LIMITS.body} characters.`);
      return;
    }
    if (footer.length > LIMITS.footer) {
      setError(`Footer must be ≤ ${LIMITS.footer} characters.`);
      return;
    }
    if (
      buttons.some((b) => !b.title.trim() || b.title.length > LIMITS.button)
    ) {
      setError(
        `All button titles are required and must be ≤ ${LIMITS.button} characters.`,
      );
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        category,
        language,
        header: header.trim() || undefined,
        body: body.trim(),
        footer: footer.trim() || undefined,
        buttons: buttons.length > 0 ? buttons : undefined,
      };
      if (isEditing && template) {
        await apiUpdateTemplate(template.id, payload);
      } else {
        await apiCreateTemplate(payload);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save template");
    } finally {
      setSaving(false);
    }
  }

  const visibleButtons = buttons.filter((b) => b.title.trim());

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100 shrink-0">
          <h2 className="text-[16px] font-bold text-gray-900">
            {isEditing ? "Edit Template" : "Create Template"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-400 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Two-panel body */}
        <div className="flex flex-1 min-h-0">
          {/* Left — form */}
          <div className="flex-1 overflow-y-auto px-6 py-5 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-gray-200 [&::-webkit-scrollbar-thumb]:rounded-full">
            <form id="tpl-form" onSubmit={handleSubmit} className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[12px] font-semibold text-gray-600">
                    Template Name *
                  </label>
                  <CharCount val={name} max={LIMITS.name} />
                </div>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={LIMITS.name}
                  placeholder="e.g. Wellness Check"
                  required
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-[14px] text-gray-800 outline-none focus:border-[#3B694C] focus:ring-1 focus:ring-[#3B694C]/20"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12px] font-semibold text-gray-600 mb-1.5">
                    Category
                  </label>
                  <select
                    value={category}
                    onChange={(e) =>
                      setCategory(e.target.value as TemplateCategory)
                    }
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-[14px] text-gray-800 outline-none focus:border-[#3B694C] bg-white"
                  >
                    <option value="GENERAL">General</option>
                    <option value="RE_ENGAGEMENT">Re-engagement</option>
                    <option value="CAMPAIGN">Campaign</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[12px] font-semibold text-gray-600 mb-1.5">
                    Language
                  </label>
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-[14px] text-gray-800 outline-none focus:border-[#3B694C] bg-white"
                  >
                    <option value="en_US">English (en_US)</option>
                    <option value="ar">Arabic (ar)</option>
                  </select>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[12px] font-semibold text-gray-600">
                    Header{" "}
                    <span className="font-normal text-gray-400">
                      (optional)
                    </span>
                  </label>
                  <CharCount val={header} max={LIMITS.header} />
                </div>
                <input
                  type="text"
                  value={header}
                  onChange={(e) => setHeader(e.target.value)}
                  maxLength={LIMITS.header}
                  placeholder="e.g. Everlast Wellness"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-[14px] text-gray-800 outline-none focus:border-[#3B694C] focus:ring-1 focus:ring-[#3B694C]/20"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[12px] font-semibold text-gray-600">
                    Message Body *
                  </label>
                  <CharCount val={body} max={LIMITS.body} />
                </div>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  maxLength={LIMITS.body}
                  placeholder={`Hi {{customer_name}}, we'd love to reconnect.`}
                  rows={4}
                  required
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-[14px] text-gray-800 outline-none focus:border-[#3B694C] focus:ring-1 focus:ring-[#3B694C]/20 resize-none"
                />
                <div className="flex gap-2 mt-2">
                  <span className="text-[11px] text-gray-400 self-center">
                    Insert:
                  </span>
                  <button
                    type="button"
                    onClick={() => insertPlaceholder("{{customer_name}}")}
                    className="text-[11px] font-medium text-[#3B694C] bg-[#EEF6F1] border border-[#3B694C]/20 px-2 py-0.5 rounded-md hover:bg-[#DCF2E3] transition-colors cursor-pointer"
                  >
                    {"{{customer_name}}"}
                  </button>
                  <button
                    type="button"
                    onClick={() => insertPlaceholder("{{agent_name}}")}
                    className="text-[11px] font-medium text-[#3B694C] bg-[#EEF6F1] border border-[#3B694C]/20 px-2 py-0.5 rounded-md hover:bg-[#DCF2E3] transition-colors cursor-pointer"
                  >
                    {"{{agent_name}}"}
                  </button>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[12px] font-semibold text-gray-600">
                    Footer{" "}
                    <span className="font-normal text-gray-400">
                      (optional)
                    </span>
                  </label>
                  <CharCount val={footer} max={LIMITS.footer} />
                </div>
                <input
                  type="text"
                  value={footer}
                  onChange={(e) => setFooter(e.target.value)}
                  maxLength={LIMITS.footer}
                  placeholder="e.g. Reply STOP to opt out"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-[14px] text-gray-800 outline-none focus:border-[#3B694C] focus:ring-1 focus:ring-[#3B694C]/20"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[12px] font-semibold text-gray-600">
                    Buttons{" "}
                    <span className="font-normal text-gray-400">
                      (optional, max 3)
                    </span>
                  </label>
                  {buttons.length < 3 && (
                    <button
                      type="button"
                      onClick={addButton}
                      className="text-[11px] font-medium text-[#3B694C] hover:underline cursor-pointer flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" /> Add button
                    </button>
                  )}
                </div>
                <div className="space-y-2">
                  {buttons.map((btn, i) => (
                    <div key={btn.id} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={btn.title}
                        onChange={(e) => updateButtonTitle(i, e.target.value)}
                        placeholder={`Button ${i + 1} label`}
                        maxLength={LIMITS.button}
                        className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-[13px] text-gray-800 outline-none focus:border-[#3B694C]"
                      />
                      <CharCount val={btn.title} max={LIMITS.button} />
                      <button
                        type="button"
                        onClick={() => removeButton(i)}
                        className="w-7 h-7 rounded-full hover:bg-red-50 flex items-center justify-center text-gray-400 hover:text-red-500 transition-colors cursor-pointer shrink-0"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-[13px] text-red-600">{error}</p>
                </div>
              )}
            </form>
          </div>

          {/* Right — live preview */}
          <div className="w-[420px] shrink-0 border-l border-gray-100 bg-gray-50/60 px-6 py-5 flex flex-col overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-gray-200 [&::-webkit-scrollbar-thumb]:rounded-full">
            <p className="text-[10px] font-bold text-gray-400 tracking-widest uppercase mb-4">
              Live Preview
            </p>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              {/* Simulated chat header */}
              <div className="flex items-center gap-2.5 px-4 py-3 border-b border-gray-100 bg-gray-50/80">
                <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 font-semibold text-[11px] shrink-0">
                  C
                </div>
                <div>
                  <p className="text-[12px] font-semibold text-gray-800 leading-tight">
                    Customer
                  </p>
                  <p className="text-[10px] text-gray-400 leading-tight">
                    +971 50 000 0000
                  </p>
                </div>
              </div>

              {/* Chat body */}
              <div className="px-3 py-4 bg-[#f0ece4]/40">
                <div className="flex justify-end">
                  <div className="bg-[#3B694C] rounded-2xl rounded-br-sm px-3.5 py-3 max-w-[95%] shadow-sm">
                    {header.trim() && (
                      <p className="text-[13px] font-bold text-white mb-1.5 leading-snug">
                        {renderPreview(header)}
                      </p>
                    )}
                    <p className="text-[13px] text-white leading-relaxed whitespace-pre-wrap">
                      {body.trim() ? (
                        renderPreview(body)
                      ) : (
                        <span className="text-white/40 italic text-[12px]">
                          Your message will appear here…
                        </span>
                      )}
                    </p>
                    {footer.trim() && (
                      <p className="text-[11px] text-white/55 mt-2 italic leading-snug">
                        {renderPreview(footer)}
                      </p>
                    )}
                    <div className="flex justify-end mt-1.5">
                      <span className="text-[10px] text-white/50">
                        15:32 ✓✓
                      </span>
                    </div>
                  </div>
                </div>

                {/* Buttons preview */}
                {visibleButtons.length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    {visibleButtons.map((btn) => (
                      <div
                        key={btn.id}
                        className="bg-white rounded-xl border border-gray-200 text-center py-2 text-[13px] font-medium text-[#3B694C] shadow-sm"
                      >
                        {btn.title}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Footer info */}
            <div className="flex justify-between items-center mt-3 px-0.5">
              <span className="text-[11px] text-gray-400">
                Renders for: Customer
              </span>
              <span
                className={`text-[11px] font-medium tabular-nums ${body.length > LIMITS.body ? "text-red-500" : "text-gray-400"}`}
              >
                {body.length}/{LIMITS.body}
              </span>
            </div>
          </div>
        </div>

        {/* Footer buttons */}
        <div className="flex gap-3 px-6 py-4 border-t border-gray-100 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-[14px] font-semibold text-gray-600 hover:bg-gray-50 cursor-pointer transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="tpl-form"
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-[#3B694C] hover:bg-[#2f5840] disabled:opacity-60 text-[14px] font-semibold text-white cursor-pointer transition-colors"
          >
            {saving
              ? "Saving…"
              : isEditing
                ? "Save Changes"
                : "Create Template"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SubmitConfirmModal
// ---------------------------------------------------------------------------

function SubmitConfirmModal({
  template,
  onConfirm,
  onCancel,
}: {
  template: Template;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setLoading(true);
    setError(null);
    try {
      await apiSubmitTemplate(template.id);
      onConfirm();
    } catch {
      setError("Failed to reach Meta. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-4">
          <Send className="w-5 h-5 text-blue-600" />
        </div>
        <h2 className="text-[16px] font-bold text-gray-900 text-center mb-2">
          Submit for Approval?
        </h2>
        <p className="text-[13px] text-gray-500 text-center mb-1">
          <strong className="text-gray-700">{template.name}</strong> will be
          sent to Meta for review.
        </p>
        <p className="text-[13px] text-gray-400 text-center mb-5">
          Meta reviews typically take 24–48 hours. You won&apos;t be able to
          edit while it&apos;s under review.
        </p>
        {error && (
          <p className="text-[13px] text-red-500 text-center mb-4">{error}</p>
        )}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-[14px] font-semibold text-gray-600 hover:bg-gray-50 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading}
            className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-[14px] font-semibold text-white cursor-pointer transition-colors"
          >
            {loading ? "Submitting…" : "Submit"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DeleteConfirmModal
// ---------------------------------------------------------------------------

function DeleteConfirmModal({
  template,
  onConfirm,
  onCancel,
}: {
  template: Template;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setLoading(true);
    setError(null);
    try {
      await apiDeleteTemplate(template.id);
      onConfirm();
    } catch {
      setError("Failed to delete. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-4">
          <Trash2 className="w-5 h-5 text-red-500" />
        </div>
        <h2 className="text-[16px] font-bold text-gray-900 text-center mb-2">
          Delete Template?
        </h2>
        <p className="text-[13px] text-gray-500 text-center mb-5">
          <strong className="text-gray-700">{template.name}</strong> will be
          removed permanently.
        </p>
        {error && (
          <p className="text-[13px] text-red-500 text-center mb-4">{error}</p>
        )}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-[14px] font-semibold text-gray-600 hover:bg-gray-50 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading}
            className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 disabled:opacity-60 text-[14px] font-semibold text-white cursor-pointer transition-colors"
          >
            {loading ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TemplateCard
// ---------------------------------------------------------------------------

function TemplateCard({
  template,
  onEdit,
  onSubmit,
  onDelete,
}: {
  template: Template;
  onEdit: () => void;
  onSubmit: () => void;
  onDelete: () => void;
}) {
  const canEdit =
    template.approvalStatus === "DRAFT" ||
    template.approvalStatus === "REJECTED";
  const canSubmit =
    template.approvalStatus === "DRAFT" ||
    template.approvalStatus === "REJECTED";

  return (
    <div className="bg-white rounded-xl border border-gray-100 hover:border-gray-200 transition-colors flex flex-col overflow-hidden">
      {/* Card header */}
      <div className="px-4 pt-4 pb-3 shrink-0">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <h3 className="text-[13px] font-semibold text-gray-900 truncate">
              {template.name}
            </h3>
            {template.metaTemplateName && (
              <p className="text-[10px] text-gray-400 font-mono mt-0.5 truncate">
                {template.metaTemplateName}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
            <CategoryBadge category={template.category} />
            <TemplateStatusBadge status={template.approvalStatus} />
          </div>
        </div>

        {template.approvalStatus === "REJECTED" && template.rejectionReason && (
          <div className="flex items-start gap-1.5 bg-red-50 border border-red-100 rounded-xl px-3 py-2 mt-2">
            <AlertCircle className="w-3 h-3 text-red-500 shrink-0 mt-0.5" />
            <p className="text-[11px] text-red-700 leading-snug">
              <strong>Rejected:</strong> {template.rejectionReason}
            </p>
          </div>
        )}
      </div>

      {/* Scrollable bubble area */}
      <div className="mx-3 mb-3 flex-1 overflow-y-auto max-h-80 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-[#2f5840]/30 [&::-webkit-scrollbar-thumb]:rounded-full">
        {/* Dark green WhatsApp bubble */}
        <div className="bg-[#3B694C] rounded-2xl rounded-br-sm px-3.5 py-3 shadow-sm">
          {template.header && (
            <p className="text-[12px] font-bold text-white mb-1.5 leading-snug">
              {template.header}
            </p>
          )}
          <p className="text-[13px] text-white leading-relaxed whitespace-pre-wrap">
            {template.body}
          </p>
          {template.footer && (
            <p className="text-[11px] text-white/55 italic mt-2 leading-snug">
              {template.footer}
            </p>
          )}
          <div className="flex justify-end mt-2">
            <span className="text-[10px] text-white/50">15:32 ✓✓</span>
          </div>
        </div>

        {/* CTA buttons */}
        {template.buttons && template.buttons.length > 0 && (
          <div className="mt-1.5 space-y-1.5">
            {template.buttons.map((btn) => (
              <div
                key={btn.id}
                className="flex items-center justify-center py-2 rounded-xl border border-gray-200 bg-white text-[12px] font-medium text-[#3B694C]"
              >
                {btn.title}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Action footer */}
      <div className="shrink-0 flex items-stretch border-t border-gray-100 divide-x divide-gray-100 text-[12px] font-medium">
        <span className="flex items-center px-3 py-2.5 text-[10px] text-gray-400 flex-1 truncate">
          {template.language}
        </span>
        {canEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="flex items-center justify-center gap-1.5 px-3 py-2.5 text-gray-500 hover:text-gray-900 hover:bg-gray-50 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Pencil className="w-3.5 h-3.5" /> Edit
          </button>
        )}
        {canSubmit && (
          <button
            type="button"
            onClick={onSubmit}
            className="flex items-center justify-center gap-1.5 px-3 py-2.5 text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Send className="w-3.5 h-3.5" />
            {template.approvalStatus === "REJECTED" ? "Resubmit" : "Submit"}
          </button>
        )}
        <button
          type="button"
          onClick={onDelete}
          className="flex items-center justify-center px-3 py-2.5 text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const STATUS_FILTERS: (TemplateStatus | "ALL")[] = [
  "ALL",
  "DRAFT",
  "SUBMITTED",
  "APPROVED",
  "REJECTED",
];

export default function TemplatesPage() {
  const [user, setUser] = useState<{ role: string } | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<TemplateStatus | "ALL">(
    "ALL",
  );

  const [formModal, setFormModal] = useState<{
    open: boolean;
    template: Template | null;
  }>({ open: false, template: null });
  const [submitModal, setSubmitModal] = useState<Template | null>(null);
  const [deleteModal, setDeleteModal] = useState<Template | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("user");
      setUser(raw ? JSON.parse(raw) : null);
    } catch {
      setUser(null);
    }
  }, []);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const params =
        statusFilter !== "ALL" ? { status: statusFilter } : undefined;
      const res = await apiGetTemplates(params);
      setTemplates(res.data);
    } catch {
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    if (user?.role === "ADMIN") fetchTemplates();
    else if (user) setLoading(false);
  }, [user, fetchTemplates]);

  async function handleSync() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await apiSyncTemplates();
      setSyncResult(
        `Synced — ${res.approved} approved, ${res.rejected} rejected`,
      );
      await fetchTemplates();
    } catch {
      setSyncResult("Sync failed. Try again.");
    } finally {
      setSyncing(false);
    }
  }

  if (!user) return null;

  if (user.role !== "ADMIN") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-3">
        <Lock className="w-10 h-10 text-gray-300" />
        <h1 className="text-lg font-semibold text-gray-500">
          Admin access only
        </h1>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 bg-gray-50 min-h-screen overflow-y-auto">
      {/* Modals */}
      {formModal.open && (
        <TemplateFormModal
          template={formModal.template}
          onClose={() => setFormModal({ open: false, template: null })}
          onSaved={() => {
            setFormModal({ open: false, template: null });
            fetchTemplates();
          }}
        />
      )}
      {submitModal && (
        <SubmitConfirmModal
          template={submitModal}
          onConfirm={() => {
            setSubmitModal(null);
            fetchTemplates();
          }}
          onCancel={() => setSubmitModal(null)}
        />
      )}
      {deleteModal && (
        <DeleteConfirmModal
          template={deleteModal}
          onConfirm={() => {
            setDeleteModal(null);
            fetchTemplates();
          }}
          onCancel={() => setDeleteModal(null)}
        />
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="font-bold text-2xl text-gray-900">Templates</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Manage WhatsApp message templates for agents
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {syncResult && (
            <span className="text-[12px] text-gray-500 bg-white border border-gray-200 px-3 py-1.5 rounded-lg">
              {syncResult}
            </span>
          )}
          <button
            type="button"
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-2 border border-gray-200 bg-white rounded-xl px-4 py-2 text-[13px] font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-60 cursor-pointer transition-colors"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`}
            />
            {syncing ? "Syncing…" : "Sync Status"}
          </button>
          <button
            type="button"
            onClick={() => setFormModal({ open: true, template: null })}
            className="flex items-center gap-2 bg-[#3B694C] hover:bg-[#2f5840] text-white rounded-xl px-4 py-2 text-[13px] font-semibold cursor-pointer transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> New Template
          </button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setStatusFilter(f)}
            className={`px-3.5 py-1.5 rounded-full text-[13px] border transition-colors cursor-pointer font-medium ${
              statusFilter === f
                ? "bg-[#DCF2E3] border-[#3B694C] text-[#3B694C]"
                : "border-gray-200 text-gray-500 hover:bg-gray-50 bg-white"
            }`}
          >
            {f === "ALL" ? "All" : STATUS_CONFIG[f].label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="bg-white rounded-xl border border-gray-100 p-5 animate-pulse space-y-3"
            >
              <div className="flex justify-between">
                <div className="h-4 bg-gray-100 rounded w-1/2" />
                <div className="h-5 bg-gray-100 rounded-full w-20" />
              </div>
              <div className="h-3 bg-gray-100 rounded w-full" />
              <div className="h-3 bg-gray-100 rounded w-3/4" />
            </div>
          ))}
        </div>
      ) : templates.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
            <Send className="w-7 h-7 text-gray-300" />
          </div>
          <h2 className="text-[16px] font-semibold text-gray-500 mb-1">
            No templates
          </h2>
          <p className="text-[13px] text-gray-400 mb-5">
            {statusFilter !== "ALL"
              ? "No templates with this status."
              : "Create your first template to get started."}
          </p>
          {statusFilter === "ALL" && (
            <button
              type="button"
              onClick={() => setFormModal({ open: true, template: null })}
              className="flex items-center gap-2 bg-[#3B694C] hover:bg-[#2f5840] text-white rounded-xl px-5 py-2.5 text-[13px] font-semibold cursor-pointer transition-colors"
            >
              <Plus className="w-4 h-4" /> New Template
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
          {templates.map((tpl) => (
            <TemplateCard
              key={tpl.id}
              template={tpl}
              onEdit={() => setFormModal({ open: true, template: tpl })}
              onSubmit={() => setSubmitModal(tpl)}
              onDelete={() => setDeleteModal(tpl)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
