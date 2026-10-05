import { PageSpinner } from "@/components/ui/spinner";

// Shown while a dashboard page is loading after a navigation. It renders inside
// the dashboard layout, so the sidebar and top bar stay visible and clickable —
// only the page area shows the spinner. Without this, clicking a nav item left
// the previous page on screen with no sign anything was happening (in dev mode,
// for the several seconds Next spends compiling the route).
export default function Loading() {
  return <PageSpinner />;
}
