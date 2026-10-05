import type { CampaignCategory } from "@/types";

// A campaign's business purpose — not the template's category, which is the
// message type Meta bills on. Order here is the order the pickers show.
export const CAMPAIGN_CATEGORIES: { value: CampaignCategory; label: string }[] = [
  { value: "PROMOTION", label: "Promotion" },
  { value: "SEASONAL", label: "Seasonal" },
  { value: "EVENT", label: "Event" },
  { value: "AWARENESS", label: "Health Awareness" },
  { value: "FOLLOW_UP", label: "Follow-up" },
  { value: "ANNOUNCEMENT", label: "Announcement" },
  { value: "OTHER", label: "Other" },
];

export const CAMPAIGN_CATEGORY_LABELS = Object.fromEntries(
  CAMPAIGN_CATEGORIES.map((c) => [c.value, c.label]),
) as Record<CampaignCategory, string>;

export const CAMPAIGN_CATEGORY_COLORS: Record<CampaignCategory, string> = {
  PROMOTION: "bg-purple-50 text-purple-600",
  SEASONAL: "bg-amber-50 text-amber-600",
  EVENT: "bg-sky-50 text-sky-600",
  AWARENESS: "bg-emerald-50 text-emerald-600",
  FOLLOW_UP: "bg-rose-50 text-rose-600",
  ANNOUNCEMENT: "bg-indigo-50 text-indigo-600",
  OTHER: "bg-gray-100 text-gray-500",
};
