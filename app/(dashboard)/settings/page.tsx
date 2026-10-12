"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCurrentUser } from "@/components/CurrentUserProvider";
import { PageSpinner } from "@/components/ui/spinner";
import { UsersPanel } from "@/components/settings/UsersPanel";
import { WhatsAppNumbersPanel } from "@/components/settings/WhatsAppNumbersPanel";
import { QuietHoursPanel } from "@/components/settings/QuietHoursPanel";
import { CampaignSafetyPanel } from "@/components/settings/CampaignSafetyPanel";
import { MyAccountPanel } from "@/components/settings/MyAccountPanel";

// The tab lives in the URL (?tab=) so a link — or the old /team page — can
// open a specific one, and a reload stays where you were.
const TABS = [
  { key: "users", label: "Users" },
  { key: "numbers", label: "WhatsApp numbers" },
  { key: "quiet-hours", label: "Quiet hours" },
  { key: "campaign-safety", label: "Campaign safety" },
  { key: "account", label: "My account" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function isTabKey(v: string | null): v is TabKey {
  return TABS.some((t) => t.key === v);
}

function PageHeader() {
  return (
    <div className="px-6 pt-6 pb-4 border-b border-gray-100 shrink-0">
      <h1 className="text-[22px] font-bold text-gray-900 tracking-tight">
        Settings
      </h1>
      <p className="text-[13px] text-gray-400 mt-0.5">
        Manage your workspace settings
      </p>
    </div>
  );
}

function SettingsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const raw = searchParams.get("tab");
  const tab: TabKey = isTabKey(raw) ? raw : "users";

  function selectTab(key: TabKey) {
    router.replace(`/settings?tab=${key}`, { scroll: false });
  }

  return (
    <div className="flex flex-col h-full bg-white font-[family-name:var(--font-geist-sans)]">
      <PageHeader />

      {/* Tabs */}
      <div className="flex items-center gap-1 px-6 border-b border-gray-100 shrink-0 overflow-x-auto">
        {TABS.map((t) => {
          const active = t.key === tab;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => selectTab(t.key)}
              className={`relative px-3 py-3 text-[13px] font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                active ? "text-[#3B694C]" : "text-gray-500 hover:text-gray-800"
              }`}
            >
              {t.label}
              {active && <span className="absolute left-2 right-2 -bottom-px h-0.5 rounded-full bg-[#3B694C]" />}
            </button>
          );
        })}
      </div>

      {/* Active tab — keyed so switching always starts it fresh */}
      <div className="flex-1 min-h-0 flex flex-col overflow-auto bg-[#f9f9f8] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-200 [&::-webkit-scrollbar-thumb]:rounded-full">
        {tab === "users" && <UsersPanel key="users" />}
        {tab === "numbers" && <WhatsAppNumbersPanel key="numbers" />}
        {tab === "quiet-hours" && <QuietHoursPanel key="quiet-hours" />}
        {tab === "campaign-safety" && <CampaignSafetyPanel key="campaign-safety" />}
        {tab === "account" && <MyAccountPanel key="account" />}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  // Access comes from the server's permission list, never from the role
  // name: see CurrentUserProvider. `ready` is false until /users/me answers.
  const { ready, can } = useCurrentUser();
  const allowed = can("settings:write");

  if (!ready) return <PageSpinner />;
  if (!allowed) {
    return (
      <div className="min-h-full bg-white font-[family-name:var(--font-geist-sans)]">
        <PageHeader />

        {/* Access denied card */}
        <div className="max-w-md mx-auto mt-16 bg-white rounded-xl border border-gray-200 shadow-sm p-12 text-center">
          {/* Lock icon */}
          <svg
            className="w-12 h-12 text-gray-300 mx-auto mb-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>

          <h2 className="text-[17px] font-bold text-gray-700 mb-2">
            Access Restricted
          </h2>
          <p className="text-[13px] text-gray-400">
            You need admin privileges to view this page.
          </p>

          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="mt-6 inline-flex items-center gap-2 bg-[#3B694C] hover:bg-[#2f5840] active:bg-[#264a33] text-white text-[13px] font-semibold px-5 py-2.5 rounded-xl transition-colors cursor-pointer"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // useSearchParams needs a Suspense boundary in the app router.
  return (
    <Suspense fallback={<PageSpinner />}>
      <SettingsContent />
    </Suspense>
  );
}
