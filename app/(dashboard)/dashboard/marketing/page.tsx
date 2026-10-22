"use client";

import { Suspense } from "react";
import { useCurrentUser } from "@/components/CurrentUserProvider";
import { PageSpinner } from "@/components/ui/spinner";
import { NoAccess } from "@/components/NoAccess";
import { MarketingDashboard } from "@/components/marketing/MarketingDashboard";

// MARKETING's Dashboard, and the Marketing tab of an admin's. Supervisors and
// agents don't hold stats:marketing.
export default function MarketingDashboardPage() {
  const { ready, can } = useCurrentUser();
  if (!ready) return <PageSpinner />;
  if (!can("stats:marketing")) return <NoAccess what="the Marketing dashboard" />;
  // Suspense boundary for useSearchParams (period and line live in the URL).
  return (
    <Suspense fallback={<PageSpinner />}>
      <MarketingDashboard />
    </Suspense>
  );
}
