"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  apiGetCustomers,
  apiImportCustomers,
  apiDeleteCustomer,
  apiGetConversations,
  apiGetCustomer,
  apiCreateCustomer,
  apiUpdateCustomer,
  apiCreateConversation,
  apiGetTemplates,
  apiSendTemplate,
} from "@/lib/api";
import type { Customer, Conversation, Template } from "@/types";

// ─── Constants ───────────────────────────────────────────────────────────────

const PAGE_SIZE = 30;

// ─── Phone normalization & validation ────────────────────────────────────────

function normalizePhone(raw: string): string {
  const s = raw.trim();
  let digits = s.replace(/\D/g, "");
  if (s.startsWith("+")) return digits;           // +201012345678 → 201012345678
  if (digits.startsWith("00")) return digits.slice(2); // 00201012345678 → 201012345678
  // Local Egyptian number: 01XXXXXXXXX (11 digits starting with 0)
  if (digits.startsWith("0") && digits.length >= 9 && digits.length <= 12)
    return "20" + digits.slice(1);
  return digits;
}

function isValidPhone(normalized: string): boolean {
  return /^\d{7,15}$/.test(normalized);
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getInitials(customer: Customer): string {
  const src = customer.name || customer.phone;
  if (!src) return "?";
  return src
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
}

function truncate(str: string | null, len = 60): string {
  if (!str) return "";
  return str.length > len ? str.slice(0, len) + "…" : str;
}

const TAG_PALETTES = [
  "bg-blue-100 text-blue-700",
  "bg-purple-100 text-purple-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-teal-100 text-teal-700",
  "bg-indigo-100 text-indigo-700",
];

function tagColor(tag: string): string {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) hash = (hash * 31 + tag.charCodeAt(i)) >>> 0;
  return TAG_PALETTES[hash % TAG_PALETTES.length];
}

// ─── CSV helpers ─────────────────────────────────────────────────────────────

function csvEscape(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return '"' + val.replace(/"/g, '""') + '"';
  }
  return val;
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/^"|"$/g, ""));
  return lines.slice(1).map((line) => {
    const vals: string[] = [];
    let inQuote = false;
    let cur = "";
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
        else inQuote = !inQuote;
      } else if (ch === "," && !inQuote) {
        vals.push(cur); cur = "";
      } else {
        cur += ch;
      }
    }
    vals.push(cur);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = (vals[i] ?? "").trim(); });
    return row;
  });
}

