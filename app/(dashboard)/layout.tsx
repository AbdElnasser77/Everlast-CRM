"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useRef, startTransition } from "react";
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
  Images,
  ShieldCheck,
  ChevronsRight,
  ChevronsLeft,
  ChevronDown,
  Menu,
  X,
  LogOut,
} from "lucide-react";
import { getSocket, disconnectSocket } from "@/lib/socket";
import { apiLogout, apiGetStatsOverview } from "@/lib/api";
import { TooltipProvider } from "@/components/ui/tooltip";
import { WhatsAppNumberProvider, useActiveNumber } from "@/components/WhatsAppNumberProvider";
import { NumberSwitcher } from "@/components/NumberSwitcher";
import { CurrentUserProvider, useCurrentUser } from "@/components/CurrentUserProvider";
import { ToastProvider } from "@/components/ui/toast";
import DevCostTracker from "@/components/DevCostTracker";
import TemplateStatusWatcher from "@/components/TemplateStatusWatcher";


const COLLAPSED_W = "w-14";   // 56px icon rail
const EXPANDED_W  = "w-[260px]";

// The provider sits ABOVE the shell so the switcher itself is outside the
// remount boundary below — switching must not unmount the control you just used.
// Rendered inside CurrentUserProvider so it can ask for the permission.
function AdminDevCostTracker() {
  const { can } = useCurrentUser();
  return can("dev:tools") ? <DevCostTracker /> : null;
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <WhatsAppNumberProvider>
      <CurrentUserProvider>
        <DashboardShell>{children}</DashboardShell>
        {/* Dev-only, admin-only message/cost tracker; compiled out of production builds. */}
        {process.env.NODE_ENV === "development" && <AdminDevCostTracker />}
      </CurrentUserProvider>
    </WhatsAppNumberProvider>
  );
}

