"use client";

// One knowledge-base article: its sections, and what happens to it (save as
// draft, approve, move back to draft, archive, delete). Only approved articles
// reach patients, and only once indexed ("Searchable"). Read-only for anyone
// without knowledge:write.

import { useEffect, useState } from "react";
import { CheckCircle2, CircleDashed, AlertTriangle, Trash2, Archive, Undo2, BadgeCheck } from "lucide-react";
import {
  apiCreateKnowledge,
  apiDeleteKnowledge,
  apiSetKnowledgeStatus,
  apiUpdateKnowledge,
} from "@/lib/api";
import { KNOWLEDGE_SECTIONS, KNOWLEDGE_STATUS_LABEL, KNOWLEDGE_STATUS_PILL, emptySections, indexingState } from "@/lib/knowledge";
import type { KnowledgeArticle, KnowledgeIndexing, KnowledgeSections } from "@/types";
import { useToast } from "@/components/ui/toast";
import { inputCls, labelCls, primaryBtnCls, secondaryBtnCls } from "@/components/settings/shared";

interface Props {
  /** null = a new article. */
  article: KnowledgeArticle | null;
  categories: string[];
  canWrite: boolean;
  aiConfigured: boolean;
  onSaved: (article: KnowledgeArticle) => void;
  onDeleted: (id: number) => void;
  onDirtyChange: (dirty: boolean) => void;
}

const sameSections = (a: KnowledgeSections, b: KnowledgeSections) =>
  KNOWLEDGE_SECTIONS.every(({ key }) => (a[key] || "").trim() === (b[key] || "").trim());

function indexingNote(i: KnowledgeIndexing | null | undefined): string | null {
  if (!i || i.indexed) return null;
  if (i.reason === "not_configured") return "Saved — but not searchable yet: Cloudflare AI isn't configured on the server.";
  if (i.reason === "error") return `Saved — but indexing failed${i.error ? ` (${i.error})` : ""}. Save again to retry.`;
  return null;
}

