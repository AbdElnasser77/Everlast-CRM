"use client";

// A page under the dashboard crashed: show the error in the content area so
// the sidebar, number switcher and every other page stay usable.
import { ErrorPanel } from "@/components/ErrorPanel";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorPanel error={error} reset={reset} />;
}
