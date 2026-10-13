// The Chats report as an Excel workbook. exceljs is large, so it's loaded with
// a dynamic import only when someone clicks "Download Excel" — it never ships
// in the page's first load or the server bundle.

import type { ChatsReport } from "@/types";
import { formatPhone, notBookedReasonLabel } from "../format";
import { downloadBlob } from "./exportFiles";
import {
  CHAT_STATUS_ORDER,
  CLINIC_TZ,
  OUTCOME_ORDER,
  chatStatusLabel,
  leadSourceReportLabel,
  orderedEntries,
  outcomeOrNone,
  periodLabel,
  requestStatusLabel,
  wallClockDate,
} from "./reportFormat";

type Kind = "text" | "int" | "date" | "minutes";
type Col = { header: string; key: string; width: number; kind: Kind };

const COLUMNS: Col[] = [
  { header: "Chat ID", key: "id", width: 9, kind: "int" },
  { header: "Patient", key: "patient", width: 24, kind: "text" },
  { header: "Phone", key: "phone", width: 17, kind: "text" },
  { header: "Tags", key: "tags", width: 20, kind: "text" },
  { header: "Opted out", key: "optedOut", width: 10, kind: "text" },
  { header: "Line", key: "line", width: 18, kind: "text" },
  { header: "Assigned to", key: "assignedTo", width: 18, kind: "text" },
  { header: "Replied by", key: "repliedBy", width: 24, kind: "text" },
  { header: "Status", key: "status", width: 11, kind: "text" },
  { header: "Outcome", key: "outcome", width: 15, kind: "text" },
  { header: "Outcome by", key: "outcomeBy", width: 18, kind: "text" },
  { header: "Follow up at", key: "followUpAt", width: 17, kind: "date" },
  { header: "First message", key: "firstMessageAt", width: 17, kind: "date" },
  { header: "Last message", key: "lastMessageAt", width: 17, kind: "date" },
  { header: "Patient messages", key: "patientMessages", width: 10, kind: "int" },
  { header: "Staff messages", key: "staffMessages", width: 10, kind: "int" },
  { header: "Bot messages", key: "botMessages", width: 10, kind: "int" },
  { header: "Campaign messages", key: "campaignMessages", width: 11, kind: "int" },
  { header: "First responses", key: "firstResponses", width: 10, kind: "int" },
  { header: "Avg response (min)", key: "avgResponseMinutes", width: 11, kind: "minutes" },
  { header: "Longest wait (min)", key: "longestWaitMinutes", width: 11, kind: "minutes" },
  { header: "Late responses", key: "lateResponses", width: 10, kind: "int" },
  { header: "Unanswered", key: "unanswered", width: 11, kind: "text" },
  { header: "Booking request", key: "bookingRequest", width: 26, kind: "text" },
  { header: "Couldn't-book reason", key: "notBookedReason", width: 20, kind: "text" },
  { header: "Lead source", key: "leadSource", width: 18, kind: "text" },
  { header: "Campaign", key: "campaign", width: 24, kind: "text" },
  { header: "Appointments", key: "appointments", width: 12, kind: "int" },
  { header: "Notes", key: "notes", width: 8, kind: "int" },
];

const HEADER_FILL = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFEEF4F0" } };

