"use client";

import { useEffect, useRef, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { inputCls } from "@/components/settings/shared";

// The page shell Settings and Documentation share: a grouped section menu on
// the left (a dropdown below md), a heading bar for the open section, and its
// content in a centred column. The page owns which section is open (it lives
// in the URL) — this only draws it.

export interface NavSection<K extends string = string> {
  key: K;
  label: string;
  group: string;
  icon: LucideIcon;
  description: string;
}

interface SectionedLayoutProps<K extends string> {
  title: string;
  subtitle: string;
  sections: readonly NavSection<K>[];
  active: NavSection<K>;
  onSelect: (key: K) => void;
  /** Width of the centred column, e.g. "max-w-2xl". Heading and content share it. */
  columnClassName: string;
  /** Under the title in the sidebar (and above the dropdown on mobile) — e.g. a search box. */
  sidebarTop?: ReactNode;
  /** Shown in the menu when `sections` is empty, e.g. "No pages match". */
  emptyMenu?: ReactNode;
  children: ReactNode;
}

function groupsOf<K extends string>(sections: readonly NavSection<K>[]) {
  return [...new Set(sections.map((s) => s.group))].map((group) => ({
    group,
    items: sections.filter((s) => s.group === group),
  }));
}

export function SectionedLayout<K extends string>({
  title,
  subtitle,
  sections,
  active,
  onSelect,
  columnClassName,
  sidebarTop,
  emptyMenu,
  children,
}: SectionedLayoutProps<K>) {
  const groups = groupsOf(sections);
  const ActiveIcon = active.icon;
  const column = `mx-auto w-full ${columnClassName}`;
  const scrollRef = useRef<HTMLDivElement>(null);

  // A newly opened section starts at its top, not where the last one was scrolled to.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [active.key]);

  return (
    <div className="flex h-full bg-white font-[family-name:var(--font-geist-sans)]">
      {/* Section nav — a dropdown takes its place below md */}
      <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-gray-100 overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-gray-200 [&::-webkit-scrollbar-thumb]:rounded-full">
        <div className="px-5 pt-6 pb-5">
          <h1 className="text-[22px] font-bold text-gray-900 tracking-tight">{title}</h1>
          <p className="text-[13px] text-gray-400 mt-0.5">{subtitle}</p>
          {sidebarTop && <div className="mt-4">{sidebarTop}</div>}
        </div>
        <nav aria-label={`${title} sections`} className="px-3 pb-6 space-y-5">
          {groups.length === 0 && emptyMenu}
          {groups.map(({ group, items }) => (
            <div key={group}>
              <p className="px-2.5 mb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{group}</p>
              <ul className="space-y-0.5">
                {items.map((s) => {
                  const isActive = s.key === active.key;
                  const Icon = s.icon;
                  return (
                    <li key={s.key}>
                      <button
                        type="button"
                        onClick={() => onSelect(s.key)}
                        aria-current={isActive ? "page" : undefined}
                        className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] text-left transition-colors cursor-pointer ${
                          isActive
                            ? "bg-brand-100 text-brand-fg font-semibold"
                            : "text-gray-600 font-medium hover:bg-gray-50 hover:text-gray-900"
                        }`}
                      >
                        <Icon className="w-4 h-4 shrink-0" />
                        <span className="truncate">{s.label}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <div className="md:hidden px-4 pt-5 pb-4 border-b border-gray-100 shrink-0">
          <h1 className="text-[22px] font-bold text-gray-900 tracking-tight">{title}</h1>
          {sidebarTop && <div className="mt-3">{sidebarTop}</div>}
          <select
            aria-label={`${title} section`}
            value={active.key}
            onChange={(e) => onSelect(e.target.value as K)}
            className={`${inputCls} mt-3 cursor-pointer`}
          >
            {/* The open section stays selectable even when a search hides it from the menu. */}
            {!sections.some((s) => s.key === active.key) && <option value={active.key}>{active.label}</option>}
            {groups.map(({ group, items }) => (
              <optgroup key={group} label={group}>
                {items.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </optgroup>
            ))}
          </select>
        </div>

        {/* Section heading */}
        <div className="border-b border-gray-100 shrink-0">
          <div className={`${column} flex items-center gap-3 px-6 py-4`}>
            <span className="w-9 h-9 rounded-xl bg-brand-100 text-brand-fg flex items-center justify-center shrink-0">
              <ActiveIcon className="w-[18px] h-[18px]" />
            </span>
            <div className="min-w-0">
              <h2 className="text-[16px] font-bold text-gray-900 truncate">{active.label}</h2>
              <p className="text-[12px] text-gray-400 truncate">{active.description}</p>
            </div>
          </div>
        </div>

        <div
          ref={scrollRef}
          className="flex-1 min-h-0 flex flex-col overflow-auto bg-canvas [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-200 [&::-webkit-scrollbar-thumb]:rounded-full"
        >
          <div className={`${column} flex-1 min-h-0 flex flex-col`}>{children}</div>
        </div>
      </div>
    </div>
  );
}
