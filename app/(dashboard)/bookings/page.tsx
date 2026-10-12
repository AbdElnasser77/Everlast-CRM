"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, CalendarCheck2, CalendarDays, CalendarPlus, CircleSlash, ClipboardList, Hourglass, Loader2,
  MessageCircle, RefreshCw, RotateCcw, Search, UserRoundCheck, X,
} from "lucide-react";
import { apiGetBookingRequest, apiGetBookingRequestCounts, apiGetBookingRequests } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import type { BookingRequest, BookingRequestCounts, BookingRequestStatus } from "@/types";
import { useCurrentUser } from "@/components/CurrentUserProvider";
import { PageSpinner } from "@/components/ui/spinner";
import { ErrorPanel } from "@/components/ErrorPanel";
import { NoAccess } from "@/components/NoAccess";
import { AppointmentCard, RequestStatusChip, RequestedDetails } from "@/components/bookings/RequestParts";
import { useRequestActions } from "@/components/bookings/useRequestActions";
import { fmtWhen, personName, sortBookings } from "@/lib/chatOutcome";
import {
  isOpenRequest, notBookedLabel, onRequestChanged, requestAge, requestPreferred, requestService, requestSource,
} from "@/lib/bookingRequests";

// ── Bookings ──────────────────────────────────────────────────────────────────
//
// The agents' booking queue for the WhatsApp line in view: patients who asked to
// book (through the booking flow, or in chat). Take one, book it in Dok32, record
// it here — or close it with a reason. Open ones come oldest first.
//
// Live: socket events schedule a debounced refresh; a 30s poll covers the rest.

type Tab = "new" | "in_progress" | "mine" | "booked" | "not_booked";

const TABS: {
  value: Tab;
  label: string;
  params: { status: "open" | BookingRequestStatus; mine?: boolean };
  count?: keyof BookingRequestCounts;
  empty: string;
}[] = [
  { value: "new", label: "New", params: { status: "NEW" }, count: "new", empty: "No new requests. Patients who ask to book land here." },
  { value: "in_progress", label: "In progress", params: { status: "IN_PROGRESS" }, count: "inProgress", empty: "Nothing in progress right now." },
  { value: "mine", label: "Mine", params: { status: "open", mine: true }, count: "mine", empty: "You aren't handling any requests. Take one from New." },
  { value: "booked", label: "Booked", params: { status: "BOOKED" }, count: "bookedToday", empty: "Nothing booked yet." },
  { value: "not_booked", label: "Not booked", params: { status: "NOT_BOOKED" }, empty: "No requests closed without a booking." },
];

const PAGE = 30;
const POLL_MS = 30_000;
const DEBOUNCE_MS = 400;
const LIVE_EVENTS = ["booking_request.created", "booking_request.updated", "conversation.outcome", "connect"];

const SCROLL =
  "[&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-[#3B694C]/25 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-[#3B694C]/50";

type ListState = { key: string; pages: number; rows: BookingRequest[]; total: number };

const initialsOf = (s: string | null | undefined) =>
  (s || "?").split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";

function shortTime(iso: string): string {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days === 0 && d.getDate() === new Date().getDate()) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (days <= 1) return "Yesterday";
  if (days < 7) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default function BookingsPage() {
  const { ready, can } = useCurrentUser();
  if (!ready) return <PageSpinner />;
  if (!can("conversation:read")) return <NoAccess what="Bookings" />;
  return <BookingsBoard />;
}