function formatMemberSince(iso: string): string {
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function getWindowStatus(conv: Conversation | undefined): { label: string; open: boolean } {
  if (!conv?.lastCustomerMessageAt) return { label: "No messages yet", open: false };
  const elapsed = Date.now() - new Date(conv.lastCustomerMessageAt).getTime();
  const remaining = 24 * 60 * 60 * 1000 - elapsed;
  if (remaining <= 0) return { label: "Closed", open: false };
  const hrs = Math.floor(remaining / 3600000);
  const mins = Math.floor((remaining % 3600000) / 60000);
  const timeStr = hrs > 0 ? `${hrs}h ${mins > 0 ? ` ${mins}m` : ""} left` : `${mins}m left`;
  return { label: `Open — ${timeStr}`, open: true };
}

const STATUS_STYLES: Record<string, string> = {
  OPEN:     "bg-green-50 text-green-700 border border-green-200",
  PENDING:  "bg-amber-50 text-amber-700 border border-amber-200",
  RESOLVED: "bg-gray-100 text-gray-500 border border-gray-200",
};

// ─── Customer Detail Drawer ───────────────────────────────────────────────────

type EditingField = "name" | "email" | "tags" | "notes" | null;

interface DetailDrawerProps {
  customer: Customer | null;
  conv: Conversation | undefined;
  onClose: () => void;
  onSaved: (updated: Customer) => void;
  onDeleted: (id: number | string) => void;
}

function CustomerDetailDrawer({ customer, conv, onClose, onSaved, onDeleted }: DetailDrawerProps) {
  const router = useRouter();
  const open = customer !== null;

  const [detail, setDetail] = useState<Customer | null>(null);
  const [fetching, setFetching] = useState(false);

  // Inline edit state
  const [editing, setEditing] = useState<EditingField>(null);
  const [editValue, setEditValue] = useState("");
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editTagInput, setEditTagInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Delete state
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (!customer) { setDetail(null); setEditing(null); setConfirmDelete(false); setDeleteError(null); return; }
    setDetail(customer);
    setEditing(null);
    const id = customer._id ?? customer.id;
    if (id == null) return;
    setFetching(true);
    apiGetCustomer(String(id))
      .then((res) => setDetail(res.data))
      .catch(() => {})
      .finally(() => setFetching(false));
  }, [customer]);

  const c = detail ?? customer;
  const window_ = getWindowStatus(conv);

  function startEdit(field: EditingField) {
    if (!c) return;
    setSaveError(null);
    setEditing(field);
    if (field === "name") setEditValue(c.name ?? "");
    else if (field === "email") setEditValue(c.email ?? "");
    else if (field === "notes") setEditValue(c.notes ?? "");
    else if (field === "tags") { setEditTags([...(c.tags ?? [])]); setEditTagInput(""); }
  }

  function cancelEdit() {
    setEditing(null); setEditValue(""); setEditTags([]); setEditTagInput(""); setSaveError(null);
  }

  async function saveField() {
    if (!c) return;
    const id = c._id ?? c.id;
    if (id == null) return;
    // Validate before saving
    if (editing === "email" && editValue.trim() && !isValidEmail(editValue)) {
      setSaveError("Enter a valid email address."); return;
    }
    if (editing === "name" && editValue.trim().length > 100) {
      setSaveError("Name must be 100 characters or fewer."); return;
    }
    if (editing === "notes" && editValue.trim().length > 1000) {
      setSaveError("Notes must be 1000 characters or fewer."); return;
    }
    setSaving(true); setSaveError(null);
    try {
      const payload: Partial<{ name: string; email: string; tags: string[]; notes: string }> = {};
      if (editing === "name") payload.name = editValue.trim() || undefined;
      else if (editing === "email") payload.email = editValue.trim() || undefined;
      else if (editing === "notes") payload.notes = editValue.trim() || undefined;
      else if (editing === "tags") payload.tags = editTags;
      const res = await apiUpdateCustomer(id, payload);
      setDetail(res.data);
      onSaved(res.data);
      cancelEdit();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  // Pencil icon button
  const PencilBtn = ({ field }: { field: EditingField }) => (
    <button
      type="button"
      onClick={() => startEdit(field)}
      className="w-5 h-5 flex items-center justify-center rounded-md text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition-colors cursor-pointer shrink-0"
    >
      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
      </svg>
    </button>
  );

  // Save / cancel row
  const EditActions = () => (
    <div className="flex items-center gap-1.5 mt-2">
      <button
        type="button"
        onClick={saveField}
        disabled={saving}
        className="flex items-center gap-1 text-[12px] font-semibold text-white bg-[#3B694C] hover:bg-[#2f5840] disabled:opacity-60 px-3 py-1 rounded-lg transition-colors cursor-pointer"
      >
        {saving ? (
          <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
        ) : (
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        )}
        Save
      </button>
      <button
        type="button"
        onClick={cancelEdit}
        className="text-[12px] font-semibold text-gray-500 hover:text-gray-700 px-2.5 py-1 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
      >
        Cancel
      </button>
      {saveError && <p className="text-[11px] text-red-500">{saveError}</p>}
    </div>
  );

  // Field label row with pencil
  function FieldLabel({ label, field }: { label: string; field: EditingField }) {
    return (
      <div className="flex items-center gap-1.5 mb-1">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
        {editing !== field && <PencilBtn field={field} />}
      </div>
    );
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={`fixed inset-0 z-[49] bg-black/20 transition-opacity duration-300 ${open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
      />

      {/* Panel */}
      <div
        className={`fixed top-0 right-0 h-full w-[380px] z-[50] bg-white shadow-2xl border-l border-gray-100 flex flex-col transition-transform duration-300 ease-out ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        {!c ? null : (
          <>
            {/* Header */}
            <div className="shrink-0 px-5 pt-5 pb-4 border-b border-gray-100">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-11 h-11 rounded-full bg-[#DCF2E3] flex items-center justify-center text-[#3B694C] font-bold text-[14px] shrink-0">
                    {getInitials(c)}
                  </div>
                  <div className="min-w-0 flex-1">
                    {editing === "name" ? (
                      <div>
                        <input
                          autoFocus
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") saveField(); if (e.key === "Escape") cancelEdit(); }}
                          className="w-full text-[15px] font-bold text-gray-900 border border-[#3B694C] rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-[#3B694C]/20"
                        />
                        <EditActions />
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <p className="text-[16px] font-bold text-gray-900 truncate">
                          {c.name || <span className="text-gray-400 font-normal text-[14px]">No name</span>}
                        </p>
                        <PencilBtn field="name" />
                      </div>
                    )}
                    {editing !== "name" && <p className="text-[13px] text-gray-500 mt-0.5">{c.phone}</p>}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors cursor-pointer shrink-0 mt-0.5"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                </button>
              </div>
              {fetching && (
                <div className="mt-2 h-0.5 rounded-full bg-gray-100 overflow-hidden">
                  <div className="h-full w-1/2 bg-[#3B694C]/30 animate-pulse rounded-full" />
                </div>
              )}
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-200 [&::-webkit-scrollbar-thumb]:rounded-full">

              {/* Contact Info */}
              <div className="space-y-4">
                <p className="text-[12px] font-bold text-gray-900 uppercase tracking-wider">Contact Info</p>

                {/* Email */}
                <div>
                  <FieldLabel label="Email" field="email" />
                  {editing === "email" ? (
                    <div>
                      <input
                        autoFocus
                        type="email"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") saveField(); if (e.key === "Escape") cancelEdit(); }}
                        placeholder="name@example.com"
                        className="w-full text-[14px] text-gray-800 border border-[#3B694C] rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-[#3B694C]/20 placeholder:text-gray-300"
                      />
                      <EditActions />
                    </div>
                  ) : (
                    <p className="text-[14px] text-gray-700">
                      {c.email || <span className="text-gray-300">—</span>}
                    </p>
                  )}
                </div>

                {/* Tags */}
                <div>
                  <FieldLabel label="Tags" field="tags" />
                  {editing === "tags" ? (
                    <div>
                      <div className="border border-[#3B694C] rounded-lg px-3 py-2 focus-within:ring-2 focus-within:ring-[#3B694C]/20 bg-white">
                        {editTags.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mb-2">
                            {editTags.map((tag) => (
                              <span key={tag} className={`inline-flex items-center gap-1 text-[12px] font-medium px-2 py-0.5 rounded-full ${tagColor(tag)}`}>
                                {tag}
                                <button type="button" onClick={() => setEditTags((p) => p.filter((t) => t !== tag))} className="w-3.5 h-3.5 flex items-center justify-center rounded-full hover:bg-black/10 cursor-pointer leading-none">×</button>
                              </span>
                            ))}
                          </div>
                        )}
                        <input
                          autoFocus={editTags.length === 0}
                          type="text"
                          value={editTagInput}
                          onChange={(e) => setEditTagInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") { e.preventDefault(); const t = editTagInput.trim(); if (t && !editTags.includes(t)) setEditTags((p) => [...p, t]); setEditTagInput(""); }
                            if (e.key === "Escape") cancelEdit();
                          }}
                          placeholder="Type and press Enter…"
                          className="w-full text-[13px] text-gray-700 placeholder:text-gray-300 outline-none bg-transparent"
                        />
                      </div>
                      <EditActions />
                    </div>
                  ) : (
                    c.tags && c.tags.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {c.tags.map((tag) => (
                          <span key={tag} className={`text-[12px] font-medium px-2.5 py-0.5 rounded-full ${tagColor(tag)}`}>{tag}</span>
                        ))}
                      </div>
                    ) : <p className="text-[13px] text-gray-300">—</p>
                  )}
                </div>

                {/* Notes */}
                <div>
                  <FieldLabel label="Notes" field="notes" />
                  {editing === "notes" ? (
                    <div>
                      <textarea
                        autoFocus
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Escape") cancelEdit(); }}
                        rows={4}
                        placeholder="Add notes…"
                        className="w-full text-[13.5px] text-gray-800 border border-[#3B694C] rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-[#3B694C]/20 resize-none placeholder:text-gray-300"
                      />
                      <EditActions />
                    </div>
                  ) : (
                    c.notes
                      ? <p className="text-[13.5px] text-gray-700 leading-relaxed whitespace-pre-wrap">{c.notes}</p>
                      : <p className="text-[13px] text-gray-300">—</p>
                  )}
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-gray-100" />

              {/* Conversation */}
              <div className="space-y-4">
                <p className="text-[12px] font-bold text-gray-900 uppercase tracking-wider">Conversation</p>

                {conv ? (
                  <>
                    <div>
                      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Status</p>
                      <span className={`inline-block text-[12px] font-semibold px-2.5 py-0.5 rounded-full ${STATUS_STYLES[conv.status] ?? STATUS_STYLES.RESOLVED}`}>
                        {conv.status}
                      </span>
                    </div>

                    <div>
                      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Assigned to</p>
                      {conv.assignedAgent
                        ? <p className="text-[14px] text-gray-700">{conv.assignedAgent.username}</p>
                        : <p className="text-[13px] text-gray-400 italic">Unassigned</p>}
                    </div>

                    <div>
                      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Last message</p>
                      <p className="text-[14px] text-gray-700">
                        {conv.lastMessageAt ? formatRelativeTime(conv.lastMessageAt) : "—"}
                      </p>
                    </div>

                    <div>
                      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Window</p>
                      <p className={`text-[14px] font-medium ${window_.open ? "text-green-600" : "text-red-500"}`}>
                        {window_.label}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => { onClose(); router.push(`/chats/${conv.id}`); }}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#3B694C] hover:bg-[#2f5840] text-white text-[13px] font-semibold transition-colors cursor-pointer"
                    >
                      Open Conversation
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
                    </button>
                  </>
                ) : (
                  <p className="text-[13px] text-gray-400 italic">No conversation yet</p>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="shrink-0 border-t border-gray-100 px-5 py-4 space-y-3">
              <p className="text-[12px] text-gray-400">
                Member since <span className="font-medium text-gray-500">{formatMemberSince(c.createdAt)}</span>
              </p>

              {confirmDelete ? (
                <div className="space-y-2">
                  <p className="text-[12px] text-red-500 font-medium">Delete this customer? This cannot be undone.</p>
                  {deleteError && <p className="text-[11px] text-red-500">{deleteError}</p>}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => { setConfirmDelete(false); setDeleteError(null); }}
                      className="flex-1 py-2 rounded-xl border border-gray-200 text-[13px] font-semibold text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={deleting}
                      onClick={async () => {
                        const id = c._id ?? c.id;
                        if (id == null) return;
                        setDeleting(true);
                        setDeleteError(null);
                        try {
                          await apiDeleteCustomer(id);
                          onDeleted(id);
                          onClose();
                        } catch (err) {
                          setDeleteError(err instanceof Error ? err.message : "Failed to delete");
                        } finally {
                          setDeleting(false);
                        }
                      }}
                      className="flex-1 py-2 rounded-xl bg-red-500 hover:bg-red-600 disabled:opacity-60 disabled:cursor-not-allowed text-[13px] font-semibold text-white transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      {deleting ? (
                        <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                      ) : (
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                      )}
                      {deleting ? "Deleting…" : "Delete"}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="flex items-center gap-1.5 text-[12px] font-medium text-red-400 hover:text-red-600 transition-colors cursor-pointer"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                  Delete customer
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}

// ─── Skeleton row ─────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr className="border-b border-gray-100 animate-pulse">
      <td className="px-4 py-3.5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-gray-200 shrink-0" />
          <div className="space-y-1.5">
            <div className="h-3 bg-gray-200 rounded w-28" />
            <div className="h-2.5 bg-gray-100 rounded w-20" />
          </div>
        </div>
      </td>
      <td className="px-4 py-3.5"><div className="h-3 bg-gray-100 rounded w-32" /></td>
      <td className="px-4 py-3.5"><div className="flex gap-1.5"><div className="h-5 bg-gray-100 rounded-full w-14" /><div className="h-5 bg-gray-100 rounded-full w-10" /></div></td>
      <td className="px-4 py-3.5"><div className="h-3 bg-gray-100 rounded w-40" /></td>
      <td className="px-4 py-3.5"><div className="h-5 bg-gray-100 rounded-full w-20" /></td>
      <td className="px-4 py-3.5"><div className="h-3 bg-gray-100 rounded w-24" /></td>
      <td className="px-4 py-3.5"><div className="flex gap-2"><div className="h-7 bg-gray-100 rounded-lg w-20" /><div className="h-7 bg-gray-100 rounded-lg w-14" /></div></td>
    </tr>
  );
}

// ─── Import Progress Modal ────────────────────────────────────────────────────

interface ImportResult {
  total: number;
  created: number;
  skipped: number;
  errors: { row: number; reason: string }[];
}

function ImportResultModal({ result, onClose }: { result: ImportResult; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl px-6 py-6 w-[340px] space-y-4">
        <h3 className="text-[15px] font-bold text-gray-900">Import complete</h3>

        <div className="space-y-2">
          <div className="flex items-center gap-3 p-3 bg-green-50 rounded-xl">
            <svg className="w-4 h-4 text-green-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M20 6 9 17l-5-5"/></svg>
            <span className="text-[13px] font-semibold text-green-700">{result.created} imported</span>
          </div>
          {result.skipped > 0 && (
            <div className="flex items-center gap-3 p-3 bg-amber-50 rounded-xl">
              <svg className="w-4 h-4 text-amber-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>
              <span className="text-[13px] font-semibold text-amber-700">{result.skipped} skipped — duplicates</span>
            </div>
          )}
          {result.errors.length > 0 && (
            <details className="group">
              <summary className="flex items-center gap-3 p-3 bg-red-50 rounded-xl cursor-pointer list-none">
                <svg className="w-4 h-4 text-red-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/></svg>
                <span className="text-[13px] font-semibold text-red-600 flex-1">{result.errors.length} row{result.errors.length !== 1 ? "s" : ""} with errors</span>
                <svg className="w-3.5 h-3.5 text-red-400 group-open:rotate-180 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="m6 9 6 6 6-6"/></svg>
              </summary>
              <div className="mt-1 max-h-36 overflow-y-auto space-y-1 px-1">
                {result.errors.map((e, i) => (
                  <p key={i} className="text-[11px] text-red-500 px-2 py-0.5">Row {e.row}: {e.reason}</p>
                ))}
              </div>
            </details>
          )}
        </div>

        <button
          onClick={onClose}
          className="w-full py-2.5 rounded-xl bg-[#3B694C] hover:bg-[#2f5840] text-white text-[13px] font-semibold transition-colors cursor-pointer"
        >
          Done
        </button>
      </div>
    </div>
  );
}

// ─── New Customer Drawer ──────────────────────────────────────────────────────

interface NewDrawerProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

function NewCustomerDrawer({ open, onClose, onCreated }: NewDrawerProps) {
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const phoneRef = useRef<HTMLInputElement>(null);

  // Live normalized preview
  const normalizedPreview = phone.trim() ? normalizePhone(phone) : "";
  const phonePreviewValid = normalizedPreview ? isValidPhone(normalizedPreview) : null;

  useEffect(() => {
    if (open) {
      setPhone(""); setName(""); setEmail(""); setNotes("");
      setTags([]); setTagInput(""); setApiError(null); setErrors({});
      setTimeout(() => phoneRef.current?.focus(), 150);
    }
  }, [open]);

  function validate(): boolean {
    const errs: Record<string, string> = {};
    const normalized = normalizePhone(phone);
    if (!phone.trim()) errs.phone = "Phone number is required.";
    else if (!isValidPhone(normalized)) errs.phone = "Invalid phone number — couldn't parse it to a valid international number.";
    if (email.trim() && !isValidEmail(email)) errs.email = "Enter a valid email address.";
    if (name.trim().length > 100) errs.name = "Name must be 100 characters or fewer.";
    if (notes.trim().length > 1000) errs.notes = "Notes must be 1000 characters or fewer.";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) { phoneRef.current?.focus(); return; }
    setSubmitting(true); setApiError(null);
    try {
      await apiCreateCustomer({
        phone: normalizePhone(phone),
        ...(name.trim() ? { name: name.trim() } : {}),
        ...(email.trim() ? { email: email.trim() } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        ...(tags.length > 0 ? { tags } : {}),
      });
      onCreated(); onClose();
    } catch (err) {
      setApiError(err instanceof Error ? err.message : "Failed to create customer");
    } finally {
      setSubmitting(false);
    }
  }

  const inputCls = (field: string) =>
    `w-full text-[14px] text-gray-800 border rounded-xl px-4 py-3 outline-none placeholder:text-gray-400 transition-colors ${
      errors[field]
        ? "border-red-400 bg-red-50 focus:ring-2 focus:ring-red-200"
        : "border-gray-200 bg-white focus:ring-2 focus:ring-[#3B694C]/20 focus:border-[#3B694C]"
    }`;

  return (
    <div className={`fixed inset-0 z-[100] flex flex-col justify-end transition-opacity duration-300 ${open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className={`relative bg-white rounded-t-2xl shadow-2xl px-5 pt-4 pb-10 transition-transform duration-300 ease-out max-h-[92dvh] overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-200 [&::-webkit-scrollbar-thumb]:rounded-full ${open ? "translate-y-0" : "translate-y-full"}`}>
        <div className="w-9 h-1 rounded-full bg-gray-200 mx-auto mb-5" />
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-[17px] font-bold text-gray-900">New Customer</h2>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100 transition-colors cursor-pointer">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Phone */}
          <div className="space-y-1.5">
            <label className="text-[13px] font-medium text-gray-700">Phone <span className="text-red-500">*</span></label>
            <input
              ref={phoneRef}
              type="tel"
              value={phone}
              onChange={(e) => { setPhone(e.target.value); setErrors((p) => ({ ...p, phone: "" })); }}
              placeholder="+20 101 234 5678 or 01012345678"
              className={inputCls("phone")}
            />
            {/* Live preview */}
            {normalizedPreview && (
              <p className={`text-[12px] flex items-center gap-1 ${phonePreviewValid ? "text-green-600" : "text-amber-600"}`}>
                {phonePreviewValid ? (
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                ) : (
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M12 9v4M12 17h.01"/><circle cx="12" cy="12" r="10"/></svg>
                )}
                Will be stored as: <span className="font-mono font-semibold">{normalizedPreview}</span>
              </p>
            )}
            {errors.phone && <p className="text-[12px] text-red-500">{errors.phone}</p>}
          </div>

          {/* Name */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[13px] font-medium text-gray-700">Name</label>
              {name.length > 80 && <span className={`text-[11px] ${name.length > 100 ? "text-red-500" : "text-gray-400"}`}>{name.length}/100</span>}
            </div>
            <input type="text" value={name} onChange={(e) => { setName(e.target.value); setErrors((p) => ({ ...p, name: "" })); }} placeholder="Full name" className={inputCls("name")} />
            {errors.name && <p className="text-[12px] text-red-500">{errors.name}</p>}
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <label className="text-[13px] font-medium text-gray-700">Email</label>
            <input type="text" value={email} onChange={(e) => { setEmail(e.target.value); setErrors((p) => ({ ...p, email: "" })); }} placeholder="name@example.com" className={inputCls("email")} />
            {errors.email && <p className="text-[12px] text-red-500">{errors.email}</p>}
          </div>

          {/* Tags */}
          <div className="space-y-1.5">
            <label className="text-[13px] font-medium text-gray-700">Tags</label>
            <div className="border border-gray-200 rounded-xl px-3 py-2.5 bg-white focus-within:ring-2 focus-within:ring-[#3B694C]/20 focus-within:border-[#3B694C] transition-colors">
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {tags.map((tag) => (
                    <span key={tag} className={`inline-flex items-center gap-1 text-[12px] font-medium px-2 py-0.5 rounded-full ${tagColor(tag)}`}>
                      {tag}
                      <button type="button" onClick={() => setTags((p) => p.filter((t) => t !== tag))} className="w-3.5 h-3.5 flex items-center justify-center rounded-full hover:bg-black/10 transition-colors cursor-pointer leading-none">×</button>
                    </span>
                  ))}
                </div>
              )}
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const t = tagInput.trim();
                    if (!t) return;
                    if (t.length > 30) { setErrors((p) => ({ ...p, tags: "Each tag must be 30 characters or fewer." })); return; }
                    if (tags.length >= 10) { setErrors((p) => ({ ...p, tags: "Maximum 10 tags allowed." })); return; }
                    if (!tags.includes(t)) setTags((p) => [...p, t]);
                    setTagInput("");
                    setErrors((p) => ({ ...p, tags: "" }));
                  }
                }}
                placeholder="Type and press Enter to add tag"
                className="w-full text-[13px] text-gray-700 placeholder:text-gray-400 outline-none bg-transparent"
              />
            </div>
            {errors.tags && <p className="text-[12px] text-red-500">{errors.tags}</p>}
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[13px] font-medium text-gray-700">Notes</label>
              {notes.length > 800 && <span className={`text-[11px] ${notes.length > 1000 ? "text-red-500" : "text-gray-400"}`}>{notes.length}/1000</span>}
            </div>
            <textarea value={notes} onChange={(e) => { setNotes(e.target.value); setErrors((p) => ({ ...p, notes: "" })); }} placeholder="Any additional notes…" rows={3} className={`${inputCls("notes")} resize-none`} />
            {errors.notes && <p className="text-[12px] text-red-500">{errors.notes}</p>}
          </div>

          {apiError && <p className="text-[13px] text-red-500 font-medium text-center">{apiError}</p>}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 text-[13px] font-semibold text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer">Cancel</button>
            <button type="submit" disabled={submitting} className="flex-1 py-3 rounded-xl bg-[#3B694C] hover:bg-[#2f5840] disabled:opacity-60 disabled:cursor-not-allowed text-[13px] font-semibold text-white transition-colors cursor-pointer">{submitting ? "Creating…" : "Create Customer"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Send Template Drawer ─────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  GENERAL:  "bg-blue-50 text-blue-600",
  CAMPAIGN: "bg-purple-50 text-purple-600",
};
const CATEGORY_LABELS: Record<string, string> = {
  GENERAL:  "General",
  CAMPAIGN: "Campaign",
};

interface SendTemplateDrawerProps {
  customer: Customer | null;
  onClose: () => void;
  onSent: (conv: Conversation) => void;
}

function SendTemplateDrawer({ customer, onClose, onSent }: SendTemplateDrawerProps) {
  const router = useRouter();
  const open = customer !== null;

  const [templates, setTemplates] = useState<Template[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) { setSelected(null); setError(null); return; }
    setLoadingTemplates(true);
    apiGetTemplates({ status: "APPROVED" })
      .then((res) => {
        setTemplates(res.data.filter((t) => t.category === "GENERAL" || t.category === "CAMPAIGN"));
      })
      .catch(() => setTemplates([]))
      .finally(() => setLoadingTemplates(false));
  }, [open]);

  async function handleSend() {
    if (!customer || selected == null) return;
    const id = customer._id ?? customer.id;
    if (id == null) return;
    setSending(true);
    setError(null);
    try {
      const convRes = await apiCreateConversation(Number(id));
      const conv = convRes.data;
      await apiSendTemplate(String(conv.id), selected);
      onSent(conv);
      onClose();
      router.push(`/chats/${conv.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send");
    } finally {
      setSending(false);
    }
  }

  const selectedTemplate = templates.find((t) => t.id === selected);

  return (
    <>
      <div
        onClick={onClose}
        className={`fixed inset-0 z-[49] bg-black/20 transition-opacity duration-300 ${open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
      />
      <div
        className={`fixed top-0 right-0 h-full w-[420px] z-[50] bg-white shadow-2xl border-l border-gray-100 flex flex-col transition-transform duration-300 ease-out ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        {/* Header */}
        <div className="shrink-0 px-5 pt-5 pb-4 border-b border-gray-100">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Send Template</p>
              <p className="text-[16px] font-bold text-gray-900 truncate">
                {customer?.name || customer?.phone || "Customer"}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors cursor-pointer shrink-0"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </div>
          <p className="text-[12px] text-gray-400 mt-2">
            Pick an approved template to start the conversation.
          </p>
        </div>

        {/* Template list */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-200 [&::-webkit-scrollbar-thumb]:rounded-full">
          {loadingTemplates ? (
            <div className="flex items-center justify-center py-12">
              <svg className="w-5 h-5 animate-spin text-[#3B694C]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
            </div>
          ) : templates.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <div className="w-10 h-10 rounded-2xl bg-gray-100 flex items-center justify-center mb-1">
                <svg className="w-5 h-5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 9h6M9 13h4"/></svg>
              </div>
              <p className="text-[14px] font-semibold text-gray-700">No approved templates</p>
              <p className="text-[13px] text-gray-400">Create and submit a GENERAL or CAMPAIGN template first.</p>
            </div>
          ) : (
            templates.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelected(t.id)}
                className={`w-full text-left rounded-xl border px-4 py-3.5 transition-colors cursor-pointer ${
                  selected === t.id
                    ? "border-[#3B694C] bg-[#EEF6F1] ring-1 ring-[#3B694C]/20"
                    : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <p className="text-[13px] font-semibold text-gray-900 truncate">{t.name}</p>
                  <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full shrink-0 ${CATEGORY_COLORS[t.category] ?? "bg-gray-100 text-gray-500"}`}>
                    {CATEGORY_LABELS[t.category] ?? t.category}
                  </span>
                </div>
                <p className="text-[12px] text-gray-500 line-clamp-2 leading-relaxed">{t.body}</p>
              </button>
            ))
          )}
        </div>

        {/* Template preview */}
        {selectedTemplate && (
          <div className="shrink-0 border-t border-gray-100 px-5 py-4 bg-gray-50 space-y-2">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Preview</p>
            <div className="bg-white rounded-xl border border-gray-200 px-3 py-3 space-y-1.5 text-[12px] leading-relaxed text-gray-700">
              {selectedTemplate.header && (
                <p className="font-semibold text-gray-900">{selectedTemplate.header}</p>
              )}
              <p className="whitespace-pre-wrap">{selectedTemplate.body}</p>
              {selectedTemplate.footer && (
                <p className="text-gray-400 text-[11px]">{selectedTemplate.footer}</p>
              )}
              {selectedTemplate.buttons && selectedTemplate.buttons.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1 border-t border-gray-100">
                  {selectedTemplate.buttons.map((btn) => (
                    <span key={btn.id} className="text-[11px] font-semibold text-[#3B694C] border border-[#3B694C]/30 rounded-lg px-2 py-0.5">{btn.title}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="shrink-0 border-t border-gray-100 px-5 py-4">
          {error && <p className="text-[12px] text-red-500 mb-2">{error}</p>}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 text-[13px] font-semibold text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSend}
              disabled={selected == null || sending}
              className="flex-1 py-2.5 rounded-xl bg-[#3B694C] hover:bg-[#2f5840] disabled:opacity-50 disabled:cursor-not-allowed text-[13px] font-semibold text-white transition-colors cursor-pointer flex items-center justify-center gap-2"
            >
              {sending ? (
                <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
              ) : (
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2 11 13M22 2 15 22l-4-9-9-4 20-7z"/></svg>
              )}
              {sending ? "Sending…" : "Send Template"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CRMPage() {
  const router = useRouter();


  // ─ Customer list state ─────────────────────────────────────────────────────
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [search, setSearch] = useState("");

  const pageRef = useRef(1);
  const loadingMoreRef = useRef(false);
  const hasMoreRef = useRef(false);
  const searchRef = useRef(search);
  searchRef.current = search;

  // ─ Conversation map (customerId → Conversation) ────────────────────────────
  const [convMap, setConvMap] = useState<Map<number | string, Conversation>>(new Map());

  // ─ UI state ────────────────────────────────────────────────────────────────
  const [showNew, setShowNew] = useState(false);
  const [detailCustomer, setDetailCustomer] = useState<Customer | null>(null);
  const [templateTarget, setTemplateTarget] = useState<Customer | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─ Fetch conversations once (build lookup map) ─────────────────────────────
  useEffect(() => {
    apiGetConversations(1, 200)
      .then((res) => {
        const map = new Map<number | string, Conversation>();
        for (const conv of res.data) {
          const cid = conv.customerId;
          if (cid != null) map.set(cid, conv);
        }
        setConvMap(map);
      })
      .catch(() => {});
  }, []);

  // ─ Initial + search fetch ──────────────────────────────────────────────────
  const fetchPage1 = useCallback(async (q: string) => {
    setLoading(true);
    pageRef.current = 1;
    try {
      const res = await apiGetCustomers(1, PAGE_SIZE, q);
      setCustomers(res.data);
      const more = res.data.length >= PAGE_SIZE;
      setHasMore(more);
      hasMoreRef.current = more;
    } catch {
      setCustomers([]);
      setHasMore(false);
      hasMoreRef.current = false;
    } finally {
      setLoading(false);
    }
  }, []);

  // ─ Load more (infinite scroll) ────────────────────────────────────────────
  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !hasMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    const nextPage = pageRef.current + 1;
    try {
      const res = await apiGetCustomers(nextPage, PAGE_SIZE, searchRef.current);
      setCustomers((prev) => [...prev, ...res.data]);
      const more = res.data.length >= PAGE_SIZE;
      setHasMore(more);
      hasMoreRef.current = more;
      pageRef.current = nextPage;
    } catch {
      // swallow, just stop loading
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, []);

  // ─ IntersectionObserver for infinite scroll ────────────────────────────────
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) loadMore(); },
      { rootMargin: "200px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore]);

  // ─ Debounced search ────────────────────────────────────────────────────────
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchPage1(search), 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search, fetchPage1]);

  // ─ Export CSV ─────────────────────────────────────────────────────────────
  function exportCSV() {
    const header = ["id", "name", "phone", "email", "tags", "notes", "createdAt", "lastMessage", "waitingResponse", "assignedAgent"];
    const rows = customers.map((c) => {
      const id = c._id ?? c.id ?? "";
      const conv = convMap.get(Number(id)) ?? convMap.get(String(id));
      return [
        String(id),
        c.name ?? "",
        c.phone,
        c.email ?? "",
        (c.tags ?? []).join(";"),
        c.notes ?? "",
        c.createdAt,
        conv?.lastMessage ?? "",
        conv?.lastSenderType === "CUSTOMER" ? "yes" : "no",
        conv?.assignedAgent?.username ?? "",
      ].map(csvEscape).join(",");
    });
    const csv = [header.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `customers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ─ Import CSV ─────────────────────────────────────────────────────────────
  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setImporting(true);
    try {
      const res = await apiImportCustomers(file);
      setImportResult(res.data);
      fetchPage1(searchRef.current);
    } catch (err) {
      setImportResult({ total: 0, created: 0, skipped: 0, errors: [{ row: 0, reason: err instanceof Error ? err.message : "Import failed" }] });
    } finally {
      setImporting(false);
    }
  }

  // ─ Template download ───────────────────────────────────────────────────────
  function downloadTemplate() {
    const csv = "name,phone,email,tags,notes\nJohn Doe,+201001234567,john@example.com,\"VIP;lead\",Follow up";
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "customers_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  // ─ Conversation lookup helper ─────────────────────────────────────────────
  function getConv(customer: Customer): Conversation | undefined {
    const id = customer._id ?? customer.id;
    if (id == null) return undefined;
    return convMap.get(Number(id)) ?? convMap.get(String(id));
  }

  // ─ Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-full bg-white font-[family-name:var(--font-geist-sans)]">
      {/* Drawers & modals */}
      <CustomerDetailDrawer
        customer={detailCustomer}
        conv={detailCustomer ? getConv(detailCustomer) : undefined}
        onClose={() => setDetailCustomer(null)}
        onDeleted={(id) => {
          setCustomers((prev) => prev.filter((c) => String(c._id ?? c.id) !== String(id)));
          setDetailCustomer(null);
        }}
        onSaved={(updated) => {
          setCustomers((prev) =>
            prev.map((c) => {
              const cid = c._id ?? c.id;
              const uid = updated._id ?? updated.id;
              return String(cid) === String(uid) ? updated : c;
            })
          );
        }}
      />
      <NewCustomerDrawer
        open={showNew}
        onClose={() => setShowNew(false)}
        onCreated={() => fetchPage1(searchRef.current)}
      />
      <SendTemplateDrawer
        customer={templateTarget}
        onClose={() => setTemplateTarget(null)}
        onSent={(conv) => {
          const cid = conv.customerId;
          if (cid != null) {
            setConvMap((prev) => {
              const next = new Map(prev);
              next.set(Number(cid), conv);
              next.set(String(cid), conv);
              return next;
            });
          }
        }}
      />
      {importResult && (
        <ImportResultModal
          result={importResult}
          onClose={() => setImportResult(null)}
        />
      )}
      <input ref={importRef} type="file" accept=".csv" className="hidden" onChange={handleImportFile} />

      {/* Header */}
      <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100 gap-4 flex-wrap">
        <div>
          <h1 className="text-[22px] font-bold text-gray-900 tracking-tight">Customers</h1>
          <p className="text-[13px] text-gray-400 mt-0.5">CRM — admin view</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={downloadTemplate}
            className="flex items-center gap-1.5 border border-gray-200 text-gray-500 hover:bg-gray-50 text-[13px] font-semibold px-3.5 py-2 rounded-xl transition-colors cursor-pointer"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Template
          </button>
          <button
            type="button"
            onClick={() => !importing && importRef.current?.click()}
            disabled={importing}
            className="flex items-center gap-1.5 border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed text-[13px] font-semibold px-3.5 py-2 rounded-xl transition-colors cursor-pointer"
          >
            {importing ? (
              <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
            ) : (
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            )}
            {importing ? "Importing…" : "Import CSV"}
          </button>
          <button
            type="button"
            onClick={exportCSV}
            disabled={customers.length === 0}
            className="flex items-center gap-1.5 border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed text-[13px] font-semibold px-3.5 py-2 rounded-xl transition-colors cursor-pointer"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Export CSV
          </button>
          <button
            type="button"
            onClick={() => setShowNew(true)}
            className="flex items-center gap-2 bg-[#3B694C] hover:bg-[#2f5840] active:bg-[#264a33] text-white text-[13px] font-semibold px-4 py-2 rounded-xl transition-colors cursor-pointer"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            New Customer
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-6 py-4">
        <div className="flex items-center gap-2.5 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 max-w-sm focus-within:ring-2 focus-within:ring-[#3B694C]/20 focus-within:border-[#3B694C] transition-colors">
          <svg className="w-4 h-4 text-gray-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, phone, or email…"
            className="flex-1 text-[14px] text-gray-700 placeholder:text-gray-400 outline-none bg-transparent"
          />
          {search && (
            <button type="button" onClick={() => setSearch("")} className="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="px-6 pb-10 overflow-x-auto">
        <table className="w-full border-collapse min-w-[900px]">
          <thead>
            <tr className="border-b border-gray-100">
              {["Customer", "Email", "Tags", "Last Message", "Waiting", "Last Agent", ""].map((h) => (
                <th key={h} className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider px-4 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
            ) : customers.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-16 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center">
                      <svg className="w-6 h-6 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
                      </svg>
                    </div>
                    <p className="text-[14px] font-semibold text-gray-700">
                      {search ? "No customers found" : "No customers yet"}
                    </p>
                    <p className="text-[13px] text-gray-400">
                      {search ? "Try a different search term." : "Add your first customer to get started."}
                    </p>
                    {!search && (
                      <button type="button" onClick={() => setShowNew(true)} className="mt-1 flex items-center gap-1.5 bg-[#3B694C] hover:bg-[#2f5840] text-white text-[13px] font-semibold px-4 py-2 rounded-xl transition-colors cursor-pointer">
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                        New Customer
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              customers.map((customer, i) => {
                const id = customer._id ?? customer.id;
                const conv = getConv(customer);
                const isWaiting = conv?.lastSenderType === "CUSTOMER";

                return (
                  <tr
                    key={id != null ? String(id) : i}
                    onClick={() => setDetailCustomer(customer)}
                    className="border-b border-gray-100 hover:bg-[#EEF6F1] active:bg-[#DCF2E3] transition-colors duration-100 group cursor-pointer select-none"
                  >
                    {/* Name + Phone */}
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-[#DCF2E3] flex items-center justify-center text-[#3B694C] font-semibold text-[12px] shrink-0">
                          {getInitials(customer)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-[13px] font-semibold text-gray-900 truncate max-w-[160px]">
                            {customer.name || <span className="text-gray-400 font-normal">No name</span>}
                          </p>
                          <p className="text-[12px] text-gray-400">{customer.phone}</p>
                        </div>
                      </div>
                    </td>

                    {/* Email */}
                    <td className="px-4 py-3.5">
                      <span className="text-[13px] text-gray-500 truncate max-w-[180px] block">
                        {customer.email ?? <span className="text-gray-300">—</span>}
                      </span>
                    </td>

                    {/* Tags */}
                    <td className="px-4 py-3.5">
                      {customer.tags && customer.tags.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {customer.tags.slice(0, 3).map((tag) => (
                            <span key={tag} className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${tagColor(tag)}`}>{tag}</span>
                          ))}
                          {customer.tags.length > 3 && (
                            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">+{customer.tags.length - 3}</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-300 text-[13px]">—</span>
                      )}
                    </td>

                    {/* Last Message */}
                    <td className="px-4 py-3.5 max-w-[200px]">
                      {conv?.lastMessage ? (
                        <div>
                          <p className="text-[13px] text-gray-700 truncate">{truncate(conv.lastMessage, 55)}</p>
                          <p className="text-[11px] text-gray-400 mt-0.5">{formatRelativeTime(conv.lastMessageAt)}</p>
                        </div>
                      ) : (
                        <span className="text-gray-300 text-[13px]">—</span>
                      )}
                    </td>

                    {/* Waiting Response */}
                    <td className="px-4 py-3.5">
                      {isWaiting ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-600 border border-amber-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                          Waiting
                        </span>
                      ) : (
                        <span className="text-gray-300 text-[13px]">—</span>
                      )}
                    </td>

                    {/* Last Agent */}
                    <td className="px-4 py-3.5">
                      {conv?.assignedAgent ? (
                        <span className="text-[13px] text-gray-600">{conv.assignedAgent.username}</span>
                      ) : (
                        <span className="text-[12px] text-gray-300">Unassigned</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        {conv?.id != null ? (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); router.push(`/chats/${conv.id}`); }}
                            className="flex items-center gap-1.5 text-[12px] font-semibold text-[#3B694C] bg-[#3B694C]/10 hover:bg-[#3B694C]/20 px-3 py-1.5 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                          >
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                            Open Chat
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setTemplateTarget(customer); }}
                            className="flex items-center gap-1.5 text-[12px] font-semibold text-purple-600 bg-purple-50 hover:bg-purple-100 px-3 py-1.5 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                          >
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2 11 13M22 2 15 22l-4-9-9-4 20-7z"/></svg>
                            Send Template
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {/* Infinite scroll sentinel */}
        <div ref={sentinelRef} className="h-1" />

        {/* Load more indicator */}
        {loadingMore && (
          <div className="flex items-center justify-center py-6 gap-2 text-[13px] text-gray-400">
            <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
            Loading more…
          </div>
        )}

        {!loading && !loadingMore && !hasMore && customers.length > 0 && (
          <p className="text-center text-[12px] text-gray-300 py-6">
            {customers.length} customer{customers.length !== 1 ? "s" : ""} total
          </p>
        )}
      </div>
    </div>
  );
}
