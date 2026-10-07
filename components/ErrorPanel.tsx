"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ChevronDown, Copy, RotateCcw } from "lucide-react";

// An error shown INSIDE the CRM — the sidebar and the rest of the page stay
// usable — with what actually went wrong, instead of a blank full-screen page.
// Used by the error boundaries of the dashboard and the chat area.
export function ErrorPanel({
  error,
  reset,
  title = "This page hit a problem",
  compact = false,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  title?: string;
  compact?: boolean;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    console.error(error);
  }, [error]);

  const details = [
    `${error.name}: ${error.message}`,
    error.digest ? `Digest: ${error.digest}` : "",
    typeof window !== "undefined" ? `Page: ${window.location.pathname}` : "",
    `Time: ${new Date().toISOString()}`,
    "",
    error.stack || "",
  ].filter((l, i) => l || i === 4).join("\n");

  return (
    <div className={`flex flex-1 items-center justify-center bg-[#f9f9f8] px-6 ${compact ? "py-10" : "min-h-full py-16"}`}>
      <div className="w-full max-w-lg bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-start gap-3">
          <span className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-bold text-gray-900">{title}</h2>
            <p className="text-[13px] text-gray-500 mt-0.5">
              The rest of the CRM still works. Try again — if it keeps happening, send the details below to whoever maintains the CRM.
            </p>
            <p className="mt-3 text-[13px] font-mono text-red-600 bg-red-50 rounded-lg px-3 py-2 break-words">
              {error.message || error.name || "Unknown error"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-5">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-white bg-[#3B694C] hover:bg-[#2f5840] rounded-xl px-4 py-2"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Try again
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="text-[13px] font-medium text-gray-600 border border-gray-200 hover:bg-gray-50 rounded-xl px-4 py-2"
          >
            Reload page
          </button>
          <button
            type="button"
            onClick={() => setShowDetails((v) => !v)}
            className="ml-auto inline-flex items-center gap-1 text-[12px] text-gray-500 hover:text-gray-800"
          >
            Details <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showDetails ? "rotate-180" : ""}`} />
          </button>
        </div>

        {showDetails && (
          <div className="mt-3">
            <pre className="max-h-64 overflow-auto text-[11px] leading-relaxed bg-gray-50 border border-gray-100 rounded-lg p-3 text-gray-700 whitespace-pre-wrap break-words">
              {details}
            </pre>
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(details).then(() => setCopied(true)).catch(() => {})}
              className="mt-2 inline-flex items-center gap-1 text-[12px] text-[#3B694C] hover:underline"
            >
              <Copy className="w-3.5 h-3.5" /> {copied ? "Copied" : "Copy details"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
