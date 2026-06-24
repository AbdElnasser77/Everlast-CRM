"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import type { ReactNode } from "react";
import { LogOut, Clock } from "lucide-react";
import { useConversations } from "@/hooks/useConversations";
import { disconnectSocket } from "@/lib/socket";
import { ConversationsContext } from "@/components/ConversationsContext";
import type { User } from "@/types";

function isWindowClosed(lastCustomerMessageAt: string | null | undefined): boolean {
  if (!lastCustomerMessageAt) return false;
  return Date.now() - new Date(lastCustomerMessageAt).getTime() > 24 * 60 * 60 * 1000;
}

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

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onToggle();
      }}
      className={`relative w-9 h-5 rounded-full transition-colors shrink-0 cursor-pointer focus:outline-none ${
        on ? "bg-[#3B694C]" : "bg-gray-200"
      }`}
    >
      <div
        className={`absolute top-[3px] w-[14px] h-[14px] rounded-full bg-white shadow-sm transition-all duration-200 ${
          on ? "left-[19px]" : "left-[3px]"
        }`}
      />
    </button>
  );
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

const FILTERS = ["All", "Unread", "Window closed", "AI handling"];

export default function ChatsLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [activeFilter, setActiveFilter] = useState("All");
  const [aiStates, setAiStates] = useState<Record<string, boolean>>({});
  const [user, setUser] = useState<User | null>(null);
  const [search, setSearch] = useState("");
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  const { conversations, loading, markRead } = useConversations();

  useEffect(() => {
    const raw = localStorage.getItem("user");
    if (raw) {
      try {
        setUser(JSON.parse(raw));
      } catch {}
    }
  }, []);

  useEffect(() => {
    setAiStates((prev) => {
      const next = { ...prev };
      conversations.forEach((c) => {
        const cid = getId(c);
        if (cid && !(cid in next)) next[cid] = false;
      });
      return next;
    });
  }, [conversations]);

  const toggleAi = (id: string) =>
    setAiStates((prev) => ({ ...prev, [id]: !prev[id] }));

  async function handleLogout() {
    document.cookie = "logged_in=; path=/; max-age=0";
    localStorage.removeItem("user");
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch {}
    disconnectSocket();
    router.push("/login");
  }

  const activeId = pathname.startsWith("/chats/") ? pathname.split("/chats/")[1] : null;
  const totalUnread = conversations.reduce(
    (s, c) => s + (String(c.id ?? c._id) === activeId ? 0 : c.unreadCount),
    0
  );

  const filtered = conversations.filter((c) => {
    if (activeFilter === "Unread") return c.unreadCount > 0;
    if (activeFilter === "Window closed") return isWindowClosed(c.lastCustomerMessageAt);
    if (activeFilter === "AI handling") return aiStates[getId(c)];
    return true;
  });

  const searched = search.trim()
    ? filtered.filter(
        (c) =>
          getCustomer(c)?.name?.toLowerCase().includes(search.toLowerCase()) ||
          getCustomer(c)?.phone?.includes(search)
      )
    : filtered;

  // On mobile: show sidebar when no conversation is open, show main otherwise
  const sidebarVisible = !activeId;

  return (
    <>
      <LogoutDrawer
        open={showLogoutModal}
        onConfirm={handleLogout}
        onCancel={() => setShowLogoutModal(false)}
      />

      <ConversationsContext.Provider value={{ conversations, markRead }}>
      <div className="flex flex-1 min-h-0 font-[family-name:var(--font-geist-sans)]">
        {/* Sidebar */}
        <aside
          className={`
            flex flex-col border-r border-gray-100 bg-white
            w-full md:w-[370px] md:shrink-0
            ${sidebarVisible ? "flex" : "hidden md:flex"}
          `}
        >
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
            {totalUnread > 0 && (
              <span className="text-[12px] font-semibold text-[#3B694C] bg-[#DCF2E3] px-2 py-0.5 rounded-full">
                {totalUnread} new
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
                      ? "bg-red-50 border-red-400 text-red-500 font-semibold"
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
          <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-[#3B694C]/25 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-[#3B694C]/50">
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
                No conversations found
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
                return (
                  <Link
                    key={cid || i}
                    href={`/chats/${cid}`}
                    className={`flex gap-3 px-4 py-3 border-b border-l-[3px] transition-colors ${
                      isActive
                        ? "bg-[#DCF2E3] border-l-[#3B694C] border-b-gray-100"
                        : windowClosed
                        ? "bg-red-50 border-l-red-400 border-b-red-100 hover:bg-red-100"
                        : "border-l-transparent border-b-gray-100 hover:border-l-[#3B694C] hover:bg-[#DCF2E3]"
                    }`}
                  >
                    {/* Avatar */}
                    <div className="relative shrink-0 mt-0.5">
                      <div className="w-11 h-11 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 font-semibold text-[12px]">
                        {initials}
                      </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      {/* Name + time */}
                      <div className="flex justify-between items-baseline mb-0.5">
                        <span className="font-semibold text-[14px] text-gray-900 truncate">
                          {displayName}
                        </span>
                        <div className="flex items-center gap-1 ml-2 shrink-0">
                          {windowClosed && <Clock className="w-3 h-3 text-red-400" />}
                          <span className={`text-[11.5px] ${windowClosed ? "text-red-400 font-medium" : unread > 0 ? "text-[#3B694C] font-semibold" : "text-gray-400"}`}>
                            {windowClosed
                              ? (c.lastCustomerMessageAt ? formatTime(c.lastCustomerMessageAt) : "—")
                              : (c.lastMessageAt ? formatTime(c.lastMessageAt) : "—")}
                          </span>
                        </div>
                      </div>

                      {/* Preview + unread badge */}
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-[13px] text-gray-400 truncate">
                          {c.lastMessage}
                        </span>
                        {unread > 0 && (
                          <span className="ml-2 shrink-0 min-w-[20px] h-5 px-1 rounded-full bg-[#3B694C] text-white text-[11px] font-semibold flex items-center justify-center">
                            {unread}
                          </span>
                        )}
                      </div>

                      {/* AI AUTO-REPLY + toggle */}
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-semibold text-gray-400 tracking-widest uppercase">
                          AI Auto-Reply
                        </span>
                        <Toggle on={!!aiStates[cid]} onToggle={() => toggleAi(cid)} />
                      </div>
                    </div>
                  </Link>
                );
              })
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
