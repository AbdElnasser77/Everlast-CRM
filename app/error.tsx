"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface for observability; the user sees a friendly message instead.
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-5 bg-[#f5f4f0] px-6 text-center">
      <div className="w-14 h-14 rounded-2xl bg-white flex items-center justify-center shadow-sm text-2xl">
        ⚠️
      </div>
      <div className="space-y-1.5">
        <h1 className="text-[18px] font-bold text-gray-900">Something went wrong</h1>
        <p className="text-[13px] text-gray-500 max-w-sm">
          An unexpected error occurred. Try again — if it keeps happening, ping{" "}
          <span className="font-semibold text-gray-600">#ops-help</span>.
        </p>
      </div>
      <button
        onClick={reset}
        className="px-5 py-2.5 rounded-xl text-[13px] font-semibold text-white bg-[#3B694C] hover:bg-[#2f5540] transition-colors cursor-pointer"
      >
        Try again
      </button>
    </div>
  );
}
