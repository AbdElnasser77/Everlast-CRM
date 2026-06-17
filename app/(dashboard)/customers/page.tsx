"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { apiGetCustomers, apiCreateCustomer } from "@/lib/api";
import type { Customer } from "@/types";

// ─── Helpers ────────────────────────────────────────────────────────────────

function getInitials(customer: Customer): string {
  const src = customer.name || customer.phone;
  if (!src) return "?";
  return src
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// Deterministic color from a string
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

// ─── Skeleton row ────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr className="border-b border-gray-100 animate-pulse">
      <td className="px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-gray-200 shrink-0" />
          <div className="h-3.5 bg-gray-200 rounded w-28" />
        </div>
      </td>
      <td className="px-5 py-4">
        <div className="h-3 bg-gray-100 rounded w-24" />
      </td>
      <td className="px-5 py-4">
        <div className="h-3 bg-gray-100 rounded w-32" />
      </td>
      <td className="px-5 py-4">
        <div className="flex gap-1.5">
          <div className="h-5 bg-gray-100 rounded-full w-14" />
          <div className="h-5 bg-gray-100 rounded-full w-12" />
        </div>
      </td>
      <td className="px-5 py-4">
        <div className="h-3 bg-gray-100 rounded w-20" />
      </td>
    </tr>
  );
}

// ─── New Customer Drawer ─────────────────────────────────────────────────────

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

