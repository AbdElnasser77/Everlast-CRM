import type { AiOutcome, KnowledgeArticle, KnowledgeSectionKey, KnowledgeSections, KnowledgeStatus } from "@/types";

// The article's sections, in the order the editor shows them. Same keys and
// labels as the server's chunks (utils/knowledge.js), so "Sources used" in the
// test panel reads the same as the form.
export const KNOWLEDGE_SECTIONS: { key: KnowledgeSectionKey; label: string; hint: string }[] = [
  { key: "summary", label: "Overview", hint: "What it is, what it's for, how long it takes." },
  { key: "before", label: "Before the treatment", hint: "Preparation, what to avoid beforehand." },
  { key: "after", label: "After the treatment (aftercare)", hint: "Aftercare instructions, what to avoid afterwards." },
  { key: "downtime", label: "Downtime / recovery", hint: "What to expect and for how long." },
  { key: "notSuitableFor", label: "Not suitable for", hint: "Who shouldn't have it (the assistant hands these patients to the team)." },
  { key: "faq", label: "FAQ", hint: "Common questions with their approved answers. Prices only if the clinic wants them quoted." },
  { key: "other", label: "Other information", hint: "Anything else the assistant may say." },
];

export const emptySections = (): KnowledgeSections => ({
  summary: "", before: "", after: "", downtime: "", notSuitableFor: "", faq: "", other: "",
});

export const KNOWLEDGE_STATUS_LABEL: Record<KnowledgeStatus, string> = {
  DRAFT: "Draft",
  APPROVED: "Approved",
  ARCHIVED: "Archived",
};

export const KNOWLEDGE_STATUS_PILL: Record<KnowledgeStatus, string> = {
  DRAFT: "bg-amber-50 text-amber-700 border-amber-200",
  APPROVED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  ARCHIVED: "bg-gray-100 text-gray-500 border-gray-200",
};

/** Whether the assistant can use the article right now, in words. */
export function indexingState(a: Pick<KnowledgeArticle, "status" | "searchable">, aiConfigured: boolean): { label: string; tone: "ok" | "warn" | "off" } {
  if (a.status !== "APPROVED") return { label: "Not used by the assistant", tone: "off" };
  if (a.searchable) return { label: "Searchable", tone: "ok" };
  if (!aiConfigured) return { label: "Not searchable yet — AI not configured", tone: "warn" };
  return { label: "Not searchable yet — indexing failed, save again to retry", tone: "warn" };
}

export const AI_OUTCOME_LABEL: Record<AiOutcome, string> = {
  ANSWERED: "Answered",
  HANDED_OFF: "Would hand over",
  URGENT: "Urgent",
  ERROR: "Error",
};

// Why the assistant handed a chat over — the model's reason, a safety check,
// or a red-flag word. Shared by the test panel and the hand-off alert.
const REASON_LABEL: Record<string, string> = {
  booking: "Wants to book",
  not_covered: "Question not covered",
  patient_request: "Asked for a person",
  complaint: "Complaint",
  medical: "Medical question",
  other: "Needs the team",
  red_flag: "Possible medical concern",
  guard_empty: "No usable answer",
  guard_too_long: "Answer too long",
  guard_dose: "Answer held back (dose)",
  guard_price: "Answer held back (price)",
  tool_rounds: "Couldn't settle on an answer",
};

export const aiReasonLabel = (reason: string | null | undefined): string | null =>
  reason ? REASON_LABEL[reason] ?? reason.replace(/_/g, " ") : null;
