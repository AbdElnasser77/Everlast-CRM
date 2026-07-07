"use client";

import { useState, useEffect, useCallback } from "react";
import { apiGetCustomers } from "@/lib/api";
import type { Customer } from "@/types";

function customerKey(c: Customer): string {
  return String(c._id ?? c.id);
}

function customerId(c: Customer): number {
  return Number(c._id ?? c.id);
}

const PAGE_SIZE = 30;

// Reusable "pick contacts" modal: search + paginated checkbox list. Selections
// persist across searches. Used by the Lists "select from contacts" flow.
export default function ContactPicker({
  title = "Select contacts",
  confirmLabel = "Add",
  onCancel,
  onConfirm,
}: {
  title?: string;
  confirmLabel?: string;
  onCancel: () => void;
  onConfirm: (ids: number[]) => void;
}) {
  const [search, setSearch] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const load = useCallback(async (p: number, q: string, append: boolean) => {
    setLoading(true);
    try {
      const res = await apiGetCustomers(p, PAGE_SIZE, q);
      setCustomers((prev) => (append ? [...prev, ...res.data] : res.data));
      setTotalPages(res.pagination.totalPages);
      setPage(p);
    } catch {
      // keep the prior list on error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(1, search, false), 300);
    return () => clearTimeout(t);
  }, [search, load]);

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-[520px] max-w-full max-h-[80vh] flex flex-col">
        <div className="shrink-0 px-5 pt-5 pb-4 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <h3 className="text-[15px] font-bold text-gray-900">{title}</h3>
            <button type="button" onClick={onCancel} className="text-gray-400 hover:text-gray-600 cursor-pointer">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </div>
          <div className="mt-3 flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 focus-within:ring-2 focus-within:ring-[#3B694C]/20 focus-within:border-[#3B694C] transition-colors">
            <svg className="w-4 h-4 text-gray-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search contacts…"
              className="flex-1 bg-transparent text-[13px] outline-none"
              autoFocus
            />
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-2 py-2 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-gray-200 [&::-webkit-scrollbar-thumb]:rounded-full">
          {customers.length === 0 && !loading ? (
            <p className="text-[13px] text-gray-400 text-center py-10">No contacts found.</p>
          ) : (
            <ul className="space-y-0.5">
              {customers.map((c) => {
                const id = customerId(c);
                const checked = selected.has(id);
                return (
                  <li key={customerKey(c)}>
                    <label className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(id)}
                        className="w-4 h-4 rounded accent-[#3B694C] cursor-pointer shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium text-gray-800 truncate">{c.name || "—"}</p>
                        <p className="text-[11.5px] text-gray-400 truncate">
                          {c.phone}{c.chartNumber ? ` · #${c.chartNumber}` : ""}
                        </p>
                      </div>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          {loading && (
            <div className="flex justify-center py-4">
              <svg className="w-5 h-5 animate-spin text-[#3B694C]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
            </div>
          )}
          {!loading && page < totalPages && (
            <button
              type="button"
              onClick={() => load(page + 1, search, true)}
              className="w-full text-center text-[12px] font-semibold text-[#3B694C] hover:underline py-2 cursor-pointer"
            >
              Load more
            </button>
          )}
        </div>

        <div className="shrink-0 border-t border-gray-100 px-5 py-4 flex items-center justify-between gap-3">
          <p className="text-[12px] text-gray-500">{selected.size} selected</p>
          <div className="flex gap-3">
            <button type="button" onClick={onCancel} className="py-2.5 px-4 rounded-xl border border-gray-200 text-[13px] font-semibold text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onConfirm([...selected])}
              disabled={selected.size === 0}
              className="py-2.5 px-4 rounded-xl bg-[#3B694C] hover:bg-[#2f5840] disabled:opacity-50 disabled:cursor-not-allowed text-[13px] font-semibold text-white transition-colors cursor-pointer"
            >
              {confirmLabel}{selected.size > 0 ? ` (${selected.size})` : ""}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
