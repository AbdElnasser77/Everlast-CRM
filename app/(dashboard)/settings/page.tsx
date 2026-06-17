"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@/types";

export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem("user");
    if (raw) {
      try {
        setUser(JSON.parse(raw));
      } catch {}
    }
    setReady(true);
  }, []);

  if (!ready) return null;

  // Non-admin: show access denied
  if (user?.role !== "ADMIN") {
    return (
      <div className="min-h-full bg-white font-[family-name:var(--font-geist-sans)]">
        {/* Page header */}
        <div className="px-6 pt-6 pb-4 border-b border-gray-100">
          <h1 className="text-[22px] font-bold text-gray-900 tracking-tight">
            Settings
          </h1>
          <p className="text-[13px] text-gray-400 mt-0.5">
            Manage your workspace settings
          </p>
        </div>

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

  // Admin: show work-in-progress placeholder
  return (
    <div className="min-h-full bg-white font-[family-name:var(--font-geist-sans)]">
      {/* Page header */}
      <div className="px-6 pt-6 pb-4 border-b border-gray-100">
        <h1 className="text-[22px] font-bold text-gray-900 tracking-tight">
          Settings
        </h1>
        <p className="text-[13px] text-gray-400 mt-0.5">
          Manage your workspace settings
        </p>
      </div>

      {/* Work-in-progress card */}
      <div className="max-w-md mx-auto mt-16 bg-white rounded-xl border border-gray-200 shadow-sm p-12 text-center">
        {/* Wrench / settings gear icon */}
        <svg
          className="w-12 h-12 text-gray-300 mx-auto mb-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
        </svg>

        <h2 className="text-[17px] font-bold text-gray-700 mb-2">
          Work in progress
        </h2>
        <p className="text-[13px] text-gray-400">
          This section is under development. Check back soon.
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
