"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, startTransition } from "react";
import type { ReactNode } from "react";
import {
  MessageSquare,
  Megaphone,
  Contact,
  LayoutDashboard,
  UsersRound,
  Settings,
  ClipboardList,
  LayoutTemplate,
  ChevronsRight,
  ChevronsLeft,
  Menu,
  X,
  LogOut,
} from "lucide-react";
import { getSocket, disconnectSocket } from "@/lib/socket";
import { apiGetMe, apiLogout, apiGetStatsOverview } from "@/lib/api";


const COLLAPSED_W = "w-14";   // 56px icon rail
const EXPANDED_W  = "w-[260px]";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  async function handleLogout() {
    document.cookie = "logged_in=; path=/; max-age=0";
    localStorage.removeItem("user");
    try { await apiLogout(); } catch {}
    disconnectSocket();
    router.push("/login");
  }

  useEffect(() => {
    // Verify role from the server — never trust localStorage for access control
    apiGetMe()
      .then((res) => {
        setIsAdmin(res.data.role === "ADMIN");
        localStorage.setItem("user", JSON.stringify(res.data));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    function fetchUnread() {
      apiGetStatsOverview()
        .then((res) => setUnreadCount(res.data.unreadMessages))
        .catch(() => {});
    }
    fetchUnread();
    const socket = getSocket();
    socket.on("message.new", fetchUnread);
    socket.on("conversation.updated", fetchUnread);
    return () => {
      socket.off("message.new", fetchUnread);
      socket.off("conversation.updated", fetchUnread);
    };
  }, []);

  // Auto-close on navigation
  useEffect(() => {
    startTransition(() => {
      setExpanded(false);
      setMobileOpen(false);
    });
  }, [pathname]);

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + "/");
  }

  const mainNav = [
    { href: "/chats",            icon: MessageSquare,   label: "Inbox",        enabled: true,  badge: unreadCount > 0 ? unreadCount : undefined },
    { href: "/customers",        icon: Contact,         label: "Contacts",     enabled: true  },
    { href: "/campaigns",        icon: Megaphone,       label: "Campaigns",    enabled: true  },
  ];
  const adminNav = [
    { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard"     },
    { href: "/team",      icon: UsersRound,      label: "Team & Access" },
    { href: "/templates", icon: LayoutTemplate,  label: "Templates"     },
    { href: "/audit",     icon: ClipboardList,   label: "Audit Log"     },
    { href: "/settings",  icon: Settings,        label: "Settings"      },
  ];

  /* ── desktop nav item: icon + label that fades in on expand ── */
  const DesktopItem = ({
    href, icon: Icon, label, enabled = true, badge,
  }: { href: string|null; icon: React.ElementType; label: string; enabled?: boolean; badge?: number }) => {
    const active = href ? isActive(href) : false;
    const base   = "relative flex items-center h-10 w-full rounded-xl transition-colors overflow-hidden";
    const badgeLabel = badge ? (badge > 99 ? "99+" : String(badge)) : null;

    const iconEl = (
      <span className="relative shrink-0 flex items-center justify-center">
        <Icon className="w-[18px] h-[18px]" />
        {badgeLabel && !expanded && (
          <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] flex items-center justify-center rounded-full bg-red-500 text-white text-[9px] font-bold leading-none px-[3px]">
            {badgeLabel}
          </span>
        )}
      </span>
    );

    const labelEl = (
      <span
        className={`text-[13.5px] font-medium whitespace-nowrap transition-[opacity,max-width] duration-200 delay-75 ${
          expanded ? "opacity-100 max-w-[200px]" : "opacity-0 max-w-0 pointer-events-none"
        }`}
      >
        {label}
      </span>
    );

    const badgeEl = badgeLabel && expanded ? (
      <span className="ml-auto shrink-0 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold leading-none px-1.5">
        {badgeLabel}
      </span>
    ) : null;

    if (!enabled || !href) {
      return (
        <div title={!expanded ? label : undefined}
          className={`${base} ${expanded ? "gap-3 px-3" : "justify-center"} text-gray-300 cursor-default`}>
          {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-[#3B694C] rounded-r-full" />}
          {iconEl}
          {labelEl}
          {badgeEl}
        </div>
      );
    }
    return (
      <Link
        href={href}
        title={!expanded ? label : undefined}
        className={`${base} ${expanded ? "gap-3 px-3" : "justify-center"} ${
          active
            ? "bg-[#EEF6F1] text-[#3B694C]"
            : "text-gray-400 hover:bg-gray-50 hover:text-gray-600"
        }`}
      >
        {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-[#3B694C] rounded-r-full" />}
        {iconEl}
        {labelEl}
        {badgeEl}
      </Link>
    );
  };

  /* ── mobile nav item (always shows text) ── */
  const MobileItem = ({
    href, icon: Icon, label, enabled = true, badge,
  }: { href: string|null; icon: React.ElementType; label: string; enabled?: boolean; badge?: number }) => {
    const active = href ? isActive(href) : false;
    const badgeLabel = badge ? (badge > 99 ? "99+" : String(badge)) : null;
    if (!enabled || !href) {
      return (
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13.5px] text-gray-300 cursor-default">
          <Icon className="w-[17px] h-[17px] shrink-0" />
          <span>{label}</span>
        </div>
      );
    }
    return (
      <Link
        href={href}
        onClick={() => setMobileOpen(false)}
        className={`relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13.5px] transition-colors ${
          active ? "bg-[#EEF6F1] text-[#3B694C] font-medium" : "text-gray-600 hover:bg-gray-50"
        }`}
      >
        {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-[#3B694C] rounded-r-full" />}
        <Icon className="w-[17px] h-[17px] shrink-0" />
        <span className="flex-1">{label}</span>
        {badgeLabel && (
          <span className="min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold leading-none px-1.5">
            {badgeLabel}
          </span>
        )}
      </Link>
    );
  };

  return (
    <>
      {/* ══════════════ MOBILE ══════════════ */}

      {/* top bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 h-12 bg-white border-b border-gray-100 flex items-center px-4 gap-3">
        <button onClick={() => setMobileOpen(true)} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors" aria-label="Open menu">
          <Menu className="w-5 h-5" />
        </button>
        <div className="w-6 h-6 rounded-full bg-[#3B694C] flex items-center justify-center shrink-0">
          <span className="text-white font-bold text-xs leading-none">E</span>
        </div>
        <span className="font-bold text-[14px] text-gray-800">Everlast CRM</span>
      </div>

      {/* mobile backdrop */}
      <div
        onClick={() => setMobileOpen(false)}
        className={`lg:hidden fixed inset-0 z-50 bg-black/30 transition-opacity duration-300 ${mobileOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
      />

      {/* mobile drawer */}
      <div className={`lg:hidden fixed top-0 left-0 h-full w-[260px] z-[51] bg-white shadow-2xl flex flex-col transition-transform duration-300 ease-out ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full bg-[#3B694C] flex items-center justify-center shrink-0">
              <span className="text-white font-bold text-sm leading-none">E</span>
            </div>
            <span className="font-bold text-[15px] text-gray-800">Everlast CRM</span>
          </div>
          <button onClick={() => setMobileOpen(false)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {mainNav.map((item) => <MobileItem key={item.label} {...item} />)}
          {isAdmin && (
            <>
              <p className="px-3 pt-5 pb-1.5 text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Admin</p>
              {adminNav.map((item) => <MobileItem key={item.label} {...item} />)}
            </>
          )}
        </nav>
        <div className="shrink-0 border-t border-gray-100 p-2">
          <button
            onClick={() => { setMobileOpen(false); handleLogout(); }}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-[13.5px] text-gray-600 hover:bg-red-50 hover:text-red-500 transition-colors cursor-pointer"
          >
            <LogOut className="w-[17px] h-[17px] shrink-0" />
            <span>Sign out</span>
          </button>
        </div>
      </div>

      {/* ══════════════ DESKTOP ══════════════ */}

      {/* expanded backdrop (behind drawer, in front of content) */}
      {expanded && (
        <div
          onClick={() => setExpanded(false)}
          className="hidden lg:block fixed inset-0 z-[39] bg-black/10"
        />
      )}

      {/* icon rail → full drawer */}
      <div
        className={`hidden lg:flex fixed top-0 left-0 h-full flex-col bg-white border-r border-gray-100 z-40 overflow-hidden transition-[width] duration-300 ease-in-out ${expanded ? EXPANDED_W : COLLAPSED_W}`}
      >
        {/* Logo row */}
        <div className={`shrink-0 flex items-center border-b border-gray-100 h-[57px] overflow-hidden transition-[padding] duration-300 ${expanded ? "px-4 gap-2.5" : "justify-center"}`}>
          <div className="w-7 h-7 rounded-full bg-[#3B694C] flex items-center justify-center shrink-0">
            <span className="text-white font-bold text-sm leading-none">E</span>
          </div>
          <span className={`font-bold text-[15px] text-gray-800 whitespace-nowrap transition-[opacity,max-width] duration-200 delay-75 ${expanded ? "opacity-100 max-w-[180px]" : "opacity-0 max-w-0"}`}>
            Everlast CRM
          </span>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {mainNav.map((item) => <DesktopItem key={item.label} {...item} />)}
          {isAdmin && (
            <>
              <div className="border-t border-gray-100 my-2 mx-1" />
              {expanded && (
                <p className="px-3 pb-1.5 text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Admin</p>
              )}
              {adminNav.map((item) => <DesktopItem key={item.label} {...item} />)}
            </>
          )}
        </nav>

        {/* Expand / collapse toggle */}
        <div className="shrink-0 border-t border-gray-100 p-2">
          <button
            onClick={() => setExpanded((v) => !v)}
            title={expanded ? "Collapse" : "Expand"}
            className={`flex items-center h-10 w-full rounded-xl text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition-colors overflow-hidden ${expanded ? "gap-3 px-3" : "justify-center"}`}
          >
            {expanded
              ? <ChevronsLeft  className="w-[18px] h-[18px] shrink-0" />
              : <ChevronsRight className="w-[18px] h-[18px] shrink-0" />}
            <span className={`text-[13.5px] whitespace-nowrap transition-[opacity,max-width] duration-200 delay-75 ${expanded ? "opacity-100 max-w-[180px]" : "opacity-0 max-w-0"}`}>
              Collapse
            </span>
          </button>
        </div>

        {/* Logout */}
        <div className="shrink-0 border-t border-gray-100 p-2">
          <button
            onClick={handleLogout}
            title="Sign out"
            className={`flex items-center h-10 w-full rounded-xl text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors overflow-hidden ${expanded ? "gap-3 px-3" : "justify-center"}`}
          >
            <LogOut className="w-[18px] h-[18px] shrink-0" />
            <span className={`text-[13.5px] whitespace-nowrap transition-[opacity,max-width] duration-200 delay-75 ${expanded ? "opacity-100 max-w-[180px]" : "opacity-0 max-w-0"}`}>
              Sign out
            </span>
          </button>
        </div>
      </div>

      {/* ── main content ── */}
      <div className="lg:ml-14 pt-12 lg:pt-0 h-screen flex flex-col overflow-hidden">
        {children}
      </div>
    </>
  );
}
