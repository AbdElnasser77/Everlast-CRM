"use client";

// Small pieces the Marketing dashboard's sections share: the section card,
// the "how is this counted" tooltip, empty states, number formats and the
// Overview / Marketing tabs on the Dashboard.

import type { ReactNode } from "react";
import Link from "next/link";
import { Info, type LucideIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export const fmt = (n: number | null | undefined) => (n === null || n === undefined ? "—" : n.toLocaleString("en-US"));
export const fmtPct = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `${n}%`);

/** An ⓘ that explains how a figure is counted. Hover on a computer, tap on a phone. */
export function InfoTip({ children, label = "How this is counted" }: { children: ReactNode; label?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className="inline-flex items-center justify-center w-5 h-5 rounded-full text-gray-300 hover:text-gray-500 focus-visible:text-gray-600 outline-none cursor-help align-middle"
        >
          <Info className="w-3.5 h-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={6} className="max-w-[300px] text-left leading-snug">
        {children}
      </TooltipContent>
    </Tooltip>
  );
}

export function Section({
  title,
  icon: Icon,
  info,
  sub,
  action,
  tone = "default",
  children,
}: {
  title: string;
  icon: LucideIcon;
  info?: ReactNode;
  sub?: ReactNode;
  action?: ReactNode;
  tone?: "default" | "alert";
  children: ReactNode;
}) {
  return (
    <section
      className={`bg-white rounded-xl border p-4 sm:p-5 min-w-0 ${tone === "alert" ? "border-amber-200" : "border-gray-100"}`}
    >
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-[15px] font-bold text-gray-900 flex items-center gap-2">
            <Icon className={`w-4 h-4 ${tone === "alert" ? "text-amber-600" : "text-brand-fg"}`} />
            {title}
            {info && <InfoTip>{info}</InfoTip>}
          </h2>
          {sub && <p className="text-[12px] text-gray-400 mt-0.5">{sub}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-center text-[13px] text-gray-400 py-8">{children}</p>;
}

/** The Dashboard's two views, for people who can open both (admins). */
export function DashboardTabs({ current }: { current: "overview" | "marketing" }) {
  const tabs = [
    { key: "overview", href: "/dashboard", label: "Overview" },
    { key: "marketing", href: "/dashboard/marketing", label: "Marketing" },
  ] as const;
  return (
    <nav aria-label="Dashboard views" className="inline-flex bg-white border border-gray-100 rounded-lg p-1 gap-1">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={current === t.key ? "page" : undefined}
          className={`text-[12.5px] font-semibold rounded-md px-3 py-1 transition-colors ${
            current === t.key ? "bg-brand text-white" : "text-gray-500 hover:text-gray-800 hover:bg-gray-50"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