export function ArticleEditor({ article, categories, canWrite, aiConfigured, onSaved, onDeleted, onDirtyChange }: Props) {
  const toast = useToast();
  const [title, setTitle] = useState(article?.title ?? "");
  const [category, setCategory] = useState(article?.category ?? "");
  const [sections, setSections] = useState<KnowledgeSections>(article?.sections ?? emptySections());
  const [busy, setBusy] = useState<null | "save" | "approve" | "unapprove" | "archive" | "delete">(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const dirty =
    title.trim() !== (article?.title ?? "") ||
    category.trim() !== (article?.category ?? "") ||
    !sameSections(sections, article?.sections ?? emptySections());
  const hasText = KNOWLEDGE_SECTIONS.some(({ key }) => sections[key].trim());

  // The parent asks before navigating away from unsaved work.
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  // Saves the form; returns the saved article (or null on failure).
  async function save(): Promise<KnowledgeArticle | null> {
    if (!title.trim()) {
      setError("Give the article a title.");
      return null;
    }
    const body = { title: title.trim(), category: category.trim() || null, sections };
    const res = article ? await apiUpdateKnowledge(article.id, body) : await apiCreateKnowledge(body);
    const note = indexingNote(res.indexing);
    if (note) toast.info(note);
    onSaved(res.data);
    return res.data;
  }

  async function run(kind: NonNullable<typeof busy>, fn: () => Promise<void>) {
    setBusy(kind);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  const handleSave = () =>
    run("save", async () => {
      const saved = await save();
      if (saved) toast.success(article ? "Article saved" : "Draft saved");
    });

  // Approve saves any edits first, so what's approved is what's on screen.
  const handleApprove = () =>
    run("approve", async () => {
      let current = article;
      if (!current || dirty) current = await save();
      if (!current) return;
      const res = await apiSetKnowledgeStatus(current.id, "approve");
      onSaved(res.data);
      const note = indexingNote(res.indexing);
      if (note) toast.info(note);
      else toast.success("Approved — the assistant can use it now");
    });

  const handleStatus = (action: "unapprove" | "archive") =>
    run(action, async () => {
      if (!article) return;
      if (dirty) await save();
      const res = await apiSetKnowledgeStatus(article.id, action);
      onSaved(res.data);
      toast.success(action === "archive" ? "Archived" : "Moved to draft — the assistant no longer uses it");
    });

  const handleDelete = () =>
    run("delete", async () => {
      if (!article) return;
      await apiDeleteKnowledge(article.id);
      onDeleted(article.id);
      toast.success("Article deleted");
    });

  const status = article?.status ?? "DRAFT";
  const state = article ? indexingState(article, aiConfigured) : null;

  return (
    <div className="bg-white border border-gray-200 rounded-2xl">
      {/* Header: status + indexing state */}
      <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-center gap-2">
        <p className="text-[14px] font-bold text-gray-900 mr-auto">{article ? "Article" : "New article"}</p>
        {article && (
          <span className={`text-[11px] font-semibold border rounded-full px-2.5 py-0.5 ${KNOWLEDGE_STATUS_PILL[status]}`}>
            {KNOWLEDGE_STATUS_LABEL[status]}
          </span>
        )}
        {state && (
          <span
            className={`inline-flex items-center gap-1 text-[11px] font-medium ${
              state.tone === "ok" ? "text-emerald-700" : state.tone === "warn" ? "text-amber-700" : "text-gray-400"
            }`}
          >
            {state.tone === "ok" ? <CheckCircle2 className="w-3.5 h-3.5" /> : state.tone === "warn" ? <AlertTriangle className="w-3.5 h-3.5" /> : <CircleDashed className="w-3.5 h-3.5" />}
            {state.label}
          </span>
        )}
      </div>

      <div className="px-5 py-5 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-2">
            <label className={labelCls}>Treatment or topic</label>
            <input
              type="text"
              dir="auto"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Botox (anti-wrinkle injections)"
              maxLength={200}
              disabled={!canWrite}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Category</label>
            <input
              type="text"
              dir="auto"
              list="knowledge-categories"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. Injectables"
              maxLength={80}
              disabled={!canWrite}
              className={inputCls}
            />
            <datalist id="knowledge-categories">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
        </div>

        {KNOWLEDGE_SECTIONS.map(({ key, label, hint }) => (
          <div key={key}>
            <label className={labelCls}>{label}</label>
            <textarea
              dir="auto"
              value={sections[key]}
              onChange={(e) => setSections((s) => ({ ...s, [key]: e.target.value }))}
              placeholder={canWrite ? hint : ""}
              rows={key === "summary" || key === "faq" ? 5 : 3}
              disabled={!canWrite}
              className={`${inputCls} resize-y leading-relaxed`}
            />
          </div>
        ))}

        {status === "APPROVED" && canWrite && (
          <p className="text-[12px] text-gray-500 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
            This article is approved: saving changes updates what the assistant tells patients straight away.
          </p>
        )}

        {error && <p className="text-[13px] text-red-500 font-medium">{error}</p>}

        {canWrite && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {article && !confirmDelete && (
              <button type="button" onClick={() => setConfirmDelete(true)} disabled={busy !== null} className={`${secondaryBtnCls} text-red-600 hover:bg-red-50`}>
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </button>
            )}
            {confirmDelete && (
              <span className="inline-flex items-center gap-2 text-[12px] text-gray-600">
                Delete this article for good?
                <button type="button" onClick={handleDelete} disabled={busy !== null} className="text-[12px] font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg px-3 py-1.5 cursor-pointer disabled:opacity-60">
                  {busy === "delete" ? "Deleting…" : "Delete"}
                </button>
                <button type="button" onClick={() => setConfirmDelete(false)} className="text-[12px] font-medium text-gray-500 hover:text-gray-800 px-2 cursor-pointer">
                  Cancel
                </button>
              </span>
            )}
            {article && status !== "ARCHIVED" && (
              <button type="button" onClick={() => handleStatus("archive")} disabled={busy !== null} className={secondaryBtnCls}>
                <Archive className="w-3.5 h-3.5" /> {busy === "archive" ? "Archiving…" : "Archive"}
              </button>
            )}
            {article && status !== "DRAFT" && (
              <button type="button" onClick={() => handleStatus("unapprove")} disabled={busy !== null} className={secondaryBtnCls}>
                <Undo2 className="w-3.5 h-3.5" /> {busy === "unapprove" ? "Moving…" : "Move to draft"}
              </button>
            )}
            <span className="flex-1" />
            {(status !== "APPROVED" || !article) && (
              <button type="button" onClick={handleSave} disabled={busy !== null || (!dirty && Boolean(article))} className={secondaryBtnCls}>
                {busy === "save" ? "Saving…" : "Save draft"}
              </button>
            )}
            {status === "APPROVED" && article ? (
              <button type="button" onClick={handleSave} disabled={busy !== null || !dirty} className={primaryBtnCls}>
                {busy === "save" ? "Saving…" : "Save changes"}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleApprove}
                disabled={busy !== null || !hasText || !title.trim()}
                title={!hasText ? "Fill in at least one section first" : undefined}
                className={primaryBtnCls}
              >
                <BadgeCheck className="w-4 h-4" /> {busy === "approve" ? "Approving…" : "Approve"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
