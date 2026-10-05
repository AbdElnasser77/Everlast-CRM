"use client";

import { Lock } from "lucide-react";
import TemplateForm from "@/components/templates/TemplateForm";
import { useCurrentUser } from "@/components/CurrentUserProvider";
import { PageSpinner } from "@/components/ui/spinner";

export default function NewTemplatePage() {
  // Access comes from the server's permission list, never from the role
  // name: see CurrentUserProvider. `ready` is false until /users/me answers.
  const { ready, can } = useCurrentUser();
  const allowed = can("template:write");

  if (!ready) return <PageSpinner />;

  if (!allowed) {
    return (
      <div className="flex flex-col items-center justify-center min-h-full gap-3">
        <Lock className="w-10 h-10 text-gray-300" />
        <h1 className="text-lg font-semibold text-gray-500">Admin access only</h1>
      </div>
    );
  }

  return <TemplateForm />;
}
