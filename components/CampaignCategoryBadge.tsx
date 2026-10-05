import type { CampaignCategory } from "@/types";
import { CAMPAIGN_CATEGORY_COLORS, CAMPAIGN_CATEGORY_LABELS } from "@/lib/campaignCategories";

export default function CampaignCategoryBadge({ category }: { category?: CampaignCategory | null }) {
  if (!category) return null;
  return (
    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${CAMPAIGN_CATEGORY_COLORS[category] ?? CAMPAIGN_CATEGORY_COLORS.OTHER}`}>
      {CAMPAIGN_CATEGORY_LABELS[category] ?? category}
    </span>
  );
}
