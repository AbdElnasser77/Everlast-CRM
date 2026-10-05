"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Pencil, Trash2, UserPlus, Upload, Megaphone } from "lucide-react";
import {
  apiGetList,
  apiUpdateList,
  apiDeleteList,
  apiAddListMembers,
  apiRemoveListMember,
} from "@/lib/api";
import ContactPicker from "@/components/ContactPicker";
import type { Customer, ContactList } from "@/types";
import { useCurrentUser } from "@/components/CurrentUserProvider";

const PAGE_SIZE = 30;

type Member = Customer & { addedAt: string };

function memberKey(c: Member): string {
  return String(c._id ?? c.id);
}

function memberId(c: Member): number {
  return Number(c._id ?? c.id);
}

export default function ListDetailPage() {
  // Viewing lists is list:read (every role); creating, editing, importing into
  // and deleting them is list:write — agents may use a list, not reshape it.
  const { can } = useCurrentUser();
  const canEdit = can("list:write");
  const canCampaign = can("campaign:write", "campaign:send");
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [list, setList] = useState<ContactList | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showEdit, setShowEdit] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [showPicker, setShowPicker] = useState(false);
  const [removingId, setRemovingId] = useState<number | null>(null);

  const load = useCallback(async (p: number, q: string, append: boolean) => {
    if (append) setLoadingMore(true); else setLoading(true);
    setError(null);
    try {
      const res = await apiGetList(id, p, PAGE_SIZE, q);
      setList(res.data);
      setMembers((prev) => (append ? [...prev, ...(res.data.members as Member[])] : (res.data.members as Member[])));
      setTotalPages(res.pagination.totalPages);
      setTotal(res.pagination.total);
      setPage(p);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load list");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [id]);

  useEffect(() => {
    const t = setTimeout(() => load(1, search, false), search ? 300 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, id]);

  function openEdit() {
    if (!list) return;
    setEditName(list.name);
    setEditDescription(list.description || "");
    setEditError(null);
    setShowEdit(true);
  }

  async function saveEdit() {
    if (!editName.trim()) return;
    setSaving(true);
    setEditError(null);
    try {
      const res = await apiUpdateList(id, { name: editName.trim(), description: editDescription.trim() });
      setList((prev) => (prev ? { ...prev, ...res.data } : res.data));
      setShowEdit(false);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to update list");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDeleteList() {
    setDeleting(true);
    try {
      await apiDeleteList(id);
      router.push("/customers/lists");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete list");
      setDeleting(false);
    }
  }

  async function handlePickerConfirm(ids: number[]) {
    setShowPicker(false);
    try {
      await apiAddListMembers(id, ids);
      load(1, search, false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add contacts");
    }
  }

  async function removeMember(customerId: number) {
    setRemovingId(customerId);
    try {
      await apiRemoveListMember(id, customerId);
      setMembers((prev) => prev.filter((m) => memberId(m) !== customerId));
      setTotal((t) => Math.max(0, t - 1));
      setList((prev) => (prev ? { ...prev, memberCount: Math.max(0, prev.memberCount - 1) } : prev));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove contact");
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100 gap-4 flex-wrap">
        <div className="min-w-0">
          <button
            type="button"
            onClick={() => router.push("/customers/lists")}
            className="flex items-center gap-1 text-[12px] font-semibold text-gray-400 hover:text-gray-600 mb-1.5 cursor-pointer"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
            Lists
          </button>
          <div className="flex items-center gap-2">
            <h1 className="text-[22px] font-bold text-gray-900 tracking-tight truncate">{list?.name ?? "Loading…"}</h1>
            {list && canEdit && (
              <button type="button" onClick={openEdit} className="text-gray-300 hover:text-gray-500 cursor-pointer shrink-0">
                <Pencil className="w-4 h-4" />
              </button>
            )}
          </div>
          <p className="text-[13px] text-gray-400 mt-0.5 truncate">
            {list?.description || "No description"} · {(list?.memberCount ?? 0).toLocaleString()} contact{(list?.memberCount ?? 0) !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {canCampaign && (
          <button
            type="button"
            onClick={() => router.push(`/campaigns/new?listId=${id}`)}
            disabled={!list || list.memberCount === 0}
            title={list && list.memberCount === 0 ? "Add contacts to this list first" : undefined}
            className="flex items-center gap-1.5 border border-gray-200 text-gray-600 hover:bg-gray-50 text-[13px] font-semibold px-3.5 py-2 rounded-xl transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          >
            <Megaphone className="w-3.5 h-3.5" />
            Create Campaign
          </button>
          )}
          {canEdit && (
          <button
            type="button"
            onClick={() => router.push(`/customers/lists/${id}/import`)}
            className="flex items-center gap-1.5 border border-gray-200 text-gray-600 hover:bg-gray-50 text-[13px] font-semibold px-3.5 py-2 rounded-xl transition-colors cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            Import CSV
          </button>
          )}
          {canEdit && (
          <button
            type="button"
            onClick={() => setShowPicker(true)}
            className="flex items-center gap-2 bg-[#3B694C] hover:bg-[#2f5840] active:bg-[#264a33] text-white text-[13px] font-semibold px-4 py-2 rounded-xl transition-colors cursor-pointer"
          >
            <UserPlus className="w-3.5 h-3.5" />
            Add contacts
          </button>
          )}
          {canEdit && (
          <button
            type="button"
            onClick={() => setShowDelete(true)}
            className="p-2 rounded-xl border border-gray-200 text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer"
            title="Delete list"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="shrink-0 px-6 py-4">
        <div className="flex items-center gap-2.5 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 max-w-sm focus-within:ring-2 focus-within:ring-[#3B694C]/20 focus-within:border-[#3B694C] transition-colors">
          <svg className="w-4 h-4 text-gray-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search this list…"
            className="flex-1 bg-transparent text-[13px] outline-none"
          />
        </div>
      </div>

      {error && <p className="shrink-0 text-[13px] text-red-500 text-center px-6 pb-2">{error}</p>}

      {/* Members table */}
      <div className="flex-1 min-h-0 overflow-auto px-6 pb-6 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-gray-200 [&::-webkit-scrollbar-thumb]:rounded-full">
        {loading ? (
          <div className="flex justify-center py-16">
            <svg className="w-6 h-6 animate-spin text-[#3B694C]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
          </div>
        ) : members.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-[14px] font-semibold text-gray-700">No contacts in this list yet</p>
            <p className="text-[13px] text-gray-400 mt-1">Add contacts individually or import a CSV.</p>
          </div>
        ) : (
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="sticky top-0 z-10 bg-white shadow-[0_1px_0_#e5e7eb]">
                <th className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider px-3 py-2.5">Contact</th>
                <th className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider px-3 py-2.5">Mobile</th>
                <th className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider px-3 py-2.5">Chart #</th>
                <th className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider px-3 py-2.5">Email</th>
                <th className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider px-3 py-2.5">Added</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const mid = memberId(m);
                return (
                  <tr key={memberKey(m)} className="border-b border-gray-50 hover:bg-gray-50/60">
                    <td className="px-3 py-2.5">
                      <button type="button" onClick={() => router.push(`/customers/${m._id ?? m.id}`)} className="text-[13px] font-medium text-gray-800 hover:text-[#3B694C] cursor-pointer">
                        {m.name || "—"}
                      </button>
                    </td>
                    <td className="px-3 py-2.5 text-[13px] text-gray-500">{m.phone}</td>
                    <td className="px-3 py-2.5 text-[13px] text-gray-500">{m.chartNumber || "—"}</td>
                    <td className="px-3 py-2.5 text-[13px] text-gray-500">{m.email || "—"}</td>
                    <td className="px-3 py-2.5 text-[12px] text-gray-400">{new Date(m.addedAt).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}</td>
                    <td className="px-3 py-2.5 text-right">
                      {canEdit && (
                      <button
                        type="button"
                        onClick={() => removeMember(mid)}
                        disabled={removingId === mid}
                        className="text-[12px] font-semibold text-gray-400 hover:text-red-500 disabled:opacity-50 cursor-pointer"
                      >
                        {removingId === mid ? "Removing…" : "Remove"}
                      </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {!loading && page < totalPages && (
          <div className="flex justify-center py-4">
            <button
              type="button"
              onClick={() => load(page + 1, search, true)}
              disabled={loadingMore}
              className="text-[12px] font-semibold text-[#3B694C] hover:underline disabled:opacity-50 cursor-pointer"
            >
              {loadingMore ? "Loading…" : `Load more (${total - members.length} remaining)`}
            </button>
          </div>
        )}
      </div>

      {showPicker && (
        <ContactPicker
          title={`Add contacts to "${list?.name ?? ""}"`}
          confirmLabel="Add to list"
          onCancel={() => setShowPicker(false)}
          onConfirm={handlePickerConfirm}
        />
      )}

      {/* Edit modal */}
      {showEdit && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-2xl px-6 py-6 w-[420px] max-w-full space-y-4">
            <h3 className="text-[15px] font-bold text-gray-900">Edit list</h3>
            <div className="space-y-3">
              <div>
                <label className="text-[12px] font-semibold text-gray-600 mb-1 block">List name</label>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full text-[13px] rounded-xl border border-gray-200 px-3 py-2.5 outline-none focus:ring-2 focus:ring-[#3B694C]/20 focus:border-[#3B694C] transition-colors"
                />
              </div>
              <div>
                <label className="text-[12px] font-semibold text-gray-600 mb-1 block">Description</label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={3}
                  className="w-full text-[13px] rounded-xl border border-gray-200 px-3 py-2.5 outline-none focus:ring-2 focus:ring-[#3B694C]/20 focus:border-[#3B694C] transition-colors resize-none"
                />
              </div>
            </div>
            {editError && <p className="text-[12px] text-red-500">{editError}</p>}
            <div className="flex gap-3">
              <button type="button" onClick={() => setShowEdit(false)} disabled={saving} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-[13px] font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-60 transition-colors cursor-pointer">
                Cancel
              </button>
              <button type="button" onClick={saveEdit} disabled={saving || !editName.trim()} className="flex-1 py-2.5 rounded-xl bg-[#3B694C] hover:bg-[#2f5840] disabled:opacity-50 text-[13px] font-semibold text-white transition-colors cursor-pointer">
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete list confirmation */}
      {showDelete && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-2xl px-6 py-6 w-[380px] max-w-full space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <h3 className="text-[15px] font-bold text-gray-900">Delete this list?</h3>
                <p className="text-[12px] text-gray-400 mt-0.5">This won&apos;t delete the contacts themselves.</p>
              </div>
            </div>
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setShowDelete(false)} disabled={deleting} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-[13px] font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-60 transition-colors cursor-pointer">
                Cancel
              </button>
              <button type="button" onClick={confirmDeleteList} disabled={deleting} className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 disabled:opacity-60 text-[13px] font-semibold text-white transition-colors cursor-pointer">
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
