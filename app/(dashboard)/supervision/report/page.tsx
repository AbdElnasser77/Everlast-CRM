import { redirect } from "next/navigation";

// The old single report moved to /supervision/reports/overview (one of several
// reports now). Old bookmarks keep working: period and line carry over.
export default async function OldSupervisorReportPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string") q.set(k, v);
    else if (Array.isArray(v) && v[0] !== undefined) q.set(k, v[0]);
  }
  const qs = q.toString();
  redirect(`/supervision/reports/overview${qs ? `?${qs}` : ""}`);
}
