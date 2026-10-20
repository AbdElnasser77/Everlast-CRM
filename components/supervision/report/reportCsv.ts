import type { CampaignsReport, TeamReport } from "@/types";
import { downloadCsv } from "./exportFiles";
import { BAND_LABEL, BAND_ORDER, CLINIC_TZ, OUTCOME_LABEL, OUTCOME_ORDER, ROLE_LABEL, campaignCategoryLabel, campaignStatusLabel, isoLocal } from "./reportFormat";

// ── CSV downloads for the Team and Campaigns reports ─────────────────────────
// One row per person / per campaign — the table you'd filter and sort in Excel.

/** One row per person. */
export function teamCsv(report: TeamReport, fileName: string) {
  const header = [
    "Name", "Username", "Role", "Active account", "Days active", "Chats handled", "Replies", "First responses",
    "Avg response (min)", "Median response (min)", "90% replied within (min)", `Within ${report.slaMinutes} min %`, "Late replies",
    ...BAND_ORDER.map((k) => `Replies ${BAND_LABEL[k]}`),
    ...OUTCOME_ORDER.map((k) => OUTCOME_LABEL[k]),
    "Notes written", "Open chats now",
  ];
  const rows = report.agents.map((a) => [
    a.name ?? a.username,
    a.username,
    ROLE_LABEL[a.role] ?? a.role,
    a.isActive ? "Yes" : "No",
    a.activeDays,
    a.chatsHandled,
    a.replies,
    a.firstResponses,
    a.avgResponseMinutes,
    a.medianResponseMinutes,
    a.p90ResponseMinutes,
    a.withinSlaPercent,
    a.lateResponses,
    ...BAND_ORDER.map((k) => a.responseBands[k] ?? 0),
    ...OUTCOME_ORDER.map((k) => a.outcomes[k] ?? 0),
    a.notesWritten,
    a.openChatsNow,
  ]);
  downloadCsv(fileName, header, rows);
}

/** One row per campaign. Rates are % of sent. */
export function campaignsCsv(report: CampaignsReport, fileName: string) {
  const tz = report.period.timezone || CLINIC_TZ;
  const header = [
    "Campaign ID", "Campaign", "Line", "Template", "Category", "Status", "Created by", "Approved by", "Started", "Completed",
    "Recipients", "Sent", "Failed", "Skipped", "Delivered", "Read", "Replied",
    "Delivered %", "Read %", "Replied %",
    "Opt-outs", "Opt-out %",
  ];
  const rows = report.campaigns.map((c) => [
    c.id,
    c.name,
    c.line ?? "",
    c.template ?? "",
    c.category ? campaignCategoryLabel(c.category) : "",
    campaignStatusLabel(c.status),
    c.createdBy ?? "",
    c.approvedBy ?? "",
    isoLocal(c.startedAt, tz),
    isoLocal(c.completedAt, tz),
    c.recipients,
    c.sent,
    c.failed,
    c.skipped,
    c.delivered,
    c.read,
    c.replied,
    c.rates.delivered,
    c.rates.read,
    c.rates.replied,
    c.optOuts,
    c.rates.optOut,
  ]);
  downloadCsv(fileName, header, rows);
}
