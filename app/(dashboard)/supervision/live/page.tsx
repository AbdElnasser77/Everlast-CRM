"use client";

import { Suspense } from "react";
import Link from "next/link";
import { homePathFor } from "@/lib/permissions";
import { useCurrentUser } from "@/components/CurrentUserProvider";
import { PageSpinner } from "@/components/ui/spinner";
import { LiveWall } from "@/components/supervision/live/LiveWall";

// ── Supervision · Live ──────────────────────────────────────────────────────
// The full-screen "wall" a supervisor leaves on a TV. Same gate as Supervision.

export default function SupervisionLivePage() {
  const { ready, can, me } = useCurrentUser();
  if (!ready) return <PageSpinner />;
  if (!can("team:supervise")) {
    return (
      <div className="flex-1 overflow-y-auto bg-canvas px-6">
        <div className="max-w-md mx-auto mt-16 bg-white rounded-xl border border-gray-200 shadow-sm p-12 text-center">
          <h2 className="text-[17px] font-bold text-gray-700 mb-2">Access Restricted</h2>
          <p className="text-[13px] text-gray-400">The live view is for supervisors and admins. Ask an admin if you need it.</p>
          <Link
            href={homePathFor(me)}
            className="mt-6 inline-flex items-center gap-2 bg-brand hover:bg-[#2f5840] text-white text-[13px] font-semibold px-5 py-2.5 rounded-xl transition-colors"
          >
            Go back
          </Link>
        </div>
      </div>
    );
  }
  // useSearchParams (line filter in the URL) needs a Suspense boundary.
  return (
    <Suspense fallback={<PageSpinner />}>
      <LiveWall />
    </Suspense>
  );
}