function DashboardShell({ children }: { children: ReactNode }) {
  const { activeNumberId } = useActiveNumber();
  const pathname = usePathname();
  const router = useRouter();
  const { can } = useCurrentUser();
  const [expanded, setExpanded] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  // Tagged with the number it was fetched for, so a count belonging to the
  // previous number can never be displayed — it is simply ignored once the
  // active number no longer matches, rather than reset from inside an effect.
  const [unread, setUnread] = useState<{ numberId: string | null; count: number }>({
    numberId: null,
    count: 0,
  });
  const unreadCount = unread.numberId === activeNumberId ? unread.count : 0;
  // Templates Meta approved/rejected since this browser last opened /templates.
  const [templateUpdates, setTemplateUpdates] = useState(0);
  const [contactsOpen, setContactsOpen] = useState(pathname.startsWith("/customers"));

  // Keep the Contacts sub-menu expanded whenever the user is on one of its pages.
  useEffect(() => {
    if (pathname.startsWith("/customers")) setContactsOpen(true);
  }, [pathname]);

  // Hover-to-expand: opens on hover and collapses again on mouse-leave.
  // A manual toggle "pins" it (won't auto-close).
  const hoverExpandedRef = useRef(false);

  function handleSidebarEnter() {
    if (expanded) return;
    hoverExpandedRef.current = true;
    setExpanded(true);
  }
  function handleSidebarLeave() {
    if (hoverExpandedRef.current) {
      hoverExpandedRef.current = false;
      setExpanded(false);
    }
  }
  function toggleExpanded() {
    hoverExpandedRef.current = false; // manual pin — don't auto-collapse on leave
    setExpanded((v) => !v);
  }

  async function handleLogout() {
    document.cookie = "logged_in=; path=/; max-age=0";
    localStorage.removeItem("user");
    try { await apiLogout(); } catch {}
    disconnectSocket();
    router.push("/login");
  }


  // The sidebar renders outside the key-remount below, so unlike every page this
  // effect does NOT re-run on its own when the number changes — activeNumberId is
  // in the dep array for exactly that reason. See `unread` above for why a stale
  // count cannot flash while the refetch is in flight.
  useEffect(() => {
    const forNumber = activeNumberId;
    function fetchUnread() {
      apiGetStatsOverview()
        .then((res) => setUnread({ numberId: forNumber, count: res.data.unreadMessages }))
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
  }, [activeNumberId]);

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

  // Each link names the permission that opens its page, and is shown only to
  // users who hold it — so the sidebar can never offer a page that would then
  // say "access denied". The Inbox needs conversation:WRITE, not read: MARKETING
  // may read conversations for context elsewhere, but the inbox is for replying.
  const navBeforeContacts = [
    { href: "/chats",            icon: MessageSquare,   label: "Inbox",        enabled: true,  badge: unreadCount > 0 ? unreadCount : undefined, perm: "conversation:write" as const },
  ].filter((i) => can(i.perm));
  const navAfterContacts = [
    { href: "/campaigns",        icon: Megaphone,       label: "Campaigns",    enabled: true, perm: "campaign:read" as const },
  ].filter((i) => can(i.perm));
  const showContacts = can("contact:read");
  const contactsActive = isActive("/customers");
  const listsActive = isActive("/customers/lists");
  const segmentsActive = isActive("/customers/segments");
  const contactsChildActive = contactsActive && !listsActive && !segmentsActive;
  // The management screens. Headed "Manage" rather than "Admin" now that
  // MARKETING sees most of them too.
  const adminNav = [
    { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard",     perm: "stats:read" as const },
    { href: "/team",      icon: UsersRound,      label: "Team & Access", perm: "user:read" as const },
    { href: "/templates", icon: LayoutTemplate,  label: "Templates",     perm: "template:write" as const, badge: templateUpdates > 0 ? templateUpdates : undefined },
    { href: "/media-library", icon: Images,      label: "Media Library", perm: "media:write" as const },
    { href: "/number-health", icon: ShieldCheck, label: "Number Health", perm: "stats:read" as const },
    { href: "/audit",     icon: ClipboardList,   label: "Audit Log",     perm: "audit:read" as const },
    { href: "/settings",  icon: Settings,        label: "Settings",      perm: "number:write" as const },
  ].filter((i) => can(i.perm));

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

  /* ── desktop Contacts item: expands into a Contacts / Lists sub-menu ── */
  const DesktopContactsNav = () => (
    <div>
      <button
        type="button"
        onClick={() => {
          if (!expanded) {
            hoverExpandedRef.current = false;
            setExpanded(true);
          }
          setContactsOpen((v) => !v);
        }}
        title={!expanded ? "Contacts" : undefined}
        className={`relative flex items-center h-10 w-full rounded-xl transition-colors overflow-hidden ${
          expanded ? "gap-3 px-3" : "justify-center"
        } ${contactsActive ? "bg-[#EEF6F1] text-[#3B694C]" : "text-gray-400 hover:bg-gray-50 hover:text-gray-600"}`}
      >
        {contactsActive && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-[#3B694C] rounded-r-full" />}
        <span className="relative shrink-0 flex items-center justify-center">
          <Contact className="w-[18px] h-[18px]" />
        </span>
        <span
          className={`flex-1 text-left text-[13.5px] font-medium whitespace-nowrap transition-[opacity,max-width] duration-200 delay-75 ${
            expanded ? "opacity-100 max-w-[200px]" : "opacity-0 max-w-0 pointer-events-none"
          }`}
        >
          Contacts
        </span>
        {expanded && (
          <ChevronDown className={`w-3.5 h-3.5 shrink-0 text-gray-400 transition-transform duration-200 ${contactsOpen ? "rotate-180" : ""}`} />
        )}
      </button>

      {expanded && (
        <div
          className={`overflow-hidden transition-[max-height,opacity] duration-200 ease-out ${
            contactsOpen ? "max-h-36 opacity-100" : "max-h-0 opacity-0"
          }`}
        >
          <div className="mt-0.5 ml-[29px] pl-2.5 border-l border-gray-100 space-y-0.5">
            <Link
              href="/customers"
              className={`relative flex items-center h-8 px-2.5 rounded-lg text-[13px] transition-colors ${
                contactsChildActive ? "bg-[#EEF6F1] text-[#3B694C] font-medium" : "text-gray-400 hover:bg-gray-50 hover:text-gray-600"
              }`}
            >
              Contacts
            </Link>
            <Link
              href="/customers/lists"
              className={`relative flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-[13px] transition-colors ${
                listsActive ? "bg-[#EEF6F1] text-[#3B694C] font-medium" : "text-gray-400 hover:bg-gray-50 hover:text-gray-600"
              }`}
            >
              Lists
            </Link>
            <Link
              href="/customers/segments"
              className={`relative flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-[13px] transition-colors ${
                segmentsActive ? "bg-[#EEF6F1] text-[#3B694C] font-medium" : "text-gray-400 hover:bg-gray-50 hover:text-gray-600"
              }`}
            >
              Segments
            </Link>
          </div>
        </div>
      )}
    </div>
  );

  /* ── mobile Contacts item: same accordion, always-visible text ── */
  const MobileContactsNav = () => (
    <div>
      <button
        type="button"
        onClick={() => setContactsOpen((v) => !v)}
        className={`relative flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-[13.5px] transition-colors ${
          contactsActive ? "bg-[#EEF6F1] text-[#3B694C] font-medium" : "text-gray-600 hover:bg-gray-50"
        }`}
      >
        {contactsActive && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-[#3B694C] rounded-r-full" />}
        <Contact className="w-[17px] h-[17px] shrink-0" />
        <span className="flex-1 text-left">Contacts</span>
        <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${contactsOpen ? "rotate-180" : ""}`} />
      </button>

      <div
        className={`overflow-hidden transition-[max-height,opacity] duration-200 ease-out ${
          contactsOpen ? "max-h-44 opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="mt-0.5 mb-0.5 ml-[22px] pl-2.5 border-l border-gray-100 space-y-0.5">
          <Link
            href="/customers"
            onClick={() => setMobileOpen(false)}
            className={`relative flex items-center px-3 py-2 rounded-lg text-[13px] transition-colors ${
              contactsChildActive ? "bg-[#EEF6F1] text-[#3B694C] font-medium" : "text-gray-500 hover:bg-gray-50"
            }`}
          >
            Contacts
          </Link>
          <Link
            href="/customers/lists"
            onClick={() => setMobileOpen(false)}
            className={`relative flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] transition-colors ${
              listsActive ? "bg-[#EEF6F1] text-[#3B694C] font-medium" : "text-gray-500 hover:bg-gray-50"
            }`}
          >
            Lists
          </Link>
          <Link
            href="/customers/segments"
            onClick={() => setMobileOpen(false)}
            className={`relative flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] transition-colors ${
              segmentsActive ? "bg-[#EEF6F1] text-[#3B694C] font-medium" : "text-gray-500 hover:bg-gray-50"
            }`}
          >
            Segments
          </Link>
        </div>
      </div>
    </div>
  );

  return (
    <TooltipProvider>
    <ToastProvider>
    <>
      {can("template:write") && <TemplateStatusWatcher onCount={setTemplateUpdates} />}
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
        <div className="ml-auto">
          <NumberSwitcher />
        </div>
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
          {navBeforeContacts.map((item) => <MobileItem key={item.label} {...item} />)}
          {showContacts && <MobileContactsNav />}
          {navAfterContacts.map((item) => <MobileItem key={item.label} {...item} />)}
          {adminNav.length > 0 && (
            <>
              <p className="px-3 pt-5 pb-1.5 text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Manage</p>
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
        onMouseEnter={handleSidebarEnter}
        onMouseLeave={handleSidebarLeave}
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
          {navBeforeContacts.map((item) => <DesktopItem key={item.label} {...item} />)}
          {showContacts && <DesktopContactsNav />}
          {navAfterContacts.map((item) => <DesktopItem key={item.label} {...item} />)}
          {adminNav.length > 0 && (
            <>
              <div className="border-t border-gray-100 my-2 mx-1" />
              {expanded && (
                <p className="px-3 pb-1.5 text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Manage</p>
              )}
              {adminNav.map((item) => <DesktopItem key={item.label} {...item} />)}
            </>
          )}
        </nav>

        {/* Expand / collapse toggle */}
        <div className="shrink-0 border-t border-gray-100 p-2">
          <button
            onClick={toggleExpanded}
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
      {/* Keying the content on the active number remounts the entire dashboard
          subtree on a switch. In an app with no data-fetching library there is no
          cache to invalidate, so this one line IS the re-scoping: every useState
          resets and all ~30 effects re-run under the new number, with no
          per-page changes and no chance of a page being forgotten.

          It also deletes the state that stale-data bugs live in — the campaign
          progress Math.max guards and the chats page's conversation lookup.

          Requests already in flight are handled separately, in lib/api.ts: the
          remount does not cancel them. Do not remove one without the other. */}
      <div className="lg:ml-14 pt-12 lg:pt-0 h-screen flex flex-col overflow-hidden">
        {/* Desktop top bar. Deliberately OUTSIDE the keyed div below: if the
            switcher lived inside it, choosing a number would unmount the very
            menu you just clicked. (Mobile has its own bar, above.)

            Its 48px is taken from the page's height, not added to it — pages
            size themselves with h-full / min-h-full against the flex-1 region
            below, never with min-h-screen, or their bottom edge would be pushed
            under the fold. */}
        <header className="hidden lg:flex h-12 shrink-0 items-center justify-end gap-3 px-4 border-b border-gray-100 bg-white">
          <NumberSwitcher />
        </header>

        <div
          key={activeNumberId ?? "default"}
          className="flex-1 min-h-0 flex flex-col overflow-hidden"
        >
          {children}
        </div>
      </div>
    </>
    </ToastProvider>
    </TooltipProvider>
  );
}
