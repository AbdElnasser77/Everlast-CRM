"use client";

// The Marketing dashboard's sections, in page order: Needs attention,
// Campaign funnel, Campaigns, Flows, Audience, Line health. Each takes its
// slice of GET /api/stats/marketing and renders its own empty state.

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ChevronsUpDown,
  Filter,
  Gauge,
  ListChecks,
  Megaphone,
  ShieldCheck,
  Users,
  Workflow,
} from "lucide-react";
import type {
  MarketingAttention,
  MarketingAudience,
  MarketingCampaignRow,
  MarketingFlowRow,
  MarketingFunnel,
  MarketingLineHealth,
} from "@/types";
import { KpiCard } from "@/components/supervision/KpiStrip";
import { campaignStatusLabel } from "@/components/supervision/report/reportFormat";
import { dateTime, shortDate } from "@/components/supervision/format";
import { Empty, InfoTip, Section, fmt, fmtPct } from "./parts";

/** Opens a campaign, switching to its line first (campaign pages are per line). */
export type OpenCampaign = (id: number, whatsappNumberId: number) => void;

function CampaignLink({ id, line, name, open, deleted }: { id: number; line: number; name: string; open: OpenCampaign; deleted?: boolean }) {
  if (deleted) {
    return (
      <span className="text-gray-500" title="Deleted after it finished — still counted here">
        {name} <span className="text-[11px] text-gray-400">(deleted)</span>
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={() => open(id, line)}
      className="text-left font-medium text-gray-900 hover:text-brand-fg hover:underline underline-offset-2 cursor-pointer"
    >
      {name}
    </button>
  );
}

const STATUS_COLORS: Record<string, string> = {
  COMPLETED: "bg-green-50 text-green-700",
  RUNNING: "bg-blue-50 text-blue-700",
  PAUSED: "bg-orange-50 text-orange-600",
  SCHEDULED: "bg-amber-50 text-amber-700",
  PENDING_APPROVAL: "bg-amber-50 text-amber-700",
  CANCELLED: "bg-gray-100 text-gray-500",
  DRAFT: "bg-gray-100 text-gray-500",
};

function StatusPill({ status }: { status: string }) {
  return (
    <span className={`inline-block whitespace-nowrap px-2 py-0.5 rounded-full text-[11px] font-semibold ${STATUS_COLORS[status] ?? "bg-gray-100 text-gray-500"}`}>
      {campaignStatusLabel(status)}
    </span>
  );
}

// ── 1. Needs attention ───────────────────────────────────────────────────

const PAUSE_LABELS: Record<string, string> = {
  MANUAL: "Paused by a person",
  QUIET_HOURS: "Quiet hours — resumes by itself",
  NUMBER_INACTIVE: "The line was turned off",
  SEND_ERROR: "Meta refused the send",
  RATE_LIMIT: "Slowed down — resumes by itself",
  CONNECTION: "Connection lost — resumes by itself",
  TEMPLATE_UNAVAILABLE: "Template unavailable",
  QUALITY: "Line quality dropped",
};

const TEMPLATE_STATUS: Record<string, { label: string; cls: string }> = {
  SUBMITTED: { label: "Waiting at Meta", cls: "bg-amber-50 text-amber-700" },
  REJECTED: { label: "Rejected", cls: "bg-red-50 text-red-700" },
  PAUSED: { label: "Paused by Meta", cls: "bg-orange-50 text-orange-600" },
};

export function attentionCount(a: MarketingAttention): number {
  return a.pendingApproval.count + a.rejectedRecently.length + a.paused.length + a.templates.length;
}

function AttentionGroup({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  if (count === 0) return null;
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">
        {title} <span className="text-gray-700">· {count}</span>
      </p>
      <ul className="space-y-2">{children}</ul>
    </div>
  );
}

export function AttentionSection({ attention, open }: { attention: MarketingAttention; open: OpenCampaign }) {
  if (attentionCount(attention) === 0) return null;
  const a = attention;
  const item = "rounded-lg border border-gray-100 bg-canvas px-3 py-2 text-[13px]";
  return (
    <Section
      title="Needs attention"
      icon={AlertTriangle}
      tone="alert"
      sub="As of now, whatever the period"
      info={
        <>
          Campaigns waiting for an admin&apos;s approval, campaigns rejected back to draft in the last {a.recentDays} days, paused
          campaigns, and templates waiting at Meta, paused by Meta, or rejected in the last {a.recentDays} days.
        </>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-5">
        <AttentionGroup title="Waiting for approval" count={a.pendingApproval.count}>
          {a.pendingApproval.campaigns.map((c) => (
            <li key={c.id} className={item}>
              <CampaignLink id={c.id} line={c.whatsappNumberId} name={c.name} open={open} />
              <p className="text-[12px] text-gray-400 mt-0.5">
                {c.line ?? "—"} · {fmt(c.recipients)} recipients
                {c.submittedAt && ` · submitted ${shortDate(c.submittedAt)}`}
                {c.submittedBy && ` by ${c.submittedBy}`}
              </p>
            </li>
          ))}
          {a.pendingApproval.count > a.pendingApproval.campaigns.length && (
            <li className="text-[12px] text-gray-400">…and {a.pendingApproval.count - a.pendingApproval.campaigns.length} more on the Campaigns page.</li>
          )}
        </AttentionGroup>
        <AttentionGroup title="Rejected back to draft" count={a.rejectedRecently.length}>
          {a.rejectedRecently.map((c) => (
            <li key={c.id} className={item}>
              <CampaignLink id={c.id} line={c.whatsappNumberId} name={c.name} open={open} />
              {c.reason && <p className="text-[12.5px] text-red-700 mt-0.5">“{c.reason}”</p>}
              <p className="text-[12px] text-gray-400 mt-0.5">
                {c.line ?? "—"}
                {c.reviewedAt && ` · ${shortDate(c.reviewedAt)}`}
                {c.reviewedBy && ` by ${c.reviewedBy}`}
              </p>
            </li>
          ))}
        </AttentionGroup>
        <AttentionGroup title="Paused" count={a.paused.length}>
          {a.paused.map((c) => (
            <li key={c.id} className={item}>
              <CampaignLink id={c.id} line={c.whatsappNumberId} name={c.name} open={open} />
              <p className="text-[12.5px] text-orange-600 mt-0.5">
                {(c.reason && PAUSE_LABELS[c.reason]) ?? "Paused"}
                {c.detail && <span className="text-gray-500"> — {c.detail}</span>}
              </p>
              <p className="text-[12px] text-gray-400 mt-0.5">
                {c.line ?? "—"} · {fmt(c.sent)} / {fmt(c.recipients)} sent
                {c.resumeAt && ` · resumes ${dateTime(c.resumeAt)}`}
              </p>
            </li>
          ))}
        </AttentionGroup>
        <AttentionGroup title="Templates" count={a.templates.length}>
          {a.templates.map((t) => {
            const s = TEMPLATE_STATUS[t.status];
            return (
              <li key={t.id} className={item}>
                <div className="flex items-center gap-2 flex-wrap">
                  <Link href="/templates" className="font-medium text-gray-900 hover:text-brand-fg hover:underline underline-offset-2">
                    {t.name}
                  </Link>
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${s?.cls ?? "bg-gray-100 text-gray-500"}`}>{s?.label ?? t.status}</span>
                </div>
                {t.reason && <p className="text-[12.5px] text-red-700 mt-0.5">{t.reason}</p>}
                <p className="text-[12px] text-gray-400 mt-0.5">Since {shortDate(t.changedAt)}</p>
              </li>
            );
          })}
        </AttentionGroup>
      </div>
    </Section>
  );
}

// ── 2. Campaign funnel ───────────────────────────────────────────────────

export function FunnelSection({ funnel, optOutWindowDays }: { funnel: MarketingFunnel; optOutWindowDays: number }) {
  const f = funnel;
  // One hue, deepening as the funnel narrows; every bar is a share of Sent.
  const stages = [
    { key: "sent", label: "Sent", value: f.sent, pct: f.sent ? 100 : null, bar: "bg-brand/30 dark:bg-brand/45" },
    { key: "delivered", label: "Delivered", value: f.delivered, pct: f.rates.deliveredPct, bar: "bg-brand/50 dark:bg-brand/65" },
    { key: "read", label: "Read", value: f.read, pct: f.rates.readPct, bar: "bg-brand/75 dark:bg-brand/85" },
    { key: "replied", label: "Replied", value: f.replied, pct: f.rates.repliedPct, bar: "bg-brand" },
  ];
  const side = [
    { label: "Failed", value: f.failed, tone: f.failed > 0 ? "text-red-600" : "text-gray-900" },
    { label: "Skipped", value: f.skipped, tone: "text-gray-900" },
    { label: "Still to send", value: f.pending, tone: "text-gray-900" },
    {
      label: "Opt-outs",
      value: f.optOutsFromCampaigns,
      tone: f.optOutsFromCampaigns > 0 ? "text-orange-600" : "text-gray-900",
      sub: fmtPct(f.rates.optOutPct),
    },
  ];
  const reasonMax = Math.max(1, ...f.failedReasons.map((r) => r.count));

  return (
    <Section
      title="Campaign funnel"
      icon={Filter}
      sub={`${fmt(f.campaigns)} campaign${f.campaigns === 1 ? "" : "s"} started in the period · ${fmt(f.recipients)} recipients`}
      info={
        <>
          Every recipient of the campaigns that <b>started</b> in the period, whenever their status came in. Sent = accepted by Meta and
          not failed since. Delivered, read and replied are shares of sent (read counts as delivered). Replied = the first reply credited
          to the campaign (a reply to it, or their next message within 7 days). Skipped = opted out or over the frequency limit by the
          time their turn came. Opt-outs: see the Opt-outs ⓘ.
        </>
      }
    >
      {f.recipients === 0 ? (
        <Empty>No campaign started in this period.</Empty>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,300px)] gap-6">
          <div className="space-y-3">
            {stages.map((s) => (
              <div key={s.key} title={`${s.label}: ${fmt(s.value)}${s.pct !== null ? ` (${s.pct}% of sent)` : ""}`}>
                <div className="flex items-baseline justify-between gap-3 text-[13px] mb-1">
                  <span className="font-semibold text-gray-700">{s.label}</span>
                  <span className="tabular-nums">
                    <span className="font-bold text-gray-900">{fmt(s.value)}</span>
                    {s.key !== "sent" && <span className="text-gray-400 ml-1.5">{fmtPct(s.pct)}</span>}
                  </span>
                </div>
                <div className="h-3 rounded-full bg-gray-100 overflow-hidden">
                  <div className={`h-full rounded-full ${s.bar}`} style={{ width: `${Math.max(s.value > 0 ? 1.5 : 0, s.pct ?? 0)}%` }} />
                </div>
              </div>
            ))}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
              {side.map((x) => (
                <div key={x.label} className="rounded-lg bg-canvas border border-gray-100 px-3 py-2">
                  <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide flex items-center gap-1">
                    {x.label}
                    {x.label === "Opt-outs" && (
                      <InfoTip label="How opt-outs are counted">
                        Patients who opted out of the campaign&apos;s line (STOP / UNSUBSCRIBE, WhatsApp&apos;s own &ldquo;stop
                        promotions&rdquo;, or staff opting them out) within {optOutWindowDays} days after the campaign reached them, or
                        who answered the campaign itself with STOP. Each opt-out counts once, for the campaign it answered or else the
                        latest one before it. A global &ldquo;do not contact&rdquo; switch isn&apos;t counted (it has no date).
                      </InfoTip>
                    )}
                  </p>
                  <p className={`text-[18px] font-bold tabular-nums leading-tight ${x.tone}`}>
                    {fmt(x.value)}
                    {"sub" in x && x.sub && <span className="text-[12px] font-medium text-gray-400 ml-1">{x.sub}</span>}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Why some didn&apos;t get it</p>
            {f.failedReasons.length === 0 ? (
              <p className="text-[13px] text-gray-400">Nobody failed or was skipped.</p>
            ) : (
              <ul className="space-y-2.5">
                {f.failedReasons.map((r) => (
                  <li key={`${r.category}-${r.label}`} title={r.example ?? undefined}>
                    <div className="flex items-baseline justify-between gap-3 text-[12.5px]">
                      <span className="text-gray-700 truncate">{r.label}</span>
                      <span className="font-semibold text-gray-900 tabular-nums">{fmt(r.count)}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden mt-1">
                      <div className="h-full rounded-full bg-gray-400" style={{ width: `${(r.count / reasonMax) * 100}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Section>
  );
}

// ── 3. Campaigns table ───────────────────────────────────────────────────

type SortKey = "name" | "startedAt" | "sent" | "deliveredPct" | "readPct" | "repliedPct" | "failed" | "optOuts";

const SORT_VALUE: Record<SortKey, (c: MarketingCampaignRow) => number | string> = {
  name: (c) => c.name.toLowerCase(),
  startedAt: (c) => c.startedAt,
  sent: (c) => c.sent,
  deliveredPct: (c) => c.rates.deliveredPct ?? -1,
  readPct: (c) => c.rates.readPct ?? -1,
  repliedPct: (c) => c.rates.repliedPct ?? -1,
  failed: (c) => c.failed + c.skipped,
  optOuts: (c) => c.optOuts,
};

function SortHeader({
  label,
  k,
  sort,
  onSort,
  align = "right",
}: {
  label: string;
  k: SortKey;
  sort: { key: SortKey; dir: "asc" | "desc" };
  onSort: (k: SortKey) => void;
  align?: "left" | "right";
}) {
  const active = sort.key === k;
  const Icon = !active ? ChevronsUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th
      className={`pb-3 px-2 font-semibold whitespace-nowrap ${align === "right" ? "text-right" : "text-left"}`}
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => onSort(k)}
        className={`inline-flex items-center gap-1 uppercase tracking-wide cursor-pointer hover:text-gray-700 ${active ? "text-gray-700" : ""}`}
      >
        {label}
        <Icon className="w-3 h-3" />
      </button>
    </th>
  );
}

export function CampaignsSection({ campaigns, open }: { campaigns: MarketingCampaignRow[]; open: OpenCampaign }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "startedAt", dir: "desc" });
  const rows = useMemo(() => {
    const get = SORT_VALUE[sort.key];
    const out = [...campaigns].sort((a, b) => {
      const x = get(a);
      const y = get(b);
      return x < y ? -1 : x > y ? 1 : 0;
    });
    return sort.dir === "desc" ? out.reverse() : out;
  }, [campaigns, sort]);
  const onSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "name" ? "asc" : "desc" }));

  return (
    <Section
      title="Campaigns"
      icon={Megaphone}
      sub="Started in the period · rates are shares of sent"
      info={<>Each campaign that started in the period. Click a column to sort; click a name to open the campaign (switches to its line).</>}
    >
      {campaigns.length === 0 ? (
        <Empty>No campaign started in this period.</Empty>
      ) : (
        <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
          <table className="w-full text-[13px] min-w-[860px]">
            <thead>
              <tr className="text-[11px] text-gray-400 border-b border-gray-100">
                <SortHeader label="Campaign" k="name" sort={sort} onSort={onSort} align="left" />
                <SortHeader label="Started" k="startedAt" sort={sort} onSort={onSort} align="left" />
                <SortHeader label="Sent" k="sent" sort={sort} onSort={onSort} />
                <SortHeader label="Delivered" k="deliveredPct" sort={sort} onSort={onSort} />
                <SortHeader label="Read" k="readPct" sort={sort} onSort={onSort} />
                <SortHeader label="Replied" k="repliedPct" sort={sort} onSort={onSort} />
                <SortHeader label="Failed / skipped" k="failed" sort={sort} onSort={onSort} />
                <SortHeader label="Opt-outs" k="optOuts" sort={sort} onSort={onSort} />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map((c) => (
                <tr key={c.id} className="align-top">
                  <td className="py-2.5 px-2 max-w-[280px]">
                    <CampaignLink id={c.id} line={c.whatsappNumberId} name={c.name} open={open} deleted={c.deleted} />
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <StatusPill status={c.status} />
                      <span className="text-[11.5px] text-gray-400 truncate">
                        {c.line ?? "—"}
                        {c.template && ` · ${c.template}`}
                      </span>
                    </div>
                  </td>
                  <td className="py-2.5 px-2 text-gray-500 whitespace-nowrap">{shortDate(c.startedAt)}</td>
                  <td className="py-2.5 px-2 text-right tabular-nums">
                    <span className="font-semibold text-gray-900">{fmt(c.sent)}</span>
                    {c.recipients !== c.sent && <span className="text-gray-400"> / {fmt(c.recipients)}</span>}
                  </td>
                  <RateCell n={c.delivered} pct={c.rates.deliveredPct} />
                  <RateCell n={c.read} pct={c.rates.readPct} />
                  <RateCell n={c.replied} pct={c.rates.repliedPct} />
                  <td className="py-2.5 px-2 text-right tabular-nums">
                    <span className={c.failed > 0 ? "text-red-600 font-semibold" : "text-gray-700"}>{fmt(c.failed)}</span>
                    <span className="text-gray-400"> / {fmt(c.skipped)}</span>
                  </td>
                  <RateCell n={c.optOuts} pct={c.rates.optOutPct} warn={c.optOuts > 0} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

function RateCell({ n, pct, warn }: { n: number; pct: number | null; warn?: boolean }) {
  return (
    <td className="py-2.5 px-2 text-right tabular-nums whitespace-nowrap">
      <span className={`font-semibold ${warn ? "text-orange-600" : "text-gray-900"}`}>{fmtPct(pct)}</span>
      <span className="block text-[11.5px] text-gray-400">{fmt(n)}</span>
    </td>
  );
}

// ── 4. Flows ─────────────────────────────────────────────────────────────

export function FlowsSection({ flows, stalledMinutes, canOpen }: { flows: MarketingFlowRow[]; stalledMinutes: number; canOpen: boolean }) {
  return (
    <Section
      title="Flows"
      icon={Workflow}
      sub="Runs started in the period"
      info={
        <>
          Completed = reached the end. Handed off = passed to a person (an Assign step, or someone replied by hand). Dropped = no answer
          within 24 hours, stopped (opted out or replaced by a newer run), or idle for over {stalledMinutes} minutes without finishing.
          Top choices count each run once.
        </>
      }
    >
      {flows.length === 0 ? (
        <Empty>No flow ran in this period.</Empty>
      ) : (
        <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
          <table className="w-full text-[13px] min-w-[760px]">
            <thead>
              <tr className="text-left text-[11px] text-gray-400 uppercase tracking-wide border-b border-gray-100">
                <th className="pb-3 px-2 font-semibold">Flow</th>
                <th className="pb-3 px-2 font-semibold text-right">Started</th>
                <th className="pb-3 px-2 font-semibold text-right">Completed</th>
                <th className="pb-3 px-2 font-semibold text-right">Handed off</th>
                <th className="pb-3 px-2 font-semibold text-right">Dropped</th>
                <th className="pb-3 px-2 font-semibold">Top choices</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {flows.map((f) => (
                <tr key={f.id} className="align-top">
                  <td className="py-2.5 px-2">
                    {canOpen ? (
                      <Link href={`/campaigns/flows/${f.id}`} className="font-medium text-gray-900 hover:text-brand-fg hover:underline underline-offset-2">
                        {f.name}
                      </Link>
                    ) : (
                      <span className="font-medium text-gray-900">{f.name}</span>
                    )}
                    {(f.active > 0 || f.failed > 0 || !f.isActive) && (
                      <p className="text-[11.5px] text-gray-400 mt-0.5">
                        {[f.active > 0 && `${f.active} still going`, f.failed > 0 && `${f.failed} failed`, !f.isActive && "turned off"]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    )}
                  </td>
                  <td className="py-2.5 px-2 text-right font-semibold text-gray-900 tabular-nums">{fmt(f.started)}</td>
                  <RateCell n={f.completed} pct={f.rates.completedPct} />
                  <RateCell n={f.handedOff} pct={f.rates.handedOffPct} />
                  <RateCell n={f.dropped} pct={f.rates.droppedPct} warn={f.dropped > 0} />
                  <td className="py-2.5 px-2">
                    {f.topChoices.length === 0 ? (
                      <span className="text-gray-400">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {f.topChoices.map((c) => (
                          <span key={c.choice} className="inline-flex items-center gap-1 rounded-full bg-brand-50 border border-brand/15 px-2 py-0.5 text-[11.5px] text-gray-700">
                            {c.choice}
                            <span className="font-semibold text-brand-fg tabular-nums">{fmt(c.runs)}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

// ── 5. Audience ──────────────────────────────────────────────────────────

export function AudienceSection({
  audience,
  lineScoped,
  canOpenLists,
  canOpenSettings,
}: {
  audience: MarketingAudience;
  lineScoped: boolean;
  canOpenLists: boolean;
  canOpenSettings: boolean;
}) {
  const a = audience;
  const capOn = a.frequencyCapDays > 0;
  return (
    <Section
      title="Audience"
      icon={Users}
      sub={lineScoped ? "Contacts are shared by every line; reachability is for the chosen line" : "Contacts are shared by every line"}
      info={
        <>
          Reachable = not on the global &ldquo;do not contact&rdquo; list{lineScoped ? " and not opted out of this line" : ""}. Opted out ={" "}
          {lineScoped ? "global, or opted out of this line" : "global, or opted out of at least one line"}. New opt-outs = recorded in the
          period.{capOn && " Frequency-capped = had a campaign within the Campaign safety limit, so a campaign now would skip them."}
        </>
      }
    >
      <div className={`grid grid-cols-2 gap-3 ${capOn ? "xl:grid-cols-4" : "xl:grid-cols-3"}`}>
        <KpiCard title="Contacts" icon={<Users className="w-4 h-4" />} value={fmt(a.totalContacts)} sub={`${fmt(a.newContacts)} new in the period`} />
        <KpiCard
          title="Reachable"
          icon={<ShieldCheck className="w-4 h-4" />}
          value={fmt(a.reachable)}
          sub={a.totalContacts ? `${Math.round((a.reachable / a.totalContacts) * 100)}% of contacts` : "—"}
        />
        <KpiCard
          title="Opted out"
          icon={<AlertTriangle className="w-4 h-4" />}
          value={fmt(a.optedOutTotal)}
          sub={
            <>
              {a.optedOutNew > 0 ? <span className="text-orange-600 font-semibold">{fmt(a.optedOutNew)} new</span> : "None new"}
              <span> · {fmt(a.optedOutGlobal)} global</span>
            </>
          }
        />
        {capOn && (
          <KpiCard
            title="Frequency-capped"
            icon={<Gauge className="w-4 h-4" />}
            value={fmt(a.frequencyCappedNow ?? 0)}
            sub={`One campaign per ${a.frequencyCapDays} day${a.frequencyCapDays === 1 ? "" : "s"}, right now`}
          />
        )}
      </div>
      {!capOn && (
        <p className="text-[12.5px] text-gray-400 mt-3 flex items-start gap-1.5">
          <Gauge className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>
            No frequency limit — a patient can receive every campaign. Set one in{" "}
            {canOpenSettings ? (
              <Link href="/settings?tab=campaign-safety" className="text-brand-fg hover:underline underline-offset-2">
                Settings → Campaign safety
              </Link>
            ) : (
              "Settings → Campaign safety"
            )}
            .
          </span>
        </p>
      )}

      <div className="mt-5">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
          <ListChecks className="w-3.5 h-3.5" /> Audience performance
          <InfoTip label="How audiences are grouped">
            The campaigns started in the period, grouped by who they were sent to: a segment, one contact list, several lists together
            (&ldquo;Lists: A + B&rdquo;), or contacts picked one by one. Replied and opt-outs are shares of sent, counted as in the funnel.
            Campaigns created before lists were recorded show as &ldquo;Picked contacts&rdquo;.
          </InfoTip>
        </p>
        <p className="text-[12px] text-gray-400 mt-0.5 mb-2">Which lists and segments respond best</p>
        {a.performance.length === 0 ? (
          <Empty>No campaign started in this period.</Empty>
        ) : (
          <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
            <table className="w-full text-[13px] min-w-[720px]">
              <thead>
                <tr className="text-[11px] text-gray-400 uppercase tracking-wide border-b border-gray-100">
                  <th className="pb-3 px-2 font-semibold text-left">Audience</th>
                  <th className="pb-3 px-2 font-semibold text-right">Campaigns</th>
                  <th className="pb-3 px-2 font-semibold text-right">Sent</th>
                  <th className="pb-3 px-2 font-semibold text-right">Replied</th>
                  <th className="pb-3 px-2 font-semibold text-right">Opt-outs</th>
                  <th className="pb-3 px-2 font-semibold text-right whitespace-nowrap">Failed / skipped</th>
                  <th className="pb-3 px-2 font-semibold text-left whitespace-nowrap">Last sent</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {a.performance.map((g) => {
                  const href = !canOpenLists
                    ? null
                    : g.kind === "SEGMENT" && g.segmentId
                      ? `/customers/segments/${g.segmentId}`
                      : g.kind === "LIST" && g.listIds.length === 1
                        ? `/customers/lists/${g.listIds[0]}`
                        : null;
                  return (
                    <tr key={g.key} className="align-top">
                      <td className="py-2.5 px-2 max-w-[320px]">
                        {href ? (
                          <Link href={href} className="font-medium text-gray-900 hover:text-brand-fg hover:underline underline-offset-2 break-words">
                            {g.label}
                          </Link>
                        ) : (
                          <span className={`font-medium break-words ${g.kind === "MANUAL" ? "text-gray-600" : "text-gray-900"}`}>{g.label}</span>
                        )}
                      </td>
                      <td className="py-2.5 px-2 text-right tabular-nums text-gray-700">{fmt(g.campaigns)}</td>
                      <td className="py-2.5 px-2 text-right tabular-nums">
                        <span className="font-semibold text-gray-900">{fmt(g.sent)}</span>
                        {g.recipients !== g.sent && <span className="text-gray-400"> / {fmt(g.recipients)}</span>}
                      </td>
                      <RateCell n={g.replied} pct={g.repliedPct} />
                      <RateCell n={g.optOuts} pct={g.optOutPct} warn={g.optOuts > 0} />
                      <td className="py-2.5 px-2 text-right tabular-nums text-gray-700">{fmt(g.failedSkipped)}</td>
                      <td className="py-2.5 px-2 text-gray-500 whitespace-nowrap">{g.lastSentAt ? shortDate(g.lastSentAt) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Section>
  );
}

// ── 6. Line health ───────────────────────────────────────────────────────

const QUALITY: Record<string, { label: string; dot: string; text: string }> = {
  GREEN: { label: "High", dot: "bg-green-500", text: "text-green-700" },
  YELLOW: { label: "Medium", dot: "bg-yellow-400", text: "text-yellow-700" },
  RED: { label: "Low", dot: "bg-red-500", text: "text-red-700" },
};

const TIER_LABEL: Record<string, string> = {
  TIER_50: "50",
  TIER_250: "250",
  TIER_1K: "1,000",
  TIER_2K: "2,000",
  TIER_10K: "10,000",
  TIER_100K: "100,000",
  TIER_UNLIMITED: "Unlimited",
};

export function LineHealthSection({ lines }: { lines: MarketingLineHealth[] }) {
  return (
    <Section
      title="Line health"
      icon={ShieldCheck}
      sub="As of now"
      info={
        <>
          Quality and status as of the last check with Meta (every 30 minutes). Messaging limit = how many different people the line may
          start conversations with in 24 hours; used = people this line sent a template to in the last 24 hours, from the CRM&apos;s own
          records. Templates belong to the line&apos;s WhatsApp account.
        </>
      }
    >
      {lines.length === 0 ? (
        <Empty>No active WhatsApp line.</Empty>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {lines.map((l) => {
            const q = l.qualityRating ? QUALITY[l.qualityRating] : undefined;
            const statusBad = l.metaStatus && l.metaStatus !== "CONNECTED";
            const used = l.usedPct ?? 0;
            const t = l.templates;
            return (
              <div key={l.id} className="rounded-xl border border-gray-100 bg-canvas p-4 min-w-0">
                <p className="font-semibold text-[13.5px] text-gray-900 truncate">{l.label}</p>
                <p className="text-[12px] text-gray-400">{l.displayPhoneNumber ?? "—"}</p>
                <div className="flex items-center gap-3 mt-3 flex-wrap text-[12.5px]">
                  <span className={`inline-flex items-center gap-1.5 font-semibold ${q?.text ?? "text-gray-500"}`}>
                    <span className={`w-2 h-2 rounded-full ${q?.dot ?? "bg-gray-300"}`} />
                    Quality: {q?.label ?? "Unknown"}
                  </span>
                  {l.metaStatus && (
                    <span className={statusBad ? "text-red-600 font-semibold" : "text-gray-500"}>
                      {l.metaStatus.charAt(0) + l.metaStatus.slice(1).toLowerCase()}
                    </span>
                  )}
                </div>
                <div className="mt-3">
                  <div className="flex items-baseline justify-between text-[12px]">
                    <span className="text-gray-500">Used, last 24 h</span>
                    <span className="tabular-nums">
                      <span className="font-semibold text-gray-900">{fmt(l.usedLast24h)}</span>
                      <span className="text-gray-400">
                        {" "}
                        / {l.unlimited ? "Unlimited" : l.messagingLimit ? fmt(l.messagingLimit) : l.messagingTier ? TIER_LABEL[l.messagingTier] ?? l.messagingTier : "limit unknown"}
                      </span>
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden mt-1">
                    <div
                      className={`h-full rounded-full ${used >= 90 ? "bg-red-500" : used >= 70 ? "bg-orange-500" : "bg-brand"}`}
                      style={{ width: `${Math.min(100, used)}%` }}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap mt-3 text-[11.5px]">
                  {t.pending + t.rejected + t.paused === 0 ? (
                    <span className="text-gray-400">No template waiting, paused or recently rejected</span>
                  ) : (
                    <>
                      {t.pending > 0 && <span className="px-2 py-0.5 rounded-full font-semibold bg-amber-50 text-amber-700">{t.pending} waiting at Meta</span>}
                      {t.paused > 0 && <span className="px-2 py-0.5 rounded-full font-semibold bg-orange-50 text-orange-600">{t.paused} paused</span>}
                      {t.rejected > 0 && <span className="px-2 py-0.5 rounded-full font-semibold bg-red-50 text-red-700">{t.rejected} rejected</span>}
                    </>
                  )}
                </div>
                {l.qualityCheckedAt && <p className="text-[11px] text-gray-400 mt-2">Checked {dateTime(l.qualityCheckedAt)}</p>}
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}
