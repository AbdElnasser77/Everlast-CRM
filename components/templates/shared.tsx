import { Type, Image as ImageIcon, Video, FileText, Ban, Link2, Phone, MessageSquareText, PlayCircle } from "lucide-react";
import type { TemplateButton, TemplateButtonType, TemplateHeaderType } from "@/types";

// Shared between the Templates list page (card grid preview) and the
// Create/Edit Template page (form + live preview) so the two never drift.

export const LIMITS = { name: 512, header: 60, body: 800, footer: 60, button: 25 };

// Kept in sync with the backend's RESOLVERS in utils/templateVars.js — these
// are the only placeholders the send pipeline can actually resolve.
export const PERSONALIZE_VARS: { key: string; label: string }[] = [
  { key: "customer_name", label: "Customer name" },
  { key: "first_name", label: "First name" },
  { key: "agent_name", label: "Agent name" },
];

export const HEADER_TYPE_OPTIONS: { value: TemplateHeaderType; label: string; icon: typeof Type }[] = [
  { value: "NONE", label: "None", icon: Ban },
  { value: "TEXT", label: "Text", icon: Type },
  { value: "IMAGE", label: "Image", icon: ImageIcon },
  { value: "VIDEO", label: "Video", icon: Video },
  { value: "DOCUMENT", label: "Document", icon: FileText },
];

export const BUTTON_TYPE_META: Record<TemplateButtonType, { label: string; icon: typeof Link2 | null }> = {
  QUICK_REPLY: { label: "Quick Reply", icon: MessageSquareText },
  URL: { label: "URL", icon: Link2 },
  PHONE_NUMBER: { label: "Call Number", icon: Phone },
};

export const OPT_OUT_TEXT = "Reply STOP to opt out";
export const PLACEHOLDER_RE = /\{\{\s*[a-z0-9_]+\s*\}\}/gi;

export function renderPreview(text: string): string {
  let out = text;
  PERSONALIZE_VARS.forEach(({ key }) => {
    out = out.replace(new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "gi"), key === "agent_name" ? "Agent" : "Customer");
  });
  return out;
}

export function CharCount({ val, max }: { val: string; max: number }) {
  const over = val.length > max;
  return (
    <span className={`text-[11px] tabular-nums ${over ? "text-red-500 font-semibold" : "text-gray-400"}`}>
      {val.length}/{max}
    </span>
  );
}

// Renders a template's header inside a WhatsApp-style bubble — text, image,
// video, or document — shared by the card grid and the live preview.
export function HeaderPreview({
  headerType,
  header,
  headerMediaUrl,
}: {
  headerType: TemplateHeaderType;
  header: string | null;
  headerMediaUrl: string | null;
}) {
  if (headerType === "TEXT" && header?.trim()) {
    return <p className="text-[13px] font-bold text-white mb-1.5 leading-snug">{renderPreview(header)}</p>;
  }
  if (headerType === "IMAGE" && headerMediaUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={headerMediaUrl}
        alt=""
        className="w-full max-h-40 object-cover rounded-lg mb-1.5 bg-black/10"
        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
      />
    );
  }
  if (headerType === "VIDEO" && headerMediaUrl) {
    return (
      <div className="flex items-center gap-2 bg-black/20 rounded-lg px-2.5 py-3 mb-1.5">
        <PlayCircle className="w-5 h-5 text-white shrink-0" />
        <span className="text-[11px] text-white/80 truncate">Video attachment</span>
      </div>
    );
  }
  if (headerType === "DOCUMENT" && headerMediaUrl) {
    return (
      <div className="flex items-center gap-2 bg-black/20 rounded-lg px-2.5 py-3 mb-1.5">
        <FileText className="w-5 h-5 text-white shrink-0" />
        <span className="text-[11px] text-white/80 truncate">{headerMediaUrl.split("/").pop() || "Document"}</span>
      </div>
    );
  }
  return null;
}

export function ButtonRow({ btn }: { btn: TemplateButton }) {
  const meta = BUTTON_TYPE_META[btn.type] ?? BUTTON_TYPE_META.QUICK_REPLY;
  const Icon = meta.icon;
  return (
    <div className="flex items-center justify-center gap-1.5 py-2 rounded-xl border border-gray-200 bg-white text-[12px] font-medium text-[#3B694C]">
      {Icon && <Icon className="w-3.5 h-3.5" />}
      {btn.title}
    </div>
  );
}

