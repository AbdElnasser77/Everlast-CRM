"use client";

import { useState, useEffect } from "react";
import { Lock } from "lucide-react";
import TemplateForm from "@/components/templates/TemplateForm";

export default function NewTemplatePage() {
  const [user, setUser] = useState<{ role: string } | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("user");
      setUser(raw ? JSON.parse(raw) : null);
    } catch {
      setUser(null);
    }
  }, []);

  if (!user) return null;

  if (user.role !== "ADMIN") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-3">
        <Lock className="w-10 h-10 text-gray-300" />
        <h1 className="text-lg font-semibold text-gray-500">Admin access only</h1>
      </div>
    );
  }

  return <TemplateForm />;
}