export async function downloadChatsXlsx(report: ChatsReport, fileName: string, lineLabel: string) {
  const mod = await import("exceljs");
  // exceljs is CommonJS: the classes sit on the default export or the namespace depending on the bundler.
  const ExcelJS = (mod as unknown as { default?: typeof mod }).default ?? mod;
  const tz = report.period.timezone || CLINIC_TZ;

  const wb = new ExcelJS.Workbook();
  wb.creator = "Everlast CRM";
  wb.created = new Date();

  // ── Chats ──
  const ws = wb.addWorksheet("Chats", { views: [{ state: "frozen", ySplit: 1, xSplit: 2 }] });
  ws.columns = COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));

  for (const c of report.chats) {
    ws.addRow({
      id: c.id,
      patient: c.patient ?? "",
      phone: formatPhone(c.phone),
      tags: c.tags.join(", "),
      optedOut: c.optedOut ? "Yes" : "No",
      line: c.line ?? "",
      assignedTo: c.assignedTo ?? "",
      repliedBy: c.repliedBy.join(", "),
      status: chatStatusLabel(c.status),
      outcome: c.outcome ? outcomeOrNone(c.outcome) : "",
      outcomeBy: c.outcomeBy ?? "",
      followUpAt: wallClockDate(c.followUpAt, tz),
      firstMessageAt: wallClockDate(c.firstMessageAt, tz),
      lastMessageAt: wallClockDate(c.lastMessageAt, tz),
      patientMessages: c.patientMessages,
      staffMessages: c.staffMessages,
      botMessages: c.botMessages,
      campaignMessages: c.campaignMessages,
      firstResponses: c.firstResponses,
      avgResponseMinutes: c.avgResponseMinutes,
      longestWaitMinutes: c.longestWaitMinutes,
      lateResponses: c.lateResponses,
      unanswered: c.unanswered ? "Yes" : "No",
      bookingRequest: c.bookingRequest ? requestStatusLabel(c.bookingRequest) : "",
      notBookedReason: c.bookingRequest === "NOT_BOOKED" ? notBookedReasonLabel(c.notBookedReason) : "",
      leadSource: c.leadSource ? leadSourceReportLabel(c.leadSource) : "",
      campaign: c.campaign ?? "",
      appointments: c.appointments,
      notes: c.notes,
    });
  }

  COLUMNS.forEach((col, i) => {
    const column = ws.getColumn(i + 1);
    if (col.kind === "date") column.numFmt = "dd mmm yyyy hh:mm";
    else if (col.kind === "int" || col.kind === "minutes") column.numFmt = "0";
    if (col.kind !== "text") column.alignment = { horizontal: "right" };
  });
  const header = ws.getRow(1);
  header.font = { bold: true };
  header.fill = HEADER_FILL;
  header.alignment = { vertical: "middle", wrapText: true };
  header.height = 30;
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLUMNS.length } };

  // ── Summary ──
  const sum = wb.addWorksheet("Summary");
  sum.columns = [
    { header: "", key: "a", width: 34 },
    { header: "", key: "b", width: 14 },
  ];
  const s = report.summary;
  const title = sum.getRow(1);
  title.values = ["Everlast Wellness — Chats report"];
  title.font = { bold: true, size: 14 };
  const facts: [string, string | number][] = [
    ["Period", periodLabel(report.period.fromDay, report.period.toDay)],
    ["WhatsApp line", lineLabel],
    ["Time zone (all times)", tz],
    ["Response target (minutes)", report.slaMinutes],
    ["Chats", s.chats],
    ["Unanswered", s.unanswered],
    ["With late responses", s.withLateResponses],
  ];
  if (report.truncated) facts.push(["Note", `Only the first ${report.chats.length} chats are listed`]);
  let r = 3;
  for (const [k, v] of facts) {
    sum.getRow(r).values = [k, v];
    sum.getCell(r, 1).font = { bold: true };
    r++;
  }
  const block = (heading: string, rows: [string, number][]) => {
    r++;
    const h = sum.getRow(r);
    h.values = [heading, "Chats"];
    h.font = { bold: true };
    h.fill = HEADER_FILL;
    r++;
    for (const [k, v] of rows) {
      sum.getRow(r).values = [k, v];
      r++;
    }
  };
  block("By outcome", orderedEntries(s.byOutcome, OUTCOME_ORDER, { last: ["NONE"] }).map(([k, v]) => [outcomeOrNone(k), v]));
  block("By status (now)", orderedEntries(s.byStatus, CHAT_STATUS_ORDER).map(([k, v]) => [chatStatusLabel(k), v]));
  block("By line", orderedEntries(s.byLine, [], { last: ["—"] }).map(([k, v]) => [k === "—" ? "Unknown line" : k, v]));

  const buf = await wb.xlsx.writeBuffer();
  downloadBlob(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${fileName}.xlsx`);
}
