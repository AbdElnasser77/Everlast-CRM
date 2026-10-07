"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useMemo, useRef, useCallback, useLayoutEffect } from "react";
import type { ReactNode } from "react";
import { LogOut, Clock } from "lucide-react";
import { useConversations } from "@/hooks/useConversations";
import { disconnectSocket, getSocket } from "@/lib/socket";
import { apiGetConversationCounts, apiLogout } from "@/lib/api";
import { useCurrentUser } from "@/components/CurrentUserProvider";
import { PageSpinner } from "@/components/ui/spinner";
import { homePathFor } from "@/lib/permissions";
import { ConversationsContext } from "@/components/ConversationsContext";
import type { ConversationCounts, ConversationView, User } from "@/types";
import { isWindowClosed } from "@/lib/messagingWindow";

function getId(c: import("@/types").Conversation): string {
  const raw = c.id ?? c._id;
  return raw != null ? String(raw) : "";
}

function getCustomer(c: import("@/types").Conversation) {
  return c.customer ?? null;
}

function getInitials(name: string | undefined | null): string {
  if (!name) return "?";
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0)
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function LogoutDrawer({ open, onConfirm, onCancel }: { open: boolean; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div
      className={`fixed inset-0 z-[100] flex flex-col justify-end duration-300 transition-opacity ${
        open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
      }`}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />

      {/* Panel */}
      <div
        className={`relative bg-white rounded-t-2xl shadow-2xl px-5 pt-4 pb-10 transition-transform duration-300 ease-out ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="w-9 h-1 rounded-full bg-gray-200 mx-auto mb-5" />

        <div className="flex items-center gap-4 mb-6">
          <div className="w-11 h-11 rounded-full bg-red-50 flex items-center justify-center shrink-0">
            <LogOut className="w-5 h-5 text-red-500" />
          </div>
          <div>
            <p className="font-semibold text-[15px] text-gray-900">Sign out?</p>
            <p className="text-[13px] text-gray-500 mt-0.5">
              You will be redirected to the login page.
            </p>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-3 rounded-xl border border-gray-200 text-[13px] font-semibold text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 py-3 rounded-xl bg-red-500 hover:bg-red-600 text-[13px] font-semibold text-white transition-colors cursor-pointer"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

const FILTERS = ["All", "Unread", "Window closed"];

// Chat list width (desktop): draggable, at most 30% of the window.
const LIST_DEFAULT_WIDTH = 370;
const LIST_MIN_WIDTH = 260;
const LIST_MAX_FRACTION = 0.3;
const LIST_WIDTH_KEY = "inbox.listWidth";

// Server-side views: who owns the chat, and whether it answers a campaign.
// The pills below them (FILTERS) only narrow the page already loaded; these go
// to the server, so an unassigned chat on page 3 still shows up.
const VIEWS: { value: ConversationView; label: string; count?: keyof ConversationCounts }[] = [
  { value: "all", label: "All" },
  { value: "mine", label: "Mine", count: "mine" },
  { value: "unassigned", label: "Unassigned", count: "unassigned" },
  { value: "campaign_replies", label: "Campaign replies", count: "campaign_replies" },
];

const STATUS_CHIP: Record<string, string> = {
  PENDING: "bg-amber-50 text-amber-600",
  RESOLVED: "bg-gray-100 text-gray-500",
};

/**
 * Badge counts for the views. Refetched (coalesced to one request per burst)
 * on any event that can move a conversation between views.
 */
function useConversationCounts(): ConversationCounts | null {
  const [counts, setCounts] = useState<ConversationCounts | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      apiGetConversationCounts()
        .then((res) => { if (!cancelled) setCounts(res.data); })
        .catch(() => {});
    };
    const schedule = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(load, 400);
    };
    load();
    const socket = getSocket();
    const events = ["conversation.updated", "conversation.assigned", "conversation.status_changed", "campaign.replied", "connect"];
    events.forEach((e) => socket.on(e, schedule));
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
      events.forEach((e) => socket.off(e, schedule));
    };
  }, []);

  return counts;
}

export default function ChatsLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [activeFilter, setActiveFilter] = useState("All");
  const [view, setView] = useState<ConversationView>("all");
  const [user, setUser] = useState<User | null>(null);
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  const activeId = pathname.startsWith("/chats/") ? pathname.split("/chats/")[1] : null;
  const { conversations, loading, loadingMore, hasMore, loadMore, markRead, search, setSearch } =
    useConversations({ view, pinnedId: activeId });
  const counts = useConversationCounts();
  const { ready: userReady, can, me } = useCurrentUser();
  const canUseInbox = can("conversation:write");
  // /chats is the app's default landing (the site root, and proxy.ts after
  // login both point here), so a role without an inbox is sent on to the first
  // screen it can use rather than stranded on "access denied".
  useEffect(() => {
    if (userReady && !canUseInbox) router.replace(homePathFor(me));
  }, [userReady, canUseInbox, me, router]);

  // Memoised: this object was previously rebuilt inline on every render, so every
  // consumer of the context re-rendered with it.
  const conversationsCtx = useMemo(
    () => ({ conversations, loading, markRead }),
    [conversations, loading, markRead],
  );

  useEffect(() => {
    const raw = localStorage.getItem("user");
    if (raw) {
      try {
        setUser(JSON.parse(raw));
      } catch {}
    }
  }, []);


  async function handleLogout() {
    document.cookie = "logged_in=; path=/; max-age=0";
    localStorage.removeItem("user");
    // Was a hand-rolled duplicate of apiLogout(). Kept in one place so
    // NEXT_PUBLIC_API_URL appears only in lib/api.ts.
    try {
      await apiLogout();
    } catch {}
    disconnectSocket();
    router.push("/login");
  }

  // ── Resizable chat list ────────────────────────────────────────────────
  // Width is applied straight to the element (no re-render while dragging),
  // kept within [min, 30% of the window], and remembered in this browser.
  // Below the md breakpoint the list is full-width and not resizable.
  const asideRef = useRef<HTMLElement>(null);
  const clampWidth = useCallback((w: number) => {
    const max = Math.round(window.innerWidth * LIST_MAX_FRACTION);
    return Math.max(Math.min(LIST_MIN_WIDTH, max), Math.min(w, max));
  }, []);
  const applyWidth = useCallback((w: number | null) => {
    const el = asideRef.current;
    if (!el) return;
    if (w === null || window.innerWidth < 768) {
      el.style.width = "";
      return;
    }
    el.style.width = `${clampWidth(w)}px`;
  }, [clampWidth]);
  const storedWidth = useCallback(() => {
    try {
      const v = Number(localStorage.getItem(LIST_WIDTH_KEY));
      return Number.isFinite(v) && v > 0 ? v : LIST_DEFAULT_WIDTH;
    } catch {
      return LIST_DEFAULT_WIDTH;
    }
  }, []);
  useLayoutEffect(() => {
    applyWidth(storedWidth());
    const onResize = () => applyWidth(storedWidth());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [applyWidth, storedWidth, userReady, canUseInbox]);
  const startResize = useCallback((e: React.PointerEvent) => {
    const el = asideRef.current;
    if (!el) return;
    e.preventDefault();
    const startX = e.clientX;
    const startW = el.getBoundingClientRect().width;
    let current = startW;
    const move = (ev: PointerEvent) => {
      current = clampWidth(startW + ev.clientX - startX);
      el.style.width = `${current}px`;
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      try { localStorage.setItem(LIST_WIDTH_KEY, String(Math.round(current))); } catch {}
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }, [clampWidth]);
  const resetWidth = useCallback(() => {
    try { localStorage.removeItem(LIST_WIDTH_KEY); } catch {}
    applyWidth(LIST_DEFAULT_WIDTH);
  }, [applyWidth]);

  // Chats with something unread, not messages — like WhatsApp (and the
  // sidebar badge). The open chat counts as read.
  const unreadChats = conversations.filter(
    (c) => String(c.id ?? c._id) !== activeId && c.unreadCount > 0,
  ).length;

  // Search itself is server-side (see useConversations) since the sidebar
  // only ever holds a page of conversations at a time — filtering a name/phone
  // match here would miss anyone outside the currently-loaded page. These tabs
  // just narrow whatever page(s) are already loaded. Ordering (unread pinned
  // above read, newest-first within each group) is guaranteed by the hook
  // itself at every point the list is built, so filtering here preserves it.
  const searched = conversations.filter((c) => {
    if (activeFilter === "Unread") return c.unreadCount > 0;
    if (activeFilter === "Window closed") return isWindowClosed(c.lastCustomerMessageAt);
    return true;
  });

  // On mobile: show sidebar when no conversation is open, show main otherwise
  const sidebarVisible = !activeId;

  // The inbox is for replying, so it needs conversation:write — MARKETING can
  // read conversations for context elsewhere but has no inbox. The sidebar
  // already hides the link; this covers a bookmark or pasted URL, which would
  // otherwise show an inbox where every action fails.
  if (!userReady || !canUseInbox) return <PageSpinner />;

  return (
    <>
      <LogoutDrawer
        open={showLogoutModal}
        onConfirm={handleLogout}
        onCancel={() => setShowLogoutModal(false)}
      />

      <ConversationsContext.Provider value={conversationsCtx}>
      <div className="flex flex-1 min-h-0 font-[family-name:var(--font-geist-sans)]">
        {/* Sidebar */}
        <aside
          ref={asideRef}
          className={`
            relative flex flex-col border-r border-gray-100 bg-white
            w-full md:w-[370px] md:shrink-0
            ${sidebarVisible ? "flex" : "hidden md:flex"}
          `}
        >
          {/* Drag to resize (desktop). Double-click resets. */}
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize chat list"
            title="Drag to resize · double-click to reset"
            onPointerDown={startResize}
            onDoubleClick={resetWidth}
            className="hidden md:block absolute top-0 -right-1 z-20 h-full w-2 cursor-col-resize group"
          >
            <div className="mx-auto h-full w-px bg-transparent group-hover:bg-[#3B694C]/40 group-active:bg-[#3B694C]/60 transition-colors" />
          </div>
          {/* Header */}
          <div className="flex items-center gap-2.5 px-4 pt-4 pb-3">
            <Image
              src="/Brand.png"
              alt="Everlast Wellness"
              width={32}
              height={32}
              className="shrink-0 [filter:brightness(0)_saturate(100%)_invert(33%)_sepia(50%)_saturate(600%)_hue-rotate(110deg)_brightness(90%)]"
            />
            <span className="font-bold text-[16px] text-gray-900">Inbox</span>
            {unreadChats > 0 && (
              <span className="text-[12px] font-semibold text-[#3B694C] bg-[#DCF2E3] px-2 py-0.5 rounded-full">
                {unreadChats} unread {unreadChats === 1 ? "chat" : "chats"}
              </span>
            )}
          </div>

          {/* Search */}
          <div className="px-4 pb-3">
            <div className="flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5">
              <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or number..."
                className="flex-1 text-[13px] text-gray-600 placeholder:text-gray-400 outline-none bg-transparent"
              />
            </div>
          </div>

          {/* Views (server-side) */}
          <div role="tablist" aria-label="Inbox view" className="flex gap-4 px-4 mb-3 border-b border-gray-100 overflow-x-auto [scrollbar-width:thin] [scrollbar-color:rgba(59,105,76,0.25)_transparent] [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-[#3B694C]/25 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-[#3B694C]/50">
            {VIEWS.map((v) => {
              const active = view === v.value;
              const n = v.count && counts ? counts[v.count] : 0;
              return (
                <button
                  key={v.value}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setView(v.value)}
                  className={`shrink-0 flex items-center gap-1.5 pb-2 -mb-px border-b-2 text-[13px] transition-colors cursor-pointer ${
                    active ? "border-[#3B694C] text-[#3B694C] font-semibold" : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {v.label}
                  {n > 0 && (
                    <span className={`min-w-[18px] h-[18px] px-1 rounded-full text-[10.5px] font-semibold flex items-center justify-center ${
                      v.value === "unassigned" ? "bg-amber-100 text-amber-700" : active ? "bg-[#DCF2E3] text-[#3B694C]" : "bg-gray-100 text-gray-500"
                    }`}>
                      {n > 99 ? "99+" : n}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Filter tabs */}
          <div className="flex gap-1.5 px-4 pb-3 flex-wrap">
            {FILTERS.map((f) => {
              const active = activeFilter === f;
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => setActiveFilter(f)}
                  className={`px-3 py-1.5 rounded-full text-[13px] border transition-colors cursor-pointer ${
                    active && f === "Window closed"
                      ? "bg-red-50 border-red-400 text-red-600 font-semibold"
                      : active
                      ? "bg-[#DCF2E3] border-[#3B694C] text-[#3B694C] font-semibold"
                      : "border-gray-200 text-gray-500 hover:bg-gray-50"
                  }`}
                >
                  {f}
                </button>
              );
            })}
          </div>

          {/* Conversations */}
          <div
            onScroll={(e) => {
              const el = e.currentTarget;
              if (el.scrollHeight - el.scrollTop - el.clientHeight < 150) loadMore();
            }}
            className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-[#3B694C]/25 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-[#3B694C]/50"
          >
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex gap-3 px-4 py-3 border-b border-gray-100 animate-pulse">
                  <div className="w-11 h-11 rounded-full bg-gray-200 shrink-0" />
                  <div className="flex-1 space-y-2 py-1">
                    <div className="h-3 bg-gray-200 rounded w-3/4" />
                    <div className="h-2.5 bg-gray-100 rounded w-full" />
                    <div className="h-2.5 bg-gray-100 rounded w-1/2" />
                  </div>
                </div>
              ))
            ) : searched.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-[13px] text-gray-400">
                {view === "mine" ? "Nothing assigned to you" : view === "unassigned" ? "Every open chat has an owner" : view === "campaign_replies" ? "No open campaign replies" : "No conversations found"}
              </div>
            ) : (
              searched.map((c, i) => {
                const cid = getId(c);
                const customer = getCustomer(c);
                const isActive = pathname === `/chats/${cid}`;
                const unread = isActive ? 0 : c.unreadCount;
                const displayName = customer?.name || customer?.phone || "Unknown";
                const initials = getInitials(customer?.name || customer?.phone);
                const windowClosed = isWindowClosed(c.lastCustomerMessageAt);
                // Who spoke last, so the preview reads like WhatsApp's.
                const lastBy = c.lastSenderType === "BOT" ? "⚡ " : c.lastSenderType === "AGENT" ? "You: " : "";
                return (
                  <Link
                    key={cid || i}
                    href={`/chats/${cid}`}
                    className={`group relative flex gap-3 px-4 py-2.5 border-b border-gray-100 transition-colors ${
                      isActive ? "bg-[#EEF6F1]" : windowClosed ? "bg-red-50 hover:bg-red-100/70" : unread > 0 ? "bg-white hover:bg-[#F5FAF7]" : "bg-white hover:bg-gray-50"
                    }`}
                  >
                    {/* Left rail: open chat or unread */}
                    <span
                      aria-hidden
                      className={`absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full ${
                        isActive ? "bg-[#3B694C]" : windowClosed ? "bg-red-500" : unread > 0 ? "bg-[#3B694C]/70" : "bg-transparent"
                      }`}
                    />

                    {/* Avatar */}
                    <div className="shrink-0 mt-0.5">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-[12px] ${
                        unread > 0 || isActive ? "bg-[#DCF2E3] text-[#2f5840]" : "bg-[#EEF1EF] text-gray-500"
                      }`}>
                        {initials}
                      </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      {/* Name + time */}
                      <div className="flex justify-between items-baseline gap-2">
                        <span className={`text-[14px] truncate ${unread > 0 ? "font-bold text-gray-900" : "font-semibold text-gray-800"}`}>
                          {displayName}
                        </span>
                        <span className={`text-[11px] shrink-0 tabular-nums ${unread > 0 ? "text-[#3B694C] font-semibold" : "text-gray-400"}`}>
                          {c.lastMessageAt ? formatTime(c.lastMessageAt) : "—"}
                        </span>
                      </div>

                      {/* Preview + unread count */}
                      <div className="flex justify-between items-center gap-2 mt-0.5">
                        <span className={`text-[13px] truncate ${unread > 0 ? "text-gray-700" : "text-gray-500"}`}>
                          {lastBy && <span className="text-gray-400">{lastBy}</span>}
                          {c.lastMessage || "No messages yet"}
                        </span>
                        {unread > 0 && (
                          <span className="shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-[#3B694C] text-white text-[11px] font-semibold flex items-center justify-center tabular-nums">
                            {unread > 99 ? "99+" : unread}
                          </span>
                        )}
                      </div>

                      {/* State line: window, status, owner, AI */}
                      <div className="flex items-center gap-1.5 mt-1.5 min-h-[20px]">
                        {windowClosed && (
                          <span
                            title="24-hour window closed — only templates can be sent"
                            className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-red-700 bg-red-100 border border-red-300 rounded px-1.5 py-px"
                          >
                            <Clock className="w-3 h-3" /> Window closed
                          </span>
                        )}
                        {STATUS_CHIP[c.status] && (
                          <span className={`text-[10.5px] font-semibold px-1.5 py-px rounded ${STATUS_CHIP[c.status]}`}>
                            {c.status === "PENDING" ? "Pending" : "Resolved"}
                          </span>
                        )}
                        {c.assignedAgent ? (
                          <span
                            title={`Assigned to ${c.assignedAgent.name || c.assignedAgent.username}`}
                            className={`w-5 h-5 rounded-full text-[9px] font-bold flex items-center justify-center ${
                              c.assignedAgent.id === me?.id ? "bg-[#3B694C] text-white" : "bg-gray-200 text-gray-600"
                            }`}
                          >
                            {getInitials(c.assignedAgent.name || c.assignedAgent.username)}
                          </span>
                        ) : c.status !== "RESOLVED" ? (
                          <span className="text-[10.5px] font-medium text-amber-600">Unassigned</span>
                        ) : null}
                      </div>
                    </div>
                  </Link>
                );
              })
            )}
            {loadingMore && (
              <div className="flex items-center justify-center py-3 text-[12px] text-gray-400">
                Loading more…
              </div>
            )}
            {!loading && !loadingMore && !hasMore && conversations.length > 0 && (
              <div className="flex items-center justify-center py-3 text-[11px] text-gray-300">
                No more conversations
              </div>
            )}
          </div>

          {/* Bottom user bar */}
          <div className="flex items-center gap-3 px-4 py-3 border-t border-gray-100">
            <div className="w-9 h-9 rounded-full bg-[#3B694C] flex items-center justify-center text-white font-semibold text-[12px] shrink-0">
              {user ? getInitials(user.username) : "—"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-gray-900 leading-snug">
                {user?.username ?? "—"}
              </p>
              <p className="text-[12px] text-gray-400 leading-snug">
                {user?.role ?? "Agent"} · Online
              </p>
            </div>
          </div>
        </aside>

        {/* Main content */}
        <main
          className={`
            flex-1 flex flex-col overflow-hidden
            ${activeId ? "flex" : "hidden md:flex"}
          `}
        >
          {children}
        </main>
      </div>
      </ConversationsContext.Provider>
    </>
  );
}