function BookingsBoard() {
  const { can, me } = useCurrentUser();
  const canWork = can("conversation:write");
  const [tab, setTab] = useState<Tab>("new");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [counts, setCounts] = useState<BookingRequestCounts | null>(null);
  const [list, setList] = useState<ListState | null>(null);
  const [listError, setListError] = useState<{ key: string; error: Error } | null>(null);
  const [want, setWant] = useState<{ key: string; pages: number }>({ key: "", pages: 1 });
  const [selected, setSelected] = useState<BookingRequest | null>(null);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);
  const actions = useRequestActions(refresh);

  // Search: debounced, server-side.
  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const queryKey = `${tab}|${query}`;
  const pages = want.key === queryKey ? want.pages : 1;

  // The list: every page loaded so far, refetched together on a refresh so a
  // request that moved on drops out and the order stays the server's.
  useEffect(() => {
    let cancelled = false;
    const params = TABS.find((t) => t.value === tab)!.params;
    Promise.all(
      Array.from({ length: pages }, (_, i) =>
        apiGetBookingRequests({ ...params, search: query || undefined, page: i + 1, limit: PAGE }),
      ),
    )
      .then((results) => {
        if (cancelled) return;
        const seen = new Set<number>();
        const rows = results.flatMap((r) => r.data).filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
        setList({ key: queryKey, pages, rows, total: results[0]?.pagination.total ?? rows.length });
        setListError(null);
      })
      .catch((err) => {
        if (!cancelled) setListError({ key: queryKey, error: err instanceof Error ? err : new Error(String(err)) });
      });
    return () => { cancelled = true; };
  }, [tab, query, queryKey, pages, refreshKey]);

  useEffect(() => {
    let cancelled = false;
    apiGetBookingRequestCounts()
      .then((res) => { if (!cancelled) setCounts(res.data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [refreshKey]);

  // Live: a colleague's change, the flow opening a request, our own change in
  // another panel — plus a poll so the "waiting" ages keep moving.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const schedule = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(refresh, DEBOUNCE_MS);
    };
    const socket = getSocket();
    LIVE_EVENTS.forEach((e) => socket.on(e, schedule));
    const off = onRequestChanged(schedule);
    const poll = setInterval(refresh, POLL_MS);
    return () => {
      LIVE_EVENTS.forEach((e) => socket.off(e, schedule));
      off();
      clearInterval(poll);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [refresh]);

  // Escape closes the open request (mostly for the mobile drawer).
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key !== "Escape" || t?.closest("input, textarea, [role=dialog], [role=alertdialog]")) return;
      if (document.querySelector("[role=dialog]")) return;
      setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  const current = list && list.key === queryKey ? list : null;
  const error = listError && listError.key === queryKey && !current ? listError.error : null;
  const loadingMore = !!current && current.pages < pages;
  const hasMore = !!current && current.rows.length < current.total;
  const activeTab = TABS.find((t) => t.value === tab)!;

  const totalOpen = counts?.open ?? null;

  return (
    <div className={`flex-1 overflow-y-auto bg-[#f9f9f8] ${SCROLL}`}>
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-6 space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-[22px] font-bold text-gray-900 flex items-center gap-2">
              <CalendarPlus className="w-5 h-5 text-[#3B694C]" />
              Bookings
            </h1>
            <p className="text-[13px] text-gray-400 mt-0.5">
              Patients who asked to book. Take one, book it in Dok32, then record it here — or close it with a reason.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {counts && (
              <div className="hidden sm:flex items-center gap-3 h-[38px] px-3.5 bg-white border border-gray-100 rounded-xl text-[12px] text-gray-500">
                <span><span className="font-bold text-gray-900 tabular-nums">{totalOpen}</span> open</span>
                <span className="w-px h-4 bg-gray-100" />
                <span><span className="font-bold text-[#3B694C] tabular-nums">{counts.bookedToday}</span> booked today</span>
              </div>
            )}
            <button
              type="button"
              onClick={refresh}
              title="Refresh now"
              className="flex items-center gap-1.5 h-[38px] text-[12px] text-gray-500 hover:text-gray-800 border border-gray-200 hover:bg-gray-50 bg-white px-3 rounded-xl transition-colors cursor-pointer"
            >
              <span className="relative flex w-2 h-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-60 animate-ping" />
                <span className="relative inline-flex w-2 h-2 rounded-full bg-green-500" />
              </span>
              Live
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden lg:grid lg:grid-cols-[minmax(360px,480px)_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)] lg:h-[calc(100dvh-10rem)] lg:min-h-[560px]">
          {/* Master: the queue */}
          <div className="flex flex-col min-h-0 h-[75dvh] lg:h-auto lg:border-r border-gray-100">
            {/* Search */}
            <div className="px-4 pt-4 pb-3">
              <div className="flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5">
                <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name, number or service…"
                  className="flex-1 text-[13px] text-gray-600 placeholder:text-gray-400 outline-none bg-transparent"
                />
                {search && (
                  <button type="button" onClick={() => setSearch("")} title="Clear search" className="text-gray-400 hover:text-gray-700 cursor-pointer">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Tabs */}
            <div role="tablist" aria-label="Booking requests" className="flex gap-4 px-4 border-b border-gray-100 overflow-x-auto shrink-0 [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-thumb]:bg-[#3B694C]/25 [&::-webkit-scrollbar-thumb]:rounded-full">
              {TABS.map((t) => {
                const active = tab === t.value;
                const n = t.count && counts ? counts[t.count] : 0;
                return (
                  <button
                    key={t.value}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setTab(t.value)}
                    title={t.value === "booked" ? `${n} booked today` : undefined}
                    className={`shrink-0 flex items-center gap-1.5 pb-2 -mb-px border-b-2 text-[13px] transition-colors cursor-pointer ${
                      active ? "border-[#3B694C] text-[#3B694C] font-semibold" : "border-transparent text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    {t.label}
                    {n > 0 && (
                      <span className={`min-w-[18px] h-[18px] px-1 rounded-full text-[10.5px] font-semibold flex items-center justify-center tabular-nums ${
                        t.value === "new" ? "bg-sky-100 text-sky-700" : active ? "bg-[#DCF2E3] text-[#3B694C]" : "bg-gray-100 text-gray-500"
                      }`}>
                        {t.value === "booked" ? `${n > 99 ? "99+" : n} today` : n > 99 ? "99+" : n}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Rows */}
            <div
              onScroll={(e) => {
                const el = e.currentTarget;
                if (hasMore && !loadingMore && el.scrollHeight - el.scrollTop - el.clientHeight < 150) {
                  setWant({ key: queryKey, pages: pages + 1 });
                }
              }}
              className={`flex-1 min-h-0 overflow-y-auto ${SCROLL}`}
            >
              {error ? (
                <ErrorPanel compact error={error} reset={refresh} title="Couldn't load booking requests" />
              ) : !current ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex gap-3 px-4 py-3 border-b border-gray-100 animate-pulse">
                    <div className="w-10 h-10 rounded-full bg-gray-200 shrink-0" />
                    <div className="flex-1 space-y-2 py-1">
                      <div className="h-3 bg-gray-200 rounded w-2/3" />
                      <div className="flex gap-1.5"><div className="h-4 bg-gray-100 rounded w-20" /><div className="h-4 bg-gray-100 rounded w-24" /></div>
                      <div className="h-2.5 bg-gray-100 rounded w-full" />
                    </div>
                  </div>
                ))
              ) : current.rows.length === 0 ? (
                <div className="flex flex-col items-center justify-center text-center px-8 py-16">
                  <div className="w-12 h-12 rounded-2xl bg-[#F5FAF7] border border-[#3B694C]/10 flex items-center justify-center mb-3">
                    <ClipboardList className="w-5 h-5 text-[#3B694C]/50" />
                  </div>
                  <p className="text-[13px] font-semibold text-gray-700">{query ? `No requests match “${query}”` : activeTab.empty}</p>
                  {query && <p className="text-[12px] text-gray-400 mt-1">Try another name, number or service, or another tab.</p>}
                </div>
              ) : (
                <>
                  {current.rows.map((r) => (
                    <RequestRow
                      key={r.id}
                      req={r}
                      active={selected?.id === r.id}
                      meId={me?.id ?? null}
                      showStatus={tab === "mine"}
                      onSelect={() => setSelected(r)}
                    />
                  ))}
                  {loadingMore && <div className="flex items-center justify-center py-3 text-[12px] text-gray-400">Loading more…</div>}
                  {!hasMore && current.rows.length > PAGE && (
                    <div className="flex items-center justify-center py-3 text-[11px] text-gray-300">No more requests</div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Detail: a column on desktop, a full-screen drawer below lg */}
          {selected ? (
            <div className="fixed inset-0 z-[70] flex flex-col bg-white lg:static lg:z-auto min-h-0">
              <RequestDetail
                key={selected.id}
                initial={current?.rows.find((r) => r.id === selected.id) ?? selected}
                refreshKey={refreshKey}
                meId={me?.id ?? null}
                canWork={canWork}
                actions={actions}
                onClose={() => setSelected(null)}
              />
            </div>
          ) : (
            <div className="hidden lg:flex flex-col items-center justify-center text-center px-8 bg-[#f9f9f8]">
              <div className="w-12 h-12 rounded-2xl bg-white border border-gray-100 flex items-center justify-center mb-3">
                <CalendarDays className="w-5 h-5 text-gray-300" />
              </div>
              <p className="text-[14px] font-semibold text-gray-700">Pick a request to work on it</p>
              <p className="text-[12.5px] text-gray-400 mt-1 max-w-xs">
                What the patient asked for, who has it, its appointments — and Take it, Book or Couldn&apos;t book.
              </p>
            </div>
          )}
        </div>
      </div>
      {actions.dialogs}
    </div>
  );
}

// ── Row ───────────────────────────────────────────────────────────────────────

function RequestRow({ req: r, active, meId, showStatus, onSelect }: {
  req: BookingRequest;
  active: boolean;
  meId: number | null;
  showStatus: boolean;
  onSelect: () => void;
}) {
  const name = r.customer?.name || (r.customer?.phone ? `+${r.customer.phone}` : "Unknown patient");
  const service = requestService(r);
  const preferred = requestPreferred(r);
  const age = requestAge(r);
  const open = isOpenRequest(r);
  const mine = meId != null && r.claimedById === meId;
  const conv = r.conversation;
  const lastBy = conv?.lastSenderType === "BOT" ? "⚡ " : conv?.lastSenderType === "AGENT" ? "You: " : "";
  const liveAppts = (r.bookings || []).filter((b) => b.status === "BOOKED").length;
  const rail = active ? "bg-[#3B694C]" : open && r.status === "NEW" ? "bg-sky-400" : "bg-transparent";

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? "true" : undefined}
      className={`group relative w-full text-left flex gap-3 px-4 py-3 border-b border-gray-100 transition-colors cursor-pointer ${active ? "bg-[#EEF6F1]" : "bg-white hover:bg-gray-50"}`}
    >
      <span aria-hidden className={`absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full ${rail}`} />
      <div className="shrink-0 mt-0.5">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-[12px] ${active || r.status === "NEW" ? "bg-[#DCF2E3] text-[#2f5840]" : "bg-[#EEF1EF] text-gray-500"}`}>
          {initialsOf(r.customer?.name || r.customer?.phone)}
        </div>
      </div>

      <div className="flex-1 min-w-0">
        {/* Patient + age */}
        <div className="flex justify-between items-center gap-2">
          <span className="min-w-0 truncate text-[14px] font-semibold text-gray-900">
            {name}
            {r.customer?.name && r.customer.phone && <span className="ml-1.5 text-[12px] font-normal text-gray-400">+{r.customer.phone}</span>}
          </span>
          {age ? (
            <span title="Working time open" className={`shrink-0 whitespace-nowrap inline-flex items-center gap-1 text-[10.5px] font-semibold border rounded px-1.5 py-px tabular-nums ${age.tone}`}>
              <Hourglass className="w-3 h-3" /> waiting {age.label}
            </span>
          ) : (
            <span className="text-[11px] shrink-0 tabular-nums text-gray-400">{shortTime(r.handledAt || r.updatedAt)}</span>
          )}
        </div>

        {/* What they asked for */}
        <div className="flex items-center gap-1.5 mt-1 min-w-0 flex-wrap">
          {service && (
            <span className="max-w-[60%] truncate text-[11px] font-semibold text-[#3B694C] bg-[#EEF6F1] border border-[#3B694C]/20 rounded px-1.5 py-px">{service}</span>
          )}
          {preferred && (
            <span className="max-w-[60%] truncate inline-flex items-center gap-1 text-[11px] font-medium text-gray-600 bg-gray-50 border border-gray-200 rounded px-1.5 py-px">
              <CalendarDays className="w-3 h-3 text-gray-400 shrink-0" /> {preferred}
            </span>
          )}
          {!service && !preferred && <span className="text-[11px] text-gray-400 italic">No details collected</span>}
          <span className="min-w-0 truncate text-[11px] text-gray-400">{requestSource(r)}</span>
        </div>

        {/* The chat's last message */}
        <p className="mt-1 text-[12.5px] text-gray-500 truncate">
          {lastBy && <span className="text-gray-400">{lastBy}</span>}
          {conv?.lastMessage || "No messages yet"}
        </p>

        {/* Who has it / how it ended */}
        <div className="flex items-center gap-1.5 mt-1.5 min-h-[20px] text-[11px]">
          {showStatus && <RequestStatusChip status={r.status} />}
          {open ? (
            r.claimedBy ? (
              <span className="inline-flex items-center gap-1.5 min-w-0">
                <span className={`w-5 h-5 rounded-full text-[9px] font-bold flex items-center justify-center shrink-0 ${mine ? "bg-[#3B694C] text-white" : "bg-gray-200 text-gray-600"}`}>
                  {initialsOf(personName(r.claimedBy))}
                </span>
                <span className="truncate text-gray-600">{mine ? "You" : personName(r.claimedBy)}</span>
              </span>
            ) : (
              <span className="font-medium text-amber-600">Not taken yet</span>
            )
          ) : r.status === "BOOKED" ? (
            <span className="truncate text-gray-600">
              <span className="font-semibold text-[#3B694C]">{liveAppts || r.bookings?.length || 0} appointment{(liveAppts || r.bookings?.length || 0) === 1 ? "" : "s"}</span>
              {" · "}by {personName(r.handledBy)}
            </span>
          ) : (
            <span className="truncate text-gray-600">
              <span className="font-semibold">{notBookedLabel(r.notBookedReason)}</span> · by {personName(r.handledBy)}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

// ── Detail ────────────────────────────────────────────────────────────────────

function RequestDetail({ initial, refreshKey, meId, canWork, actions, onClose }: {
  initial: BookingRequest;
  refreshKey: number;
  meId: number | null;
  canWork: boolean;
  actions: ReturnType<typeof useRequestActions>;
  onClose: () => void;
}) {
  const id = initial.id;
  const [fetched, setFetched] = useState<BookingRequest | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiGetBookingRequest(id)
      .then((res) => { if (!cancelled) { setFetched(res.data); setError(null); } })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : "Couldn't load this request"); });
    return () => { cancelled = true; };
  }, [id, refreshKey]);

  // Upcoming vs past appointments.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  // The freshest of the list row and the single fetch.
  const r = useMemo(() => {
    if (!fetched) return initial;
    return new Date(initial.updatedAt).getTime() > new Date(fetched.updatedAt).getTime() ? initial : fetched;
  }, [fetched, initial]);

  const name = r.customer?.name || (r.customer?.phone ? `+${r.customer.phone}` : "Unknown patient");
  const open = isOpenRequest(r);
  const age = requestAge(r);
  const mine = meId != null && r.claimedById === meId;
  const someoneElse = r.claimedById != null && !mine;
  const claiming = actions.busy?.id === r.id && actions.busy.action === "claim";
  const reopening = actions.busy?.id === r.id && actions.busy.action === "reopen";
  const appts = sortBookings(r.bookings || [], now);
  const conv = r.conversation;

  const btn = "h-9 inline-flex items-center gap-1.5 px-3.5 rounded-xl text-[13px] font-semibold transition-colors cursor-pointer disabled:opacity-60";

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 sm:px-5 py-3 border-b border-gray-100 shrink-0">
        <button type="button" onClick={onClose} title="Close" className="w-8 h-8 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100 cursor-pointer shrink-0">
          <ArrowLeft className="w-4 h-4 lg:hidden" />
          <X className="w-4 h-4 hidden lg:block" />
        </button>
        <span className="w-10 h-10 rounded-full bg-[#EEF6F1] text-[#3B694C] flex items-center justify-center font-bold text-[13px] shrink-0">
          {initialsOf(r.customer?.name || r.customer?.phone)}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-semibold text-gray-900 truncate">{name}</p>
          <p className="text-[12px] text-gray-400 truncate">
            {r.customer?.name && r.customer.phone ? `+${r.customer.phone} · ` : ""}Request #{r.id} · {fmtDateTime(r.createdAt)}
          </p>
        </div>
        <RequestStatusChip status={r.status} />
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2 px-4 sm:px-5 py-3 border-b border-gray-100 bg-[#FAFBFA] shrink-0">
        {canWork && open && (r.status === "NEW" || someoneElse) && (
          <button type="button" onClick={() => actions.claim(r)} disabled={claiming} className={`${btn} text-[#3B694C] bg-white border border-[#3B694C]/30 hover:bg-[#EEF6F1]`}>
            {claiming ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserRoundCheck className="w-4 h-4" />}
            {someoneElse ? "Take over" : "Take it"}
          </button>
        )}
        {canWork && (open || r.status === "BOOKED") && (
          <button type="button" onClick={() => actions.book(r)} className={`${btn} text-white bg-[#3B694C] hover:bg-[#2f5840]`}>
            <CalendarCheck2 className="w-4 h-4" /> {r.status === "BOOKED" ? "Add appointment" : "Book"}
          </button>
        )}
        {canWork && open && (
          <button type="button" onClick={() => actions.notBooked(r)} className={`${btn} text-gray-600 bg-white border border-gray-200 hover:bg-gray-50`}>
            <CircleSlash className="w-4 h-4 text-gray-400" /> Couldn&apos;t book
          </button>
        )}
        {canWork && r.status === "NOT_BOOKED" && (
          <button type="button" onClick={() => actions.reopen(r)} disabled={reopening} className={`${btn} text-[#3B694C] bg-white border border-[#3B694C]/30 hover:bg-[#EEF6F1]`}>
            {reopening ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />} Reopen
          </button>
        )}
        <Link href={`/chats/${r.conversationId}`} className={`${btn} ml-auto text-gray-700 bg-white border border-gray-200 hover:bg-gray-50`}>
          <MessageCircle className="w-4 h-4 text-[#3B694C]" /> Open chat
        </Link>
      </div>

      <div className={`flex-1 min-h-0 overflow-y-auto ${SCROLL}`}>
        {error && !fetched && (
          <p className="mx-5 mt-4 text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Showing the list&apos;s copy — couldn&apos;t refresh it: {error}
          </p>
        )}

        {/* What they asked for */}
        <DetailSection title="What they asked for">
          <RequestedDetails requested={r.requested} empty="Nothing collected — check the chat for what they'd like." />
          {r.note && (
            <p className="mt-2 text-[12.5px] text-gray-700 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 whitespace-pre-wrap break-words">{r.note}</p>
          )}
        </DetailSection>

        {/* The request */}
        <DetailSection title="Request">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[12.5px]">
            <dt className="text-gray-400">Source</dt>
            <dd className="text-gray-800">
              {r.campaign ? (
                <>From campaign: <Link href={`/campaigns/${r.campaign.id}`} className="font-medium text-[#3B694C] hover:underline">{r.campaign.name}</Link></>
              ) : requestSource(r)}
            </dd>
            <dt className="text-gray-400">Opened</dt>
            <dd className="text-gray-800">{fmtDateTime(r.createdAt)}</dd>
            {age && (
              <>
                <dt className="text-gray-400">Waiting</dt>
                <dd>
                  <span className={`inline-flex items-center gap-1 text-[11px] font-semibold border rounded px-1.5 py-px tabular-nums ${age.tone}`}>
                    <Hourglass className="w-3 h-3" /> {age.label} <span className="font-normal opacity-80">working time</span>
                  </span>
                </dd>
              </>
            )}
            {open && (
              <>
                <dt className="text-gray-400">Handling</dt>
                <dd className="text-gray-800">
                  {r.claimedBy ? <>{mine ? "You" : personName(r.claimedBy)}{r.claimedAt ? <span className="text-gray-400"> · since {fmtDateTime(r.claimedAt)}</span> : null}</> : <span className="text-amber-600 font-medium">Nobody yet</span>}
                </dd>
              </>
            )}
            {!open && (
              <>
                <dt className="text-gray-400">{r.status === "BOOKED" ? "Booked by" : "Closed by"}</dt>
                <dd className="text-gray-800">{personName(r.handledBy)}{r.handledAt ? <span className="text-gray-400"> · {fmtDateTime(r.handledAt)}</span> : null}</dd>
              </>
            )}
            {r.status === "NOT_BOOKED" && (
              <>
                <dt className="text-gray-400">Reason</dt>
                <dd className="text-gray-800 font-medium">{notBookedLabel(r.notBookedReason)}</dd>
                {r.notBookedNote && (
                  <>
                    <dt className="text-gray-400">Note</dt>
                    <dd className="text-gray-700 whitespace-pre-wrap break-words">{r.notBookedNote}</dd>
                  </>
                )}
              </>
            )}
          </dl>
        </DetailSection>

        {/* Appointments */}
        <DetailSection title="Appointments" aside={appts.length ? <span className="text-[11px] text-gray-400">{appts.length}</span> : undefined}>
          {appts.length === 0 ? (
            <p className="text-[12px] text-gray-400">{open ? "None yet. Book it in Dok32, then press Book to record it." : "No appointments."}</p>
          ) : (
            <div className="space-y-2">
              {appts.map((b) => (
                <AppointmentCard
                  key={b.id}
                  booking={b}
                  now={now}
                  footer={<>Booked by {personName(b.createdBy)} · {fmtDateTime(b.createdAt)}{b.status === "CANCELLED" && b.cancelledAt ? ` · cancelled ${fmtDateTime(b.cancelledAt)}` : ""}</>}
                />
              ))}
            </div>
          )}
        </DetailSection>

        {/* The chat */}
        {conv && (
          <DetailSection title="Chat">
            <Link href={`/chats/${r.conversationId}`} className="block rounded-xl border border-gray-100 hover:border-[#3B694C]/30 hover:bg-[#F5FAF7] transition-colors p-3">
              <div className="flex items-center gap-2 text-[11px] text-gray-400">
                <span className={`font-semibold px-1.5 py-px rounded ${conv.status === "RESOLVED" ? "bg-gray-100 text-gray-500" : conv.status === "PENDING" ? "bg-amber-50 text-amber-600" : "bg-[#EEF6F1] text-[#3B694C]"}`}>
                  {conv.status === "OPEN" ? "Open" : conv.status === "PENDING" ? "Pending" : "Resolved"}
                </span>
                <span>{conv.assignedAgent ? `with ${personName(conv.assignedAgent)}` : "Unassigned"}</span>
                {conv.lastMessageAt && <span className="ml-auto tabular-nums">{fmtWhen(conv.lastMessageAt)}</span>}
              </div>
              <p className="mt-1.5 text-[13px] text-gray-700 line-clamp-3 break-words">
                {conv.lastSenderType === "AGENT" ? <span className="text-gray-400">You: </span> : conv.lastSenderType === "BOT" ? <span className="text-gray-400">⚡ </span> : null}
                {conv.lastMessage || "No messages yet"}
              </p>
              {conv.awaitingReplySince && conv.status !== "RESOLVED" && (
                <p className="mt-1.5 text-[11px] font-semibold text-amber-700">Patient is waiting for a reply since {fmtWhen(conv.awaitingReplySince)}</p>
              )}
            </Link>
          </DetailSection>
        )}
      </div>
    </div>
  );
}

function DetailSection({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="px-4 sm:px-5 py-4 border-b border-gray-100">
      <div className="flex items-center gap-2 mb-2.5">
        <h3 className="flex-1 text-[11px] uppercase tracking-wider font-semibold text-gray-400">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}
