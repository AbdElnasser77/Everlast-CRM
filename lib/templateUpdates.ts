// "Approved/rejected since your last visit" bookkeeping for templates. The
// last visit to /templates is kept per browser; a template counts as new news
// when Meta decided on it (statusChangedAt) after that.

import type { Template } from "@/types";

const SEEN_KEY = "templates-seen-at";
export const TEMPLATES_SEEN_EVENT = "templates-seen";

export function getTemplatesSeenAt(): string {
  try {
    const v = localStorage.getItem(SEEN_KEY);
    if (v) return v;
    // First run in this browser: start from now, so years of old approvals
    // don't all show up as new.
    const now = new Date().toISOString();
    localStorage.setItem(SEEN_KEY, now);
    return now;
  } catch {
    return new Date().toISOString();
  }
}

export function markTemplatesSeen() {
  try {
    localStorage.setItem(SEEN_KEY, new Date().toISOString());
  } catch { /* private mode */ }
  window.dispatchEvent(new Event(TEMPLATES_SEEN_EVENT));
}

export function decidedSince(templates: Template[], since: string): Template[] {
  return templates.filter(
    (t) =>
      !!t.statusChangedAt &&
      t.statusChangedAt > since &&
      (t.approvalStatus === "APPROVED" || t.approvalStatus === "REJECTED"),
  );
}
