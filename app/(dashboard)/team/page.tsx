"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { PageSpinner } from "@/components/ui/spinner";

// Team & access moved into Settings → Users (components/settings/UsersPanel).
// Kept as a redirect so bookmarks and old links still land somewhere useful.
export default function TeamPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/settings?tab=users");
  }, [router]);

  return <PageSpinner label="Opening Settings" />;
}
