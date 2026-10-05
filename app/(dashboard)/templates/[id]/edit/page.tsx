"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Lock, AlertCircle, ArrowLeft } from "lucide-react";
import { apiGetTemplates } from "@/lib/api";
import TemplateForm from "@/components/templates/TemplateForm";
import type { Template } from "@/types";
import { useCurrentUser } from "@/components/CurrentUserProvider";
import { PageSpinner } from "@/components/ui/spinner";

export default function EditTemplatePage() {
  const params = useParams();
  const router = useRouter();
  // Set when arriving from a rejected submit: which field to point at, and why.
  const searchParams = useSearchParams();
  const fixField = searchParams.get("fix");
  const fixReason = searchParams.get("reason");
  // Access comes from the server's permission list, never from the role
  // name: see CurrentUserProvider. `ready` is false until /users/me answers.
  const { ready, can } = useCurrentUser();
  const allowed = can("template:write");
  const [template, setTemplate] = useState<Template | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!allowed) return;
    apiGetTemplates()
      .then((res) => {
        const found = res.data.find((t) => String(t.id) === params.id);
        if (!found) {
          setError("Template not found.");
          return;
        }
        if (found.approvalStatus === "SUBMITTED" || found.approvalStatus === "APPROVED") {
          setError(`This template is ${found.approvalStatus.toLowerCase()} and can't be edited.`);
          return;
        }
        setTemplate(found);
      })
      .catch(() => setError("Failed to load template."))
      .finally(() => setLoading(false));
  }, [allowed, ready, params.id]);

  if (!ready) return <PageSpinner />;

  if (!allowed) {
    return (
      <div className="flex flex-col items-center justify-center min-h-full gap-3">
        <Lock className="w-10 h-10 text-gray-300" />
        <h1 className="text-lg font-semibold text-gray-500">Admin access only</h1>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <svg className="w-6 h-6 animate-spin text-[#3B694C]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
      </div>
    );
  }

  if (error || !template) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
        <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center">
          <AlertCircle className="w-5 h-5 text-red-500" />
        </div>
        <p className="text-[14px] font-semibold text-gray-700">{error || "Template not found."}</p>
        <button
          type="button"
          onClick={() => router.push("/templates")}
          className="flex items-center gap-1.5 text-[13px] font-semibold text-[#3B694C] hover:underline cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Templates
        </button>
      </div>
    );
  }

  return <TemplateForm template={template} fix={fixReason ? { field: fixField, reason: fixReason } : null} />;
}
