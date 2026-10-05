// Meta's messaging-limit tiers: the cap on how many UNIQUE recipients a number
// may start business-initiated conversations with in a rolling 24 hours.
//
// Shared by the Number Health ladder and the campaign builder's pre-flight
// check so the two can never disagree about what a tier means.

export interface MessagingTier {
  key: string;
  /** null = unlimited */
  cap: number | null;
  label: string;
}

// Order matters — this is the ladder's left-to-right rendering order.
// Confirm exact enum strings against a live /status response; some accounts
// report TIER_2K instead of TIER_1K for the second rung.
export const TIERS: MessagingTier[] = [
  { key: "TIER_250", cap: 250, label: "250" },
  { key: "TIER_1K", cap: 1000, label: "1,000" },
  { key: "TIER_2K", cap: 2000, label: "2,000" },
  { key: "TIER_10K", cap: 10000, label: "10,000" },
  { key: "TIER_100K", cap: 100000, label: "100,000" },
  { key: "TIER_UNLIMITED", cap: null, label: "Unlimited" },
];

/**
 * Recipient cap for a tier string. Returns undefined when the tier is unknown
 * or absent (test numbers, and new numbers that haven't sent yet) — the caller
 * must treat that as "can't tell", never as zero.
 */
export function tierCap(tier: string | null | undefined): number | null | undefined {
  if (!tier) return undefined;
  const match = TIERS.find((t) => t.key === tier);
  return match ? match.cap : undefined;
}

export type TierVerdict =
  | { level: "unknown" }
  | { level: "unlimited" }
  | { level: "ok"; cap: number; used: number }
  | { level: "near"; cap: number; used: number }
  | { level: "over"; cap: number; used: number };

/**
 * Compare a campaign's recipient count against the number's 24h tier.
 *
 * Important caveat the UI must pass on: the tier counts EVERY unique recipient
 * messaged in the last 24 hours, not just this campaign. We can't see what has
 * already been consumed, so this is a floor on the risk, not a precise budget.
 */
export function assessTier(
  tier: string | null | undefined,
  recipientCount: number
): TierVerdict {
  const cap = tierCap(tier);
  if (cap === undefined) return { level: "unknown" };
  if (cap === null) return { level: "unlimited" };
  if (recipientCount > cap) return { level: "over", cap, used: recipientCount };
  if (recipientCount > cap * 0.8) return { level: "near", cap, used: recipientCount };
  return { level: "ok", cap, used: recipientCount };
}
