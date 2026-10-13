"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, CalendarCheck, FileText, Megaphone, MessagesSquare, ScrollText, Users, type LucideIcon } from "lucide-react";
import { ReportGate } from "@/components/supervision/report/ReportShell";

// ── Reports hub ───────────────────────────────────────────────────────────────
// One card per supervisor report. Each report has its own period and line
// filter; the line chosen on the Supervision page carries over.

const REPORTS: { slug: string; title: string; description: string; icon: LucideIcon; formats: string[] }[] = [
  {
    slug: "overview",
    title: "Overview",
    description: "The whole period on a few pages: chats, response times, team, bookings, campaigns, plus chosen transcripts.",
    icon: FileText,
    formats: ["PDF"],
  },
  {
    slug: "transcripts",
    title: "Transcripts",
    description: "Filter chats by agent, line, outcome, late or unanswered replies, and print up to 100 full conversations.",
    icon: ScrollText,
    formats: ["PDF"],
  },
  {
    slug: "bookings",
    title: "Bookings & couldn’t book",
    description: "Every booking request: what was asked, where the patient came from, who took it, how fast, what was booked or why not.",
    icon: CalendarCheck,
    formats: ["PDF", "CSV"],
  },
  {
    slug: "team",
    title: "Team performance",
    description: "Speed and results per person: response-time bands, slowest replies, outcomes, bookings, day-by-day trend, busiest hours.",
    icon: Users,
    formats: ["PDF", "CSV"],
  },
  {
    slug: "campaigns",
    title: "Campaigns",
    description: "Each campaign from sent to booked: delivery, reads, replies, booking requests, patients booked, couldn’t-book reasons, opt-outs.",
    icon: Megaphone,
    formats: ["PDF", "CSV"],
  },
  {
    slug: "chats",
    title: "Chats",
    description: "One row per chat with every detail — who handled it, how fast, longest wait, outcome, booking, source — to filter in Excel.",
    icon: MessagesSquare,
    formats: ["PDF", "Excel"],
  },
];

function ReportsHub() {
  const params = useSearchParams();
  const number = params.get("number");
  const qs = number && /^\d+$/.test(number) ? `?number=${number}` : "";

  return (
    <div className="flex-1 overflow-y-auto bg-canvas [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-brand/25 [&::-webkit-scrollbar-thumb]:rounded-full">
      <div className="max-w-[1100px] mx-auto px-4 sm:px-6 py-6 space-y-5">
        <div>
          <Link href={`/supervision${qs}`} className="inline-flex items-center gap-1 text-[12px] text-gray-400 hover:text-gray-700 mb-1">
            <ArrowLeft className="w-3.5 h-3.5" /> Supervision
          </Link>
          <h1 className="text-[22px] font-bold text-gray-900 flex items-center gap-2">
            <FileText className="w-5 h-5 text-brand-fg" />
            Reports
          </h1>
          <p className="text-[13px] text-gray-400 mt-0.5">
            Pick a report, a period (up to 92 days) and a WhatsApp line. Times are clinic time (Dubai).
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {REPORTS.map((r) => (
            <Link
              key={r.slug}
              href={`/supervision/reports/${r.slug}${qs}`}
              className="group bg-white rounded-xl border border-gray-100 hover:border-brand/40 hover:shadow-sm p-4 flex flex-col gap-2 transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <span className="w-9 h-9 rounded-lg bg-brand-100 text-brand-fg flex items-center justify-center shrink-0">
                  <r.icon className="w-[18px] h-[18px]" />
                </span>
                <span className="text-[14.5px] font-semibold text-gray-900">{r.title}</span>
                <ArrowRight className="w-4 h-4 ml-auto text-gray-300 group-hover:text-brand-fg transition-colors" />
              </div>
              <p className="text-[12.5px] text-gray-500 leading-snug flex-1">{r.description}</p>
              <div className="flex gap-1.5">
                {r.formats.map((f) => (
                  <span key={f} className="text-[10.5px] font-semibold text-gray-500 border border-gray-200 rounded px-1.5 py-px">
                    {f}
                  </span>
                ))}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ReportsHubPage() {
  return (
    <ReportGate>
      <ReportsHub />
    </ReportGate>
  );
}
