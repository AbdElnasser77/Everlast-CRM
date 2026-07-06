"use client";

import { ListChecks } from "lucide-react";

export default function ContactListsPage() {
  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100 gap-4 flex-wrap">
        <div>
          <h1 className="text-[22px] font-bold text-gray-900 tracking-tight">Lists</h1>
          <p className="text-[13px] text-gray-400 mt-0.5">Group contacts into saved lists for targeted campaigns</p>
        </div>
      </div>

      {/* Empty / work-in-progress state */}
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <div className="w-14 h-14 rounded-2xl bg-[#EEF6F1] flex items-center justify-center mx-auto mb-4">
            <ListChecks className="w-6 h-6 text-[#3B694C]" />
          </div>
          <h2 className="text-[16px] font-semibold text-gray-800">Lists are coming soon</h2>
          <p className="text-[13.5px] text-gray-400 mt-1.5 leading-relaxed">
            We&apos;re building the ability to save custom contact segments so you can reuse them across campaigns.
            Check back soon.
          </p>
        </div>
      </div>
    </div>
  );
}
