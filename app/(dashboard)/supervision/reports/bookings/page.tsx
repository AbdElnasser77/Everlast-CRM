"use client";

import { CalendarCheck, FileSpreadsheet } from "lucide-react";
import { apiGetBookingsReport } from "@/lib/api";
import type { BookingsReport } from "@/types";
import { requestPreferred, requestService, requestedPairs } from "@/lib/bookingRequests";
import { formatPhone, notBookedReasonLabel } from "@/components/supervision/format";
import { BookingsDocument, requestSourceText } from "@/components/supervision/report/BookingsDocument";
import { ReportGate, ReportShell, useGeneratedBy, useLineLabel, useReportData, useReportPeriod } from "@/components/supervision/report/ReportShell";
import { downloadCsv } from "@/components/supervision/report/exportFiles";
import {
  CLINIC_TZ,
  OPENED_VIA_LABEL,
  SOURCE_STATUS_LABEL,
  isoLocal,
  leadSourceReportLabel,
  periodLabel,
  reportFileName,
  requestStatusLabel,
} from "@/components/supervision/report/reportFormat";

const REPORT = "Bookings";

/** One row per request, its appointments joined into one cell. */
function requestsCsv(report: BookingsReport, from: string, to: string) {
  const tz = report.period.timezone || CLINIC_TZ;
  const header = [
    "Request ID", "Opened", "Patient", "Phone", "Line", "Opened via", "Service asked for", "Preferred date / time", "All answers", "Request note",
    "Lead source", "Source certainty", "Campaign", "Suggested campaign", "Status", "Taken by", "Taken at", "Handled by", "Handled at",
    "Minutes to pick up", "Minutes to close", "Couldn't-book reason", "Couldn't-book note", "Appointments booked", "Appointments cancelled", "Appointments",
  ];
  const rows = report.requests.map((r) => {
    const req = { requested: r.requested ?? {} };
    return [
      r.id,
      isoLocal(r.createdAt, tz),
      r.customer.name ?? "",
      formatPhone(r.customer.phone),
      r.line ?? "",
      OPENED_VIA_LABEL[r.openedVia] ?? r.openedVia,
      requestService(req) ?? "",
      requestPreferred(req) ?? "",
      requestedPairs(r.requested).map((p) => `${p.label}: ${p.value}`).join("; "),
      r.note ?? "",
      requestSourceText(r).main,
      r.sourceStatus ? SOURCE_STATUS_LABEL[r.sourceStatus] ?? r.sourceStatus : "",
      r.campaign ?? "",
      r.suggestedCampaign ?? "",
      requestStatusLabel(r.status),
      r.claimedBy ?? "",
      isoLocal(r.claimedAt, tz),
      r.handledBy ?? "",
      isoLocal(r.handledAt, tz),
      r.minutesToPickUp,
      r.minutesToClose,
      r.status === "NOT_BOOKED" ? notBookedReasonLabel(r.notBookedReason) : "",
      r.notBookedNote ?? "",
      r.appointmentsBooked,
      r.appointmentsCancelled,
      r.appointments
        .map((a) =>
          [a.service || "Service not recorded", isoLocal(a.appointmentAt, tz), a.doctor, a.dok32Ref ? `Dok32 ${a.dok32Ref}` : null, a.status === "CANCELLED" ? "CANCELLED" : null]
            .filter(Boolean)
            .join(" · "),
        )
        .join(" | "),
    ];
  });
  downloadCsv(reportFileName(REPORT, from, to), header, rows);
}

/** One row per appointment. */
function appointmentsCsv(report: BookingsReport, from: string, to: string) {
  const tz = report.period.timezone || CLINIC_TZ;
  const header = [
    "Request ID", "Patient", "Phone", "Line", "Service", "Appointment", "Doctor", "Dok32 ref", "Status", "Booked by", "Booked at", "Appointment note",
    "Lead source", "Campaign", "Request opened", "Request handled by",
  ];
  const rows = report.requests.flatMap((r) =>
    r.appointments.map((a) => [
      r.id,
      r.customer.name ?? "",
      formatPhone(r.customer.phone),
      r.line ?? "",
      a.service ?? "",
      isoLocal(a.appointmentAt, tz),
      a.doctor ?? "",
      a.dok32Ref ?? "",
      a.status === "CANCELLED" ? "Cancelled" : "Booked",
      a.bookedBy ?? "",
      isoLocal(a.bookedAt, tz),
      a.note ?? "",
      r.leadSource ? leadSourceReportLabel(r.leadSource) : requestSourceText(r).main,
      r.campaign ?? "",
      isoLocal(r.createdAt, tz),
      r.handledBy ?? "",
    ]),
  );
  downloadCsv(reportFileName(`${REPORT} appointments`, from, to), header, rows);
}

function BookingsScreen() {
  const period = useReportPeriod();
  const { data, error, retry } = useReportData(period, apiGetBookingsReport);
  const lineLabel = useLineLabel(period.numberId);
  const generatedBy = useGeneratedBy();
  const { from, to } = period;
  const label = data ? periodLabel(data.period.fromDay, data.period.toDay) : period.label;
  const appointments = data ? data.requests.reduce((a, r) => a + r.appointments.length, 0) : 0;

  return (
    <ReportShell
      title="Bookings & couldn’t book"
      description="Every booking request in the period — what was asked, where the patient came from, who took it, how fast, what was booked or why not."
      icon={CalendarCheck}
      period={period}
      data={data}
      error={error}
      onRetry={retry}
      pdfName={reportFileName(REPORT, from, to)}
      footer={`Everlast Wellness — Bookings & couldn’t book · ${label}`}
      landscape
      downloads={[
        {
          label: "Requests CSV",
          icon: FileSpreadsheet,
          title: "One row per request, appointments joined — opens in Excel",
          onClick: () => (data ? requestsCsv(data, from, to) : undefined),
          disabled: !data || data.requests.length === 0,
        },
        {
          label: "Appointments CSV",
          icon: FileSpreadsheet,
          title: "One row per appointment — opens in Excel",
          onClick: () => (data ? appointmentsCsv(data, from, to) : undefined),
          disabled: appointments === 0,
        },
      ]}
    >
      {data && <BookingsDocument report={data} lineLabel={lineLabel} generatedBy={generatedBy} />}
    </ReportShell>
  );
}

export default function BookingsReportPage() {
  return (
    <ReportGate>
      <BookingsScreen />
    </ReportGate>
  );
}