function NewCustomerDrawer({ open, onClose, onCreated }: DrawerProps) {
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState(false);
  const phoneRef = useRef<HTMLInputElement>(null);

  // Reset form when drawer opens
  useEffect(() => {
    if (open) {
      setPhone("");
      setName("");
      setEmail("");
      setNotes("");
      setTags([]);
      setTagInput("");
      setError(null);
      setPhoneError(false);
      setTimeout(() => phoneRef.current?.focus(), 150);
    }
  }, [open]);

  function addTag() {
    const t = tagInput.trim();
    if (t && !tags.includes(t)) setTags((prev) => [...prev, t]);
    setTagInput("");
  }

  function removeTag(tag: string) {
    setTags((prev) => prev.filter((t) => t !== tag));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!phone.trim()) {
      setPhoneError(true);
      phoneRef.current?.focus();
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await apiCreateCustomer({
        phone: phone.trim(),
        ...(name.trim() ? { name: name.trim() } : {}),
        ...(email.trim() ? { email: email.trim() } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        ...(tags.length > 0 ? { tags } : {}),
      });
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create customer");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className={`fixed inset-0 z-[100] flex flex-col justify-end transition-opacity duration-300 ${
        open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
      }`}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Panel */}
      <div
        className={`relative bg-white rounded-t-2xl shadow-2xl px-5 pt-4 pb-10 transition-transform duration-300 ease-out max-h-[92dvh] overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-200 [&::-webkit-scrollbar-thumb]:rounded-full ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
      >
        {/* Handle */}
        <div className="w-9 h-1 rounded-full bg-gray-200 mx-auto mb-5" />

        {/* Title */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-[17px] font-bold text-gray-900">New Customer</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100 transition-colors cursor-pointer"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Phone — required */}
          <div className="space-y-1.5">
            <label className="text-[13px] font-medium text-gray-700">
              Phone <span className="text-red-500">*</span>
            </label>
            <input
              ref={phoneRef}
              type="tel"
              value={phone}
              onChange={(e) => { setPhone(e.target.value); setPhoneError(false); }}
              placeholder="+1 555 000 0000"
              className={`w-full text-[14px] text-gray-800 border rounded-xl px-4 py-3 outline-none placeholder:text-gray-400 transition-colors ${
                phoneError
                  ? "border-red-400 bg-red-50 focus:ring-2 focus:ring-red-200"
                  : "border-gray-200 bg-white focus:ring-2 focus:ring-[#3B694C]/20 focus:border-[#3B694C]"
              }`}
            />
            {phoneError && (
              <p className="text-[12px] text-red-500">Phone number is required.</p>
            )}
          </div>

          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-[13px] font-medium text-gray-700">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full name"
              className="w-full text-[14px] text-gray-800 border border-gray-200 rounded-xl px-4 py-3 outline-none placeholder:text-gray-400 bg-white focus:ring-2 focus:ring-[#3B694C]/20 focus:border-[#3B694C] transition-colors"
            />
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <label className="text-[13px] font-medium text-gray-700">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              className="w-full text-[14px] text-gray-800 border border-gray-200 rounded-xl px-4 py-3 outline-none placeholder:text-gray-400 bg-white focus:ring-2 focus:ring-[#3B694C]/20 focus:border-[#3B694C] transition-colors"
            />
          </div>

          {/* Tags */}
          <div className="space-y-1.5">
            <label className="text-[13px] font-medium text-gray-700">Tags</label>
            <div className="border border-gray-200 rounded-xl px-3 py-2.5 bg-white focus-within:ring-2 focus-within:ring-[#3B694C]/20 focus-within:border-[#3B694C] transition-colors">
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className={`inline-flex items-center gap-1 text-[12px] font-medium px-2 py-0.5 rounded-full ${tagColor(tag)}`}
                    >
                      {tag}
                      <button
                        type="button"
                        onClick={() => removeTag(tag)}
                        className="w-3.5 h-3.5 flex items-center justify-center rounded-full hover:bg-black/10 transition-colors cursor-pointer leading-none"
                      >
                        ×
                      </button>
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
                    addTag();
                  }
                }}
                placeholder="Type and press Enter to add tag"
                className="w-full text-[13px] text-gray-700 placeholder:text-gray-400 outline-none bg-transparent"
              />
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <label className="text-[13px] font-medium text-gray-700">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any additional notes..."
              rows={3}
              className="w-full text-[14px] text-gray-800 border border-gray-200 rounded-xl px-4 py-3 outline-none placeholder:text-gray-400 bg-white focus:ring-2 focus:ring-[#3B694C]/20 focus:border-[#3B694C] transition-colors resize-none"
            />
          </div>

          {/* API error */}
          {error && (
            <p className="text-[13px] text-red-500 font-medium text-center">{error}</p>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 rounded-xl border border-gray-200 text-[13px] font-semibold text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 py-3 rounded-xl bg-[#3B694C] hover:bg-[#2f5840] disabled:opacity-60 disabled:cursor-not-allowed text-[13px] font-semibold text-white transition-colors cursor-pointer"
            >
              {submitting ? "Creating…" : "Create Customer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function CustomersPage() {
  const router = useRouter();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page] = useState(1);
  const [showDrawer, setShowDrawer] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestSearch = useRef(search);
  latestSearch.current = search;

  const fetchCustomers = useCallback(
    async (q: string, pg: number) => {
      setLoading(true);
      try {
        const res = await apiGetCustomers(pg, 20, q);
        setCustomers(res.data);
      } catch {
        setCustomers([]);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Fetch on page change immediately
  useEffect(() => {
    fetchCustomers(latestSearch.current, page);
  }, [page, fetchCustomers]);

  // Debounce search input
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchCustomers(search, 1);
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search, fetchCustomers]);

  function handleRowClick(customer: Customer) {
    const id = customer._id ?? customer.id;
    if (id != null) router.push(`/customers/${id}`);
  }

  return (
    <div className="min-h-full bg-white font-[family-name:var(--font-geist-sans)]">
      <NewCustomerDrawer
        open={showDrawer}
        onClose={() => setShowDrawer(false)}
        onCreated={() => fetchCustomers(search, page)}
      />

      {/* Page header */}
      <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
        <h1 className="text-[22px] font-bold text-gray-900 tracking-tight">Customers</h1>
        <button
          type="button"
          onClick={() => setShowDrawer(true)}
          className="flex items-center gap-2 bg-[#3B694C] hover:bg-[#2f5840] active:bg-[#264a33] text-white text-[13px] font-semibold px-4 py-2.5 rounded-xl transition-colors cursor-pointer"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          New Customer
        </button>
      </div>

      {/* Search bar */}
      <div className="px-6 py-4">
        <div className="flex items-center gap-2.5 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 max-w-md focus-within:ring-2 focus-within:ring-[#3B694C]/20 focus-within:border-[#3B694C] transition-colors">
          <svg
            className="w-4 h-4 text-gray-400 shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, phone, or email…"
            className="flex-1 text-[14px] text-gray-700 placeholder:text-gray-400 outline-none bg-transparent"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="px-6 pb-10 overflow-x-auto">
        <table className="w-full border-collapse min-w-[600px]">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider px-5 py-3">
                Customer
              </th>
              <th className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider px-5 py-3">
                Phone
              </th>
              <th className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider px-5 py-3">
                Email
              </th>
              <th className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider px-5 py-3">
                Tags
              </th>
              <th className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider px-5 py-3">
                Created
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)
            ) : customers.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-16 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center">
                      <svg
                        className="w-6 h-6 text-gray-400"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <circle cx="12" cy="8" r="4" />
                        <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
                      </svg>
                    </div>
                    <p className="text-[14px] font-semibold text-gray-700">
                      {search ? "No customers found" : "No customers yet"}
                    </p>
                    <p className="text-[13px] text-gray-400">
                      {search
                        ? "Try a different search term."
                        : "Add your first customer to get started."}
                    </p>
                    {!search && (
                      <button
                        type="button"
                        onClick={() => setShowDrawer(true)}
                        className="mt-1 flex items-center gap-1.5 bg-[#3B694C] hover:bg-[#2f5840] text-white text-[13px] font-semibold px-4 py-2 rounded-xl transition-colors cursor-pointer"
                      >
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                          <path d="M12 5v14M5 12h14" />
                        </svg>
                        New Customer
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              customers.map((customer, i) => {
                const id = customer._id ?? customer.id;
                const initials = getInitials(customer);
                const displayName = customer.name || customer.phone;

                return (
                  <tr
                    key={id != null ? String(id) : i}
                    onClick={() => handleRowClick(customer)}
                    className="border-b border-gray-50 hover:bg-gray-50 transition-colors cursor-pointer group"
                  >
                    {/* Name + avatar */}
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-[#DCF2E3] flex items-center justify-center text-[#3B694C] font-semibold text-[12px] shrink-0">
                          {initials}
                        </div>
                        <span className="text-[14px] font-semibold text-gray-900 group-hover:text-[#3B694C] transition-colors truncate max-w-[180px]">
                          {displayName}
                        </span>
                      </div>
                    </td>

                    {/* Phone */}
                    <td className="px-5 py-4">
                      <span className="text-[13px] text-gray-600">{customer.phone}</span>
                    </td>

                    {/* Email */}
                    <td className="px-5 py-4">
                      <span className="text-[13px] text-gray-500">
                        {customer.email ?? <span className="text-gray-300">—</span>}
                      </span>
                    </td>

                    {/* Tags */}
                    <td className="px-5 py-4">
                      {customer.tags && customer.tags.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {customer.tags.slice(0, 3).map((tag) => (
                            <span
                              key={tag}
                              className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${tagColor(tag)}`}
                            >
                              {tag}
                            </span>
                          ))}
                          {customer.tags.length > 3 && (
                            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                              +{customer.tags.length - 3}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-300 text-[13px]">—</span>
                      )}
                    </td>

                    {/* Created */}
                    <td className="px-5 py-4">
                      <span className="text-[13px] text-gray-400">{formatDate(customer.createdAt)}</span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
