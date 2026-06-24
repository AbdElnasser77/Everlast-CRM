"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useEffect, useLayoutEffect, useRef, startTransition, lazy, Suspense } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  MoreHorizontal,
  Paperclip,
  Send,
  Smile,
  Download,
  X,
  LayoutTemplate,
  Clock,
  CornerUpLeft,
  ChevronDown,
} from "lucide-react";
import {
  useMessages,
  emitTypingStart,
  emitTypingStop,
} from "@/hooks/useMessages";
import { useConversationsContext } from "@/components/ConversationsContext";
import {
  apiSendMessage,
  apiUploadMedia,
  apiGetUser,
  apiGetTemplates,
  apiSendTemplate,
} from "@/lib/api";
import type { Message, QuotedMessage, Template } from "@/types";
import {
  MediaPlayer,
  MediaPlayerAudio,
  MediaPlayerVideo,
  MediaPlayerControls,
  MediaPlayerControlsOverlay,
  MediaPlayerPlay,
  MediaPlayerSeek,
  MediaPlayerTime,
  MediaPlayerVolume,
  MediaPlayerFullscreen,
  MediaPlayerLoading,
  MediaPlayerDownload,
  useMediaPlayer,
} from "@/components/ui/media-player";
import {
  useMediaDispatch,
  MediaActionTypes,
} from "media-chrome/react/media-store";

const EmojiPicker = lazy(() =>
  import("@emoji-mart/react").then((m) => ({ default: m.default }))
);

function isWindowClosed(lastCustomerMessageAt: string | null | undefined): boolean {
  if (!lastCustomerMessageAt) return false;
  return Date.now() - new Date(lastCustomerMessageAt).getTime() > 24 * 60 * 60 * 1000;
}

function parseTemplateContent(content: string): {
  header?: string;
  body: string;
  footer?: string;
  buttons?: { id: string; title: string }[];
} | null {
  try {
    const p = JSON.parse(content);
    if (p && typeof p === "object" && typeof p.body === "string") return p;
  } catch {}
  return null;
}

function formatMessageTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function SendingDots() {
  return (
    <span className="flex gap-[3px] items-center h-4 px-1">
      <span className="w-1.5 h-1.5 rounded-full bg-white/60 animate-bounce [animation-delay:-0.3s]" />
      <span className="w-1.5 h-1.5 rounded-full bg-white/60 animate-bounce [animation-delay:-0.15s]" />
      <span className="w-1.5 h-1.5 rounded-full bg-white/60 animate-bounce" />
    </span>
  );
}

function MessageStatus({
  isSending,
  status,
}: {
  isSending: boolean;
  status: Message["status"];
}) {
  if (isSending) return <SendingDots />;
  if (status === null) return <SendingDots />;
  if (status === "PENDING")
    return <span className="text-[11px] text-gray-300">✓</span>;
  if (status === "SENT")
    return <span className="text-[11px] text-white/60">✓</span>;
  if (status === "DELIVERED")
    return <span className="text-[11px] text-white/60">✓✓</span>;
  if (status === "READ")
    return <span className="text-[11px] text-[#60C4FF]">✓✓</span>;
  if (status === "FAILED")
    return <span className="text-[11px] text-red-300">✕</span>;
  return <span className="text-[11px] text-white/80">✓</span>;
}

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`relative w-9 h-5 rounded-full transition-colors shrink-0 cursor-pointer focus:outline-none ${
        on ? "bg-[#3B694C]" : "bg-gray-200"
      }`}
    >
      <div
        className={`absolute top-[3px] w-[14px] h-[14px] rounded-full bg-white shadow-sm transition-all duration-200 ${
          on ? "left-[19px]" : "left-[3px]"
        }`}
      />
    </button>
  );
}

const AGENT_COLORS = [
  "#6366F1",
  "#8B5CF6",
  "#EC4899",
  "#F59E0B",
  "#0EA5E9",
  "#10B981",
];

function agentColor(sid: string): string {
  const n = parseInt(sid, 10) || 0;
  return AGENT_COLORS[n % AGENT_COLORS.length];
}

function getAgentAvatar(
  senderId: string | number | null,
  currentUser: { id: string | number; username: string } | null,
  assignedAgent: { id: number; username: string } | null,
  cache: Record<string, string>,
): { initials: string; color: string; name: string } {
  const inits = (name: string) =>
    name
      .split(" ")
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "A";

  // Optimistic (senderId not yet set) — attribute to current user
  if (senderId == null) {
    if (currentUser)
      return {
        initials: inits(currentUser.username),
        color: "#3B694C",
        name: currentUser.username,
      };
    return { initials: "A", color: "#3B694C", name: "You" };
  }

  const sid = String(senderId);

  if (currentUser && String(currentUser.id) === sid)
    return {
      initials: inits(currentUser.username),
      color: "#3B694C",
      name: currentUser.username,
    };

  if (assignedAgent && String(assignedAgent.id) === sid)
    return {
      initials: inits(assignedAgent.username),
      color: agentColor(sid),
      name: assignedAgent.username,
    };

  if (cache[sid])
    return {
      initials: inits(cache[sid]),
      color: agentColor(sid),
      name: cache[sid],
    };

  return { initials: "A", color: agentColor(sid), name: `Agent ${sid}` };
}


/* ── media src hook ──
   directSrc: Cloudinary URL → use immediately (agent-sent, or customer after media_ready)
   fetchUrl:  proxy URL     → fetch with credentials + blob URL (customer fallback) */
function useMediaSrc(directSrc: string | null, fetchUrl: string | null) {
  const [src, setSrc] = useState<string | null>(directSrc);
  const [loading, setLoading] = useState(!directSrc);

  // When directSrc arrives late (media_ready socket event), update src immediately
  useEffect(() => {
    if (!directSrc) return;
    setSrc(directSrc);
    setLoading(false);
  }, [directSrc]);

  useEffect(() => {
    if (directSrc || !fetchUrl) return;
    let objectUrl: string | null = null;
    fetch(fetchUrl, { credentials: "include" })
      .then((r) => (r.ok ? r.blob() : Promise.reject()))
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [directSrc, fetchUrl]);

  return { src, loading };
}

function ImageLightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors cursor-pointer"
      >
        <X className="w-5 h-5" />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt="Image"
        className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg select-none cursor-pointer"
        onClick={(e) => e.stopPropagation()}
      />
    </div>,
    document.body
  );
}

function ImageMessage({ directSrc, fetchUrl }: { directSrc: string | null; fetchUrl: string | null }) {
  const { src, loading } = useMediaSrc(directSrc, fetchUrl);
  const [open, setOpen] = useState(false);

  if (loading) return <div className="w-[220px] h-[160px] bg-gray-200/60 animate-pulse rounded-xl" />;
  if (!src) return <span className="text-[12px] text-gray-400">Failed to load image</span>;
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt="Image"
        className="max-w-full max-h-[260px] w-auto h-auto rounded-xl block cursor-pointer"
        onClick={() => setOpen(true)}
      />
      {open && <ImageLightbox src={src} onClose={() => setOpen(false)} />}
    </>
  );
}

const SPEEDS = [1, 1.25, 1.5, 1.75, 2, 0.5, 0.75];

function SpeedCycleButton() {
  const dispatch = useMediaDispatch();
  const rate = useMediaPlayer((state) => (state as { mediaPlaybackRate?: number }).mediaPlaybackRate ?? 1);
  function cycle() {
    const idx = SPEEDS.indexOf(rate);
    const next = SPEEDS[(idx + 1) % SPEEDS.length];
    dispatch({ type: MediaActionTypes.MEDIA_PLAYBACK_RATE_REQUEST, detail: next });
  }
  return (
    <button
      type="button"
      onClick={cycle}
      className="text-[11px] font-bold w-8 h-8 rounded-md flex items-center justify-center hover:bg-accent text-primary transition-colors shrink-0 tabular-nums cursor-pointer"
    >
      {rate === 1 ? "1×" : `${rate}×`}
    </button>
  );
}

function AudioMessage({ directSrc, fetchUrl }: { directSrc: string | null; fetchUrl: string | null }) {
  const { src, loading } = useMediaSrc(directSrc, fetchUrl);
  if (loading) return <div className="w-[260px] h-12 bg-gray-200/60 animate-pulse rounded-lg" />;
  if (!src) return <span className="text-[12px] text-gray-400">Failed to load audio</span>;
  return (
    <MediaPlayer
      autoHide={false}
      className="w-[400px] h-auto rounded-xl"
      style={{
        "--background":          "0 0% 100%",
        "--foreground":          "142 28% 25%",
        "--primary":             "142 28% 32%",
        "--primary-foreground":  "0 0% 100%",
        "--accent":              "142 30% 92%",
        "--accent-foreground":   "142 28% 25%",
        "--muted":               "142 30% 92%",
        "--muted-foreground":    "142 20% 45%",
        "--border":              "142 20% 85%",
        "--ring":                "142 28% 32%",
        "--popover":             "0 0% 100%",
        "--popover-foreground":  "142 28% 25%",
      } as React.CSSProperties}
    >
      <MediaPlayerAudio src={src} />
      <div className="flex items-center gap-2 px-3 py-3">
        <MediaPlayerPlay className="size-9 shrink-0 cursor-pointer" />
        <MediaPlayerSeek className="flex-1" />
        <MediaPlayerTime className="text-[12px] tabular-nums" />
        <MediaPlayerVolume expandable />
        <SpeedCycleButton />
      </div>
    </MediaPlayer>
  );
}

function VideoMessage({ src }: { src: string | null }) {
  if (!src) {
    return (
      <div className="w-[260px] h-[148px] bg-gray-900 rounded-lg flex flex-col items-center justify-center gap-2 text-gray-400">
        <svg className="w-8 h-8 opacity-40" viewBox="0 0 24 24" fill="currentColor"><path d="M17 10.5V7a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h12a1 1 0 001-1v-3.5l4 4v-11l-4 4z"/></svg>
        <span className="text-[12px]">Video processing…</span>
      </div>
    );
  }
  return (
    <MediaPlayer className="video-player w-[400px] aspect-video rounded-xl overflow-hidden">
      <MediaPlayerVideo src={src} className="size-full object-contain" />
      <MediaPlayerControlsOverlay />
      <MediaPlayerControls>
        <MediaPlayerPlay className="size-9 shrink-0" />
        <MediaPlayerVolume expandable />
        <MediaPlayerSeek className="flex-1" />
        <MediaPlayerTime className="text-[12px] tabular-nums" />
        <MediaPlayerDownload className="size-8 shrink-0" />
        <MediaPlayerFullscreen className="size-9 shrink-0" />
      </MediaPlayerControls>
      <MediaPlayerLoading />
    </MediaPlayer>
  );
}

function DocumentMessage({ directSrc, fetchUrl, isAgent }: { directSrc: string | null; fetchUrl: string | null; isAgent: boolean }) {
  async function handleDownload() {
    let downloadUrl = directSrc;
    if (!downloadUrl && fetchUrl) {
      try {
        const res = await fetch(fetchUrl, { credentials: "include" });
        if (!res.ok) throw new Error();
        const blob = await res.blob();
        downloadUrl = URL.createObjectURL(blob);
      } catch { return; }
    }
    if (!downloadUrl) return;
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = "document";
    a.click();
    if (!directSrc) URL.revokeObjectURL(downloadUrl);
  }

  return (
    <button type="button" onClick={handleDownload}
      className={`flex items-center gap-2 text-[13px] font-medium underline underline-offset-2 cursor-pointer ${
        isAgent ? "text-white/90 hover:text-white" : "text-[#3B694C] hover:text-[#2d5239]"
      }`}
    >
      <Download className="w-4 h-4 shrink-0" />
      Download document
    </button>
  );
}

function MessageContent({ msg, isAgent }: { msg: Message; isAgent: boolean }) {
  // Agent media:    URL lives in content (mediaUrl is always null for agent-sent)
  // Customer media: URL lives in mediaUrl (Cloudinary, set after background upload)
  //                 Never fall back to the proxy — WhatsApp media URLs expire in minutes
  //                 so the proxy returns 502 for any message older than ~5 min.
  const resolvedUrl = msg.mediaUrl ?? null;
  const directSrc = resolvedUrl ?? (isAgent ? (msg.content || null) : null);
  const fetchUrl  = null; // proxy disabled — old WhatsApp URLs always 502

  if (msg.messageType === "IMAGE") return <ImageMessage directSrc={directSrc} fetchUrl={fetchUrl} />;
  // VIDEO: never proxy-fetch (large file — stalls/fails as blob). Use Cloudinary URL
  // directly; show placeholder until media_ready fires if not yet available.
  if (msg.messageType === "VIDEO") return <VideoMessage src={directSrc} />;
  if (msg.messageType === "AUDIO") return <AudioMessage directSrc={directSrc} fetchUrl={fetchUrl} />;
  if (msg.messageType === "DOCUMENT") return <DocumentMessage directSrc={directSrc} fetchUrl={fetchUrl} isAgent={isAgent} />;
  if (msg.messageType === "STICKER") {
    if (!directSrc) return <p className="text-[13px] text-gray-400 italic">Sticker (loading…)</p>;
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={directSrc} alt="sticker" className="w-40 h-40 object-contain" />
    );
  }

  return (
    <p className={`text-[14px] leading-relaxed whitespace-pre-wrap break-words ${isAgent ? "text-white" : "text-gray-800"}`}>
      {msg.content}
    </p>
  );
}

function MediaPreviewPanel({
  files,
  onSend,
  onClose,
  onAddMore,
  onRemove,
}: {
  files: File[];
  onSend: (files: File[], captions: string[]) => void;
  onClose: () => void;
  onAddMore: (f: File[]) => void;
  onRemove: (index: number) => void;
}) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [captions, setCaptions] = useState<string[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const addMoreRef = useRef<HTMLInputElement>(null);

  // Keep captions array in sync with files length
  useEffect(() => {
    startTransition(() => {
      setCaptions((prev) => files.map((_, i) => prev[i] ?? ""));
    });
  }, [files.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    startTransition(() => {
      setPreviews(urls);
      setActiveIdx((i) => Math.min(i, files.length - 1));
    });
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);

  const activeFile = files[activeIdx];
  const activeSrc  = previews[activeIdx];
  const isImg = activeFile?.type.startsWith("image/");
  const isVid = activeFile?.type.startsWith("video/");
  const isAud = activeFile?.type.startsWith("audio/");

  function removeFile(e: React.MouseEvent, i: number) {
    e.stopPropagation();
    onRemove(i);
  }

  return (
    <div className="relative z-20 flex-1 flex flex-col bg-[#f0f2f5] overflow-hidden">
      {/* Top bar */}
      <div className="shrink-0 flex items-center justify-between px-4 py-3 bg-white border-b border-gray-100">
        <button
          type="button"
          onClick={onClose}
          className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
        <span className="text-[13px] font-medium text-gray-500 truncate max-w-[60%] text-center">
          {activeFile?.name ?? "Preview"}
        </span>
        <div className="w-8" />
      </div>

      {/* Preview */}
      <div className="flex-1 flex items-center justify-center p-8 min-h-0">
        {activeSrc && isImg && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={activeSrc} alt="Preview" className="max-w-full max-h-full object-contain rounded-xl select-none shadow-sm" />
        )}
        {activeSrc && isVid && (
          <video src={activeSrc} controls className="max-w-full max-h-full rounded-xl shadow-sm" />
        )}
        {activeSrc && isAud && (
          <div className="flex flex-col items-center gap-4">
            <div className="w-20 h-20 rounded-full bg-gray-200 flex items-center justify-center">
              <svg className="w-8 h-8 text-gray-400" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3a9 9 0 110 18A9 9 0 0112 3zm0 2a7 7 0 100 14A7 7 0 0012 5zm0 3a1 1 0 011 1v4.586l2.707 2.707a1 1 0 01-1.414 1.414l-3-3A1 1 0 0111 14V9a1 1 0 011-1z"/></svg>
            </div>
            <audio src={activeSrc} controls className="w-64" />
          </div>
        )}
        {!isImg && !isVid && !isAud && activeFile && (
          <div className="flex flex-col items-center gap-3">
            <div className="w-24 h-24 rounded-2xl bg-white border border-gray-200 shadow-sm flex items-center justify-center">
              <Download className="w-10 h-10 text-gray-400" />
            </div>
            <p className="text-[13px] text-gray-500 max-w-[220px] text-center break-all">{activeFile.name}</p>
          </div>
        )}
      </div>

      {/* Caption + Send */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-3 bg-white border-t border-gray-100">
        <div className="flex-1 bg-gray-100 rounded-full px-4 py-2.5">
          <input
            type="text"
            value={captions[activeIdx] ?? ""}
            onChange={(e) =>
              setCaptions((prev) => {
                const next = [...prev];
                next[activeIdx] = e.target.value;
                return next;
              })
            }
            placeholder="Type a message…"
            className="w-full bg-transparent text-[14px] text-gray-700 placeholder:text-gray-400 outline-none"
            onKeyDown={(e) => { if (e.key === "Enter") onSend(files, captions); }}
          />
        </div>
        <button
          type="button"
          onClick={() => onSend(files, captions)}
          className="h-11 px-4 rounded-full bg-[#3B694C] hover:bg-[#2f5840] flex items-center gap-2 text-white transition-colors cursor-pointer shrink-0"
        >
          <Send className="w-[18px] h-[18px]" />
          {files.length > 1 && (
            <span className="bg-white/25 text-white text-[11px] font-bold rounded-full min-w-[20px] h-5 px-1 flex items-center justify-center">
              {files.length}
            </span>
          )}
        </button>
      </div>

      {/* File strip */}
      <div className="shrink-0 flex items-center gap-2 px-4 py-3 bg-gray-50 border-t border-gray-100 overflow-x-auto">
        {files.map((f, i) => {
          const src = previews[i];
          return (
            <div key={i} className="relative shrink-0">
              <button
                type="button"
                onClick={() => setActiveIdx(i)}
                className={`w-14 h-14 rounded-lg overflow-hidden border-2 transition-all cursor-pointer block ${i === activeIdx ? "border-[#3B694C] scale-105" : "border-gray-200 opacity-60 hover:opacity-90"}`}
              >
                {f.type.startsWith("image/") && src ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={src} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-gray-100 flex items-center justify-center">
                    <Download className="w-5 h-5 text-gray-400" />
                  </div>
                )}
              </button>
              {/* Remove button */}
              <button
                type="button"
                onClick={(e) => removeFile(e, i)}
                className="absolute -top-1.5 -right-1.5 w-[18px] h-[18px] rounded-full bg-gray-600 hover:bg-red-500 text-white flex items-center justify-center transition-colors cursor-pointer z-10"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          );
        })}

        {/* Add more */}
        <input
          ref={addMoreRef}
          type="file"
          multiple
          className="hidden"
          accept="image/*,video/mp4,video/3gpp,audio/*,.pdf,.doc,.docx,.xls,.xlsx"
          onChange={(e) => {
            const added = Array.from(e.target.files ?? []);
            if (added.length) onAddMore(added);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => addMoreRef.current?.click()}
          className="shrink-0 w-14 h-14 rounded-lg border-2 border-dashed border-gray-300 hover:border-[#3B694C] flex items-center justify-center text-gray-400 hover:text-[#3B694C] transition-colors cursor-pointer"
        >
          <svg className="w-5 h-5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M8 2v12M2 8h12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TemplatePickerModal
// ---------------------------------------------------------------------------

function TemplatePickerModal({
  conversationId,
  category,
  customerName,
  agentName,
  onClose,
  onSent,
}: {
  conversationId: string;
  category: "GENERAL" | "RE_ENGAGEMENT";
  customerName: string;
  agentName: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loadingTpls, setLoadingTpls] = useState(true);
  const [selected, setSelected] = useState<Template | null>(null);
  const [search, setSearch] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGetTemplates({ category, status: "APPROVED" })
      .then((res) => setTemplates(res.data))
      .catch(() => {})
      .finally(() => setLoadingTpls(false));
  }, [category]);

  function previewBody(body: string) {
    return body
      .replace(/\{\{customer_name\}\}/g, customerName || "Customer")
      .replace(/\{\{agent_name\}\}/g, agentName || "Agent");
  }

  const filtered = templates.filter(
    (t) =>
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.body.toLowerCase().includes(search.toLowerCase())
  );

  async function handleSend() {
    if (!selected) return;
    setSending(true);
    setError(null);
    try {
      await apiSendTemplate(conversationId, selected.id);
      onSent();
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to send template";
      if (msg.toLowerCase().includes("window")) {
        setError("The 24-hour window is still open. Use the normal message input.");
      } else if (msg.toLowerCase().includes("approved")) {
        setError("This template is pending Meta approval.");
      } else {
        setError(msg);
      }
    } finally {
      setSending(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col" style={{ height: "80vh" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="text-[16px] font-bold text-gray-900">
              {category === "RE_ENGAGEMENT" ? "Re-engagement Templates" : "Insert Template"}
            </h2>
            <p className="text-[12px] text-gray-400 mt-0.5">Only approved templates are shown</p>
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-400 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* List panel */}
          <div className="w-64 shrink-0 border-r border-gray-100 flex flex-col">
            <div className="px-3 py-3 border-b border-gray-100">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search templates…"
                className="w-full text-[13px] text-gray-600 placeholder:text-gray-400 outline-none bg-gray-50 border border-gray-200 rounded-xl px-3 py-2"
              />
            </div>
            <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-200 [&::-webkit-scrollbar-thumb]:rounded-full">
              {loadingTpls ? (
                <div className="flex items-center justify-center h-20">
                  <span className="text-[13px] text-gray-400">Loading…</span>
                </div>
              ) : filtered.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <p className="text-[13px] text-gray-400">
                    {templates.length === 0
                      ? category === "RE_ENGAGEMENT"
                        ? "No approved re-engagement templates. Ask your admin to create and submit one."
                        : "No approved templates available."
                      : "No templates match your search."}
                  </p>
                </div>
              ) : (
                filtered.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => { setSelected(tpl); setError(null); }}
                    className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors cursor-pointer ${
                      selected?.id === tpl.id ? "bg-[#EEF6F1] border-l-2 border-l-[#3B694C]" : ""
                    }`}
                  >
                    <p className="text-[13px] font-medium text-gray-900 truncate">{tpl.name}</p>
                    <p className="text-[11px] text-gray-400 truncate mt-0.5">{tpl.body.slice(0, 50)}…</p>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Preview panel */}
          <div className="flex-1 flex flex-col min-w-0">
            {selected ? (
              <>
                <div className="flex-1 p-6 overflow-y-auto">
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-3">Preview</p>
                  <div className="bg-[#f0f2f5] rounded-xl p-4 max-w-[340px]">
                    {selected.header && (
                      <p className="text-[12px] font-semibold text-gray-700 mb-1">{selected.header}</p>
                    )}
                    <div className="bg-white rounded-xl rounded-tl-sm px-4 py-3 shadow-sm">
                      <p className="text-[14px] text-gray-800 leading-relaxed whitespace-pre-wrap">
                        {previewBody(selected.body)}
                      </p>
                      {selected.footer && (
                        <p className="text-[11px] text-gray-400 italic mt-1">{selected.footer}</p>
                      )}
                    </div>
                    {selected.buttons && selected.buttons.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {selected.buttons.map((btn) => (
                          <span key={btn.id} className="text-[12px] font-medium text-blue-600 bg-white border border-blue-100 px-3 py-1 rounded-full shadow-sm">
                            {btn.title}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                {error && (
                  <div className="px-6 pb-3">
                    <p className="text-[13px] text-red-500 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</p>
                  </div>
                )}
                <div className="px-6 pb-5 shrink-0">
                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={sending}
                    className="w-full py-2.5 bg-[#3B694C] hover:bg-[#2f5840] disabled:opacity-60 text-[14px] font-semibold text-white rounded-xl cursor-pointer transition-colors flex items-center justify-center gap-2"
                  >
                    <Send className="w-4 h-4" />
                    {sending ? "Sending…" : category === "RE_ENGAGEMENT" ? "Send Re-engagement" : "Send Template"}
                  </button>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-center p-6">
                <div>
                  <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
                    <LayoutTemplate className="w-6 h-6 text-gray-300" />
                  </div>
                  <p className="text-[13px] text-gray-400">Select a template to preview it</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}


export default function ConversationPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { conversations, markRead } = useConversationsContext();
  const conversation = conversations.find((c) => String(c.id ?? c._id) === id);
  const customer = conversation?.customer ?? null;

  const {
    messages,
    loading,
    loadingMore,
    hasMore,
    loadMore,
    appendOptimistic,
    confirmOptimistic,
    typingUsers,
  } = useMessages(id);

  const [aiReply, setAiReply] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [replyingTo, setReplyingTo] = useState<QuotedMessage | null>(null);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [reengagementOpen, setReengagementOpen] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);
  const [agentCache, setAgentCache] = useState<Record<string, string>>({});
  const [user, setUser] = useState<{
    id: string | number;
    username: string;
  } | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("user");
      if (stored) {
        const parsed = JSON.parse(stored);
        startTransition(() => {
          setUser(parsed);
          // Pre-seed cache so the current user's messages never fall through to the API fetch
          if (parsed?.id != null) {
            setAgentCache((prev) => ({
              [String(parsed.id)]: parsed.username,
              ...prev,
            }));
          }
        });
      }
    } catch {}
  }, []);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const prevScrollHeightRef = useRef(0);
  const isNearBottomRef = useRef(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const prevLastMsgKeyRef = useRef("");
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const emojiButtonRef = useRef<HTMLButtonElement>(null);

  // Close emoji picker on outside click
  useEffect(() => {
    if (!showEmojiPicker) return;
    function onPointerDown(e: PointerEvent) {
      if (
        emojiPickerRef.current?.contains(e.target as Node) ||
        emojiButtonRef.current?.contains(e.target as Node)
      ) return;
      setShowEmojiPicker(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [showEmojiPicker]);

  // Mark as read when leaving the conversation
  useEffect(() => {
    return () => {
      markRead(id);
    };
  }, [id, markRead]);

  // Scroll to bottom on initial load (instant, no animation)
  useEffect(() => {
    if (!loading) {
      const el = messagesContainerRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [loading]);

  // After messages change: restore position (load more) or scroll to bottom (new message)
  useLayoutEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    if (prevScrollHeightRef.current > 0) {
      // Prepend happened — restore scroll so the view doesn't jump
      el.scrollTop += el.scrollHeight - prevScrollHeightRef.current;
      prevScrollHeightRef.current = 0;
    } else if (isNearBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  // Count new customer messages arriving while scrolled up
  useEffect(() => {
    if (messages.length === 0) return;
    const last = messages[messages.length - 1];
    const key = last._id != null ? String(last._id) : last.id != null ? String(last.id) : "";
    if (!key || key === prevLastMsgKeyRef.current) return;
    prevLastMsgKeyRef.current = key;
    if (!isNearBottomRef.current && String(last.senderType) === "CUSTOMER") {
      setUnreadCount((n) => n + 1);
    }
  }, [messages]);

  // Reset unread counter when switching conversations
  useEffect(() => {
    setUnreadCount(0);
    setShowScrollDown(false);
    prevLastMsgKeyRef.current = "";
  }, [id]);

  function handleMessagesScroll() {
    const el = messagesContainerRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    isNearBottomRef.current = nearBottom;
    setShowScrollDown(!nearBottom);
    if (nearBottom) setUnreadCount(0);
    if (el.scrollTop < 80 && hasMore && !loadingMore) {
      prevScrollHeightRef.current = el.scrollHeight;
      loadMore();
    }
  }

  // Fetch names for any agent senderIds not already known
  useEffect(() => {
    const unknownIds = [
      ...new Set(
        messages
          .filter((m) => m.senderType === "AGENT" && m.senderId != null)
          .map((m) => String(m.senderId))
          .filter((sid) => {
            if (user && String(user.id) === sid) return false;
            if (
              conversation?.assignedAgent &&
              String(conversation.assignedAgent.id) === sid
            )
              return false;
            if (agentCache[sid]) return false;
            return true;
          }),
      ),
    ];
    if (unknownIds.length === 0) return;
    unknownIds.forEach(async (sid) => {
      try {
        const res = await apiGetUser(sid);
        setAgentCache((prev) => ({ ...prev, [sid]: res.data.username }));
      } catch {
        setAgentCache((prev) => ({ ...prev, [sid]: `Agent ${sid}` }));
      }
    });
  }, [messages, user, conversation?.assignedAgent, agentCache]);

  function handleTypingStop() {
    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current);
      typingTimerRef.current = null;
    }
    if (user?.username) {
      emitTypingStop(id, user.username);
    }
  }

  function highlightEl(row: HTMLElement) {
    row.classList.remove("msg-highlight");
    void row.offsetHeight;
    row.classList.add("msg-highlight");
    row.addEventListener("animationend", () => row.classList.remove("msg-highlight"), { once: true });
  }

  function scrollToMessage(msgId: number) {
    const container = messagesContainerRef.current;
    const row = document.querySelector<HTMLElement>(`[data-msg-id="${msgId}"]`);
    if (!row || !container) return;
    const containerRect = container.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    const targetScrollTop =
      container.scrollTop + rowRect.top - containerRect.top - container.clientHeight / 2 + rowRect.height / 2;
    container.scrollTo({ top: targetScrollTop, behavior: "smooth" });
    highlightEl(row);
  }

  async function handleSend() {
    const text = message.trim();
    if (!text || sending) return;
    setMessage("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setSending(true);

    // Capture reply context then clear it
    const quotedMsg = replyingTo;
    setReplyingTo(null);

    // Stop typing indicator on send
    handleTypingStop();

    const tempId = `temp-${Date.now()}`;
    const optimistic: Message = {
      _id: tempId,
      conversationId: id,
      senderType: "AGENT",
      senderId: null,
      content: text,
      messageType: "TEXT",
      status: null, // null = still sending
      createdAt: new Date().toISOString(),
      quotedMessageId: quotedMsg?.id ?? undefined,
      quotedMessage: quotedMsg ?? undefined,
    };
    isNearBottomRef.current = true;
    appendOptimistic(optimistic);

    try {
      const res = await apiSendMessage(id, text, undefined, "TEXT", quotedMsg?.id ?? undefined);
      // Backend may use `id` or `_id` — handle both
      const realId =
        ((res.data as Record<string, unknown>)._id as string) ??
        ((res.data as Record<string, unknown>).id as string);
      confirmOptimistic(tempId, {
        ...optimistic,
        _id: realId,
        status: res.data.status,
      });
    } catch {
      confirmOptimistic(tempId, { ...optimistic, status: "FAILED" });
    } finally {
      setSending(false);
    }
  }

  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current += 1;
    if (e.dataTransfer.types.includes("Files")) setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current === 0) setIsDragging(false);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files).filter((f) =>
      f.type.startsWith("image/") ||
      f.type.startsWith("video/") ||
      f.type.startsWith("audio/") ||
      f.type === "application/pdf" ||
      f.type.includes("word") ||
      f.type.includes("excel") ||
      f.type.includes("spreadsheet") ||
      f.type.includes("document")
    );
    if (files.length) setPendingFiles((prev) => [...prev, ...files]);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;
    setPendingFiles((prev) => [...prev, ...files]);
  }

  async function handleSendPending(files: File[], captions: string[]) {
    setPendingFiles([]);
    handleTypingStop();
    setSending(true);

    // Build all optimistic messages upfront (text + media pairs) so they all
    // appear in "sending" state immediately before any network requests start.
    type OptimisticPair = { textTempId: string | null; textMsg: Message | null; mediaTempId: string; mediaMsg: Message; file: File };
    const pairs: OptimisticPair[] = files.map((file, i) => {
      const caption = (captions[i] ?? "").trim();
      const msgType: Message["messageType"] =
        file.type.startsWith("image/") ? "IMAGE" :
        file.type.startsWith("video/") ? "VIDEO" :
        file.type.startsWith("audio/") ? "AUDIO" : "DOCUMENT";

      // Text optimistic (if caption exists)
      let textTempId: string | null = null;
      let textMsg: Message | null = null;
      if (caption) {
        textTempId = `temp-${Date.now()}-${Math.random()}`;
        textMsg = {
          _id: textTempId,
          conversationId: id,
          senderType: "AGENT",
          senderId: null,
          content: caption,
          messageType: "TEXT",
          status: null,
          createdAt: new Date().toISOString(),
        };
        isNearBottomRef.current = true;
        appendOptimistic(textMsg);
      }

      // Media optimistic
      const mediaTempId = `temp-${Date.now()}-${Math.random()}`;
      const mediaMsg: Message = {
        _id: mediaTempId,
        conversationId: id,
        senderType: "AGENT",
        senderId: null,
        content: URL.createObjectURL(file),
        messageType: msgType,
        status: null,
        createdAt: new Date().toISOString(),
      };
      isNearBottomRef.current = true;
      appendOptimistic(mediaMsg);

      return { textTempId, textMsg, mediaTempId, mediaMsg, file };
    });

    // Send each pair sequentially: TEXT first, then media
    for (const { textTempId, textMsg, mediaTempId, mediaMsg, file } of pairs) {
      // 1. Send caption text first (if present)
      if (textTempId && textMsg) {
        try {
          const res = await apiSendMessage(id, textMsg.content);
          const realId =
            ((res.data as Record<string, unknown>)._id as string) ??
            String((res.data as Record<string, unknown>).id);
          confirmOptimistic(textTempId, { ...textMsg, _id: realId, status: res.data.status });
        } catch {
          confirmOptimistic(textTempId, { ...textMsg, status: "FAILED" });
        }
      }

      // 2. Then send the media file
      try {
        const { url, messageType } = await apiUploadMedia(file);
        const res = await apiSendMessage(id, "", url, messageType);
        const realId =
          ((res.data as Record<string, unknown>)._id as string) ??
          String((res.data as Record<string, unknown>).id);
        confirmOptimistic(mediaTempId, { ...mediaMsg, _id: realId, content: url, mediaUrl: url, messageType, status: res.data.status });
      } catch {
        confirmOptimistic(mediaTempId, { ...mediaMsg, status: "FAILED" });
      }
    }

    setSending(false);
  }

  const initials = (() => {
    const src = customer?.name || customer?.phone;
    if (!src) return "?";
    return src
      .split(" ")
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("");
  })();

  const windowClosed = isWindowClosed(conversation?.lastCustomerMessageAt);

  return (
    <div
      className="relative flex flex-col h-full"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Drag-and-drop overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm pointer-events-none">
          <div className="flex flex-col items-center gap-3 p-8 rounded-2xl border-2 border-dashed border-[#3B694C]">
            <Paperclip className="w-10 h-10 text-[#3B694C]" />
            <p className="text-[15px] font-semibold text-[#3B694C]">Drop files to send</p>
          </div>
        </div>
      )}

      {/* Chat background — tiled, stays fixed while messages scroll */}
      <div
        className="absolute inset-0 pointer-events-none z-0"
        style={{
          backgroundImage: "url('/chatbackground.png')",
          backgroundRepeat: "repeat",
          backgroundSize: "420px auto",
          opacity: 0.3,
          backgroundColor: "#f5f4f0",
        }}
      />

      {/* Header */}
      <div className="relative z-10 flex items-center gap-3 px-5 py-3 bg-white border-b border-gray-100 shrink-0">
        <button
          type="button"
          onClick={() => router.push("/chats")}
          className="md:hidden w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 transition-colors cursor-pointer shrink-0"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 font-semibold text-[13px] shrink-0">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-[14px] text-gray-900 leading-tight">
            {customer?.name || customer?.phone || "Loading…"}
          </p>
          {customer?.name && customer?.phone && (
            <p className="text-[12px] text-gray-400 leading-tight">
              {customer.phone}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 mr-2">
          <span className="text-[12px] text-gray-400 font-medium">
            AI auto-reply
          </span>
          <Toggle on={aiReply} onToggle={() => setAiReply((v) => !v)} />
        </div>


        {/* Assigned agent badge */}
        {conversation?.assignedAgent && (
          <span className="text-[11px] font-medium text-gray-500 bg-gray-100 border border-gray-200 rounded-full px-2 py-0.5 whitespace-nowrap">
            @ {conversation.assignedAgent.username}
          </span>
        )}

        <button
          type="button"
          className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100 transition-colors cursor-pointer"
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </div>

      {/* File preview panel — replaces messages + input when files are queued */}
      {pendingFiles.length > 0 && (
        <MediaPreviewPanel
          files={pendingFiles}
          onSend={handleSendPending}
          onClose={() => setPendingFiles([])}
          onAddMore={(f) => setPendingFiles((prev) => [...prev, ...f])}
          onRemove={(i) =>
            setPendingFiles((prev) => prev.filter((_, idx) => idx !== i))
          }
        />
      )}

      {/* Messages */}
      {pendingFiles.length === 0 && (loading ? (
        <div className="relative z-10 flex flex-1 items-center justify-center">
          <span className="text-[13px] text-gray-400">Loading messages…</span>
        </div>
      ) : (
        <div className="relative flex-1 z-10 min-h-0">
          <div
            ref={messagesContainerRef}
            onScroll={handleMessagesScroll}
            className="absolute inset-0 overflow-y-auto overflow-x-hidden px-6 py-5 space-y-3 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-[#3B694C]/20 [&::-webkit-scrollbar-thumb]:rounded-full"
          >
          {loadingMore && (
            <div className="flex justify-center py-2">
              <span className="text-[12px] text-gray-400">Loading…</span>
            </div>
          )}
          {messages.map((msg, i) => {
            const mid =
              msg._id != null
                ? String(msg._id)
                : msg.id != null
                  ? String(msg.id)
                  : `msg-${i}`;
            const isSending = mid.startsWith("temp-");

            const isMediaMsg = msg.messageType === "AUDIO" || msg.messageType === "VIDEO" || msg.messageType === "STICKER";

            return msg.senderType === "CUSTOMER" ? (
              <div key={mid} data-msg-id={mid} className="group/msg flex justify-start items-end gap-1" onDoubleClick={(e) => { window.getSelection()?.removeAllRanges(); highlightEl(e.currentTarget); setReplyingTo({ id: Number(msg.id ?? msg._id), content: msg.content, messageType: msg.messageType, senderType: msg.senderType, mediaUrl: msg.mediaUrl }); }}>
                <div className={isMediaMsg ? "" : "max-w-[65%] min-w-0"}>
                  {isMediaMsg ? (
                    <div>
                      <MessageContent msg={msg} isAgent={false} />
                      <div className="bg-white border border-gray-100 rounded-xl rounded-tl-sm px-3 py-1 shadow-sm inline-flex mt-1">
                        <p className="text-[10px] text-gray-400">{formatMessageTime(msg.createdAt)}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="msg-bubble bg-white border border-gray-100 rounded-2xl rounded-tl-sm px-4 pt-2.5 pb-2 shadow-sm">
                      {msg.quotedMessage && (() => {
                        const qm = msg.quotedMessage;
                        const qImg = qm.messageType === "IMAGE" ? (qm.mediaUrl ?? qm.content) : null;
                        return (
                          <div onClick={() => scrollToMessage(qm.id)} className="border-l-2 border-[#3B694C]/60 pl-2 mb-2 py-0.5 pr-1 bg-[#3B694C]/5 rounded-r-sm cursor-pointer hover:bg-[#3B694C]/10 transition-colors">
                            <p className="text-[10px] font-semibold text-[#3B694C] leading-tight">
                              {qm.senderType === "AGENT" ? "You" : customer?.name || "Contact"}
                            </p>
                            {qImg ? (
                              <div className="flex items-center gap-1.5 mt-0.5">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={qImg} alt="" className="w-8 h-8 rounded object-cover shrink-0" />
                                <span className="text-[12px] text-gray-500">Photo</span>
                              </div>
                            ) : (
                              <p className="text-[12px] text-gray-500 truncate leading-tight">
                                {qm.messageType !== "TEXT" ? `[${qm.messageType.toLowerCase()}]` : qm.content}
                              </p>
                            )}
                          </div>
                        );
                      })()}
                      <MessageContent msg={msg} isAgent={false} />
                      <p className="text-[10px] text-gray-400 text-right mt-1 -mb-0.5">
                        {formatMessageTime(msg.createdAt)}
                      </p>
                    </div>
                  )}
                  {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                    <div className="flex gap-1 mt-0.5 flex-wrap">
                      {Object.entries(msg.reactions).map(([emoji, count]) => (
                        <span key={emoji} className="bg-white border border-gray-200 shadow-sm rounded-full px-1.5 py-0.5 flex items-center gap-0.5 leading-none">
                          <span className="text-base leading-none">{emoji}</span>
                          {count > 1 && <span className="text-[11px] text-gray-500 font-medium">{count}</span>}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  title="Reply"
                  onClick={() => setReplyingTo({ id: Number(msg.id ?? msg._id), content: msg.content, messageType: msg.messageType, senderType: msg.senderType, mediaUrl: msg.mediaUrl })}
                  className="opacity-0 group-hover/msg:opacity-100 self-center shrink-0 w-7 h-7 rounded-full bg-white border border-gray-200 shadow-sm hover:bg-gray-50 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-all cursor-pointer"
                >
                  <CornerUpLeft className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              (() => {
                const agent = getAgentAvatar(
                  msg.senderId,
                  user,
                  conversation?.assignedAgent ?? null,
                  agentCache,
                );
                const prevMsg = i > 0 ? messages[i - 1] : null;
                const senderChanged =
                  !prevMsg ||
                  prevMsg.senderType !== "AGENT" ||
                  String(prevMsg.senderId) !== String(msg.senderId);

                // Template message — special rendering
                const tpl = msg.messageType === "INTERACTIVE" ? parseTemplateContent(msg.content) : null;
                if (tpl) {
                  return (
                    <div key={mid} data-msg-id={mid} className="group/msg flex justify-end items-end gap-1 pr-4" onDoubleClick={(e) => { window.getSelection()?.removeAllRanges(); highlightEl(e.currentTarget); setReplyingTo({ id: Number(msg.id ?? msg._id), content: tpl.body, messageType: msg.messageType, senderType: msg.senderType, mediaUrl: null }); }}>
                      <button
                        type="button"
                        title="Reply"
                        onClick={() => setReplyingTo({ id: Number(msg.id ?? msg._id), content: tpl.body, messageType: msg.messageType, senderType: msg.senderType, mediaUrl: null })}
                        className="opacity-0 group-hover/msg:opacity-100 self-center shrink-0 w-7 h-7 rounded-full bg-white border border-gray-200 shadow-sm hover:bg-gray-50 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-all cursor-pointer"
                      >
                        <CornerUpLeft className="w-3.5 h-3.5" />
                      </button>
                      <div className="max-w-[65%] min-w-0">
                        {senderChanged && (
                          <p className="text-[11px] text-gray-400 text-right mb-1">{agent.name}</p>
                        )}
                        {/* Bubble — header / body / footer / timestamp */}
                        <div className={`msg-bubble bg-[#3B694C] rounded-2xl rounded-tr-sm px-4 pt-2.5 pb-2 shadow-sm transition-opacity ${isSending ? "opacity-75" : "opacity-100"} ${tpl.buttons?.length ? "rounded-b-none" : ""}`}>
                          {tpl.header && (
                            <p className="text-[14px] font-bold text-white mb-1 leading-snug">{tpl.header}</p>
                          )}
                          <p className="text-[14px] text-white leading-relaxed whitespace-pre-wrap break-words">{tpl.body}</p>
                          {tpl.footer && (
                            <p className="text-[11px] text-white/55 italic mt-2 leading-snug">{tpl.footer}</p>
                          )}
                          <div className="flex items-center justify-end gap-1 mt-1 -mb-0.5">
                            <span className="text-[10px] text-white/60">{formatMessageTime(msg.createdAt)}</span>
                            <MessageStatus isSending={isSending} status={msg.status} />
                          </div>
                        </div>
                        {/* CTA buttons — below bubble, outside green area */}
                        {tpl.buttons && tpl.buttons.length > 0 && (
                          <div className="space-y-1 mt-1">
                            {tpl.buttons.map((btn) => (
                              <div key={btn.id}
                                className="flex items-center justify-center py-2 bg-white border border-gray-200 rounded-xl text-[13px] font-medium text-[#3B694C] shadow-sm">
                                {btn.title}
                              </div>
                            ))}
                          </div>
                        )}
                        {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                          <div className="flex gap-1 mt-0.5 flex-wrap justify-end">
                            {Object.entries(msg.reactions).map(([emoji, count]) => (
                              <span key={emoji} className="bg-white border border-gray-200 shadow-sm rounded-full px-1.5 py-0.5 flex items-center gap-0.5 leading-none">
                                <span className="text-base leading-none">{emoji}</span>
                                {count > 1 && <span className="text-[11px] text-gray-500 font-medium">{count}</span>}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0 cursor-default select-none"
                        style={{ backgroundColor: agent.color }}
                      >
                        {agent.initials}
                      </div>
                    </div>
                  );
                }

                // Regular agent message
                return (
                  <div key={mid} data-msg-id={mid} className="group/msg flex justify-end items-end gap-1 pr-4" onDoubleClick={(e) => { window.getSelection()?.removeAllRanges(); highlightEl(e.currentTarget); setReplyingTo({ id: Number(msg.id ?? msg._id), content: msg.content, messageType: msg.messageType, senderType: msg.senderType, mediaUrl: msg.mediaUrl ?? (msg.messageType === "IMAGE" ? msg.content : null) }); }}>
                    <button
                      type="button"
                      title="Reply"
                      onClick={() => setReplyingTo({ id: Number(msg.id ?? msg._id), content: msg.content, messageType: msg.messageType, senderType: msg.senderType, mediaUrl: msg.mediaUrl ?? (msg.messageType === "IMAGE" ? msg.content : null) })}
                      className="opacity-0 group-hover/msg:opacity-100 self-center shrink-0 w-7 h-7 rounded-full bg-white border border-gray-200 shadow-sm hover:bg-gray-50 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-all cursor-pointer"
                    >
                      <CornerUpLeft className="w-3.5 h-3.5" />
                    </button>
                    <div className={isMediaMsg ? "" : "max-w-[65%] min-w-0"}>
                      {senderChanged && (
                        <p className="text-[11px] text-gray-400 text-right mb-1">
                          {agent.name}
                        </p>
                      )}
                      {isMediaMsg ? (
                        <div className={`transition-opacity ${isSending ? "opacity-75" : "opacity-100"}`}>
                          <MessageContent msg={msg} isAgent={true} />
                          <div className="flex justify-end mt-1">
                            <div className="bg-[#3B694C] rounded-xl rounded-tr-sm px-3 py-1 shadow-sm inline-flex items-center gap-1">
                              <span className="text-[10px] text-white/70">{formatMessageTime(msg.createdAt)}</span>
                              <MessageStatus isSending={isSending} status={msg.status} />
                            </div>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div
                            className={`msg-bubble bg-[#3B694C] rounded-2xl rounded-tr-sm px-4 pt-2.5 pb-2 shadow-sm transition-opacity ${isSending ? "opacity-75" : "opacity-100"}`}
                          >
                            {msg.quotedMessage && (() => {
                              const qm = msg.quotedMessage;
                              const qImg = qm.messageType === "IMAGE" ? (qm.mediaUrl ?? qm.content) : null;
                              return (
                                <div onClick={() => scrollToMessage(qm.id)} className="border-l-2 border-white/50 pl-2 mb-2 py-0.5 pr-1 bg-white/10 rounded-r-sm cursor-pointer hover:bg-white/20 transition-colors">
                                  <p className="text-[10px] font-semibold text-white/90 leading-tight">
                                    {qm.senderType === "AGENT" ? "You" : customer?.name || "Contact"}
                                  </p>
                                  {qImg ? (
                                    <div className="flex items-center gap-1.5 mt-0.5">
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img src={qImg} alt="" className="w-8 h-8 rounded object-cover shrink-0" />
                                      <span className="text-[12px] text-white/70">Photo</span>
                                    </div>
                                  ) : (
                                    <p className="text-[12px] text-white/70 truncate leading-tight">
                                      {qm.messageType !== "TEXT" ? `[${qm.messageType.toLowerCase()}]` : qm.content}
                                    </p>
                                  )}
                                </div>
                              );
                            })()}
                            <MessageContent msg={msg} isAgent={true} />
                            <div className="flex items-center justify-end gap-1 mt-1 -mb-0.5">
                              <span className="text-[10px] text-white/60">
                                {formatMessageTime(msg.createdAt)}
                              </span>
                              <MessageStatus
                                isSending={isSending}
                                status={msg.status}
                              />
                            </div>
                          </div>
                          {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                            <div className="flex gap-1 mt-0.5 flex-wrap justify-end">
                              {Object.entries(msg.reactions).map(([emoji, count]) => (
                                <span key={emoji} className="bg-white border border-gray-200 shadow-sm rounded-full px-1.5 py-0.5 flex items-center gap-0.5 leading-none">
                                  <span className="text-base leading-none">{emoji}</span>
                                  {count > 1 && <span className="text-[11px] text-gray-500 font-medium">{count}</span>}
                                </span>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0 cursor-default select-none"
                      style={{ backgroundColor: agent.color }}
                    >
                      {agent.initials}
                    </div>
                  </div>
                );
              })()
            );
          })}

          {/* Typing indicator */}
          {typingUsers.length > 0 && (
            <div className="flex justify-end">
              <div className="bg-[#DCF2E3]/60 border border-[#3B694C]/15 rounded-2xl rounded-tr-sm px-4 py-2.5">
                <span className="text-[12px] text-[#3B694C]/60 italic">
                  {typingUsers.join(", ")}{" "}
                  {typingUsers.length === 1 ? "is" : "are"} typing…
                </span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
          </div>
          {showScrollDown && (
            <button
              onClick={() => { messagesContainerRef.current?.scrollTo({ top: messagesContainerRef.current.scrollHeight, behavior: "smooth" }); setUnreadCount(0); }}
              className="absolute bottom-5 right-7 z-20 w-11 h-11 rounded-full bg-white border border-gray-200 shadow-md flex items-center justify-center text-[#3B694C] hover:bg-[#3B694C] hover:text-white hover:border-[#3B694C] transition-all cursor-pointer"
            >
              <ChevronDown className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#3B694C] text-white text-[10px] font-semibold flex items-center justify-center leading-none">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </button>
          )}
        </div>
      ))}

      {/* Input bar — hidden while preview panel is open */}
      {pendingFiles.length === 0 && (
        <div className="relative z-10 shrink-0 bg-white border-t border-gray-100">
          {/* Replying-to preview bar */}
          {replyingTo && (
            <div className="flex items-center gap-3 px-4 pt-2.5 pb-1 border-b border-gray-100">
              <div className="flex-1 border-l-2 border-[#3B694C] pl-2 min-w-0">
                <p className="text-[11px] font-semibold text-[#3B694C] leading-tight">
                  {replyingTo.senderType === "AGENT" ? "You" : customer?.name || "Contact"}
                </p>
                {replyingTo.messageType === "IMAGE" && replyingTo.mediaUrl ? (
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={replyingTo.mediaUrl} alt="" className="w-7 h-7 rounded object-cover shrink-0" />
                    <span className="text-[12px] text-gray-500">Photo</span>
                  </div>
                ) : (
                  <p className="text-[12px] text-gray-500 truncate leading-tight">
                    {replyingTo.messageType !== "TEXT"
                      ? `[${replyingTo.messageType.toLowerCase()}]`
                      : replyingTo.content}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setReplyingTo(null)}
                className="shrink-0 w-6 h-6 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* 24h window closed notice */}
          {windowClosed && (
            <div className="flex items-center gap-2 px-4 pt-3 pb-1">
              <Clock className="w-3.5 h-3.5 text-red-400 shrink-0" />
              <p className="text-[12px] text-red-500 font-medium">
                24-hour messaging window closed — use a re-engagement template to restart the conversation.
              </p>
            </div>
          )}

          <div className="flex items-end gap-3 px-4 py-3">
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept="image/*,video/mp4,video/3gpp,audio/*,.pdf,.doc,.docx,.xls,.xlsx"
              onChange={handleFileSelect}
            />
            <div className={`flex-1 flex items-end gap-3 rounded-2xl px-4 py-2.5 border transition-colors ${
              windowClosed
                ? "bg-gray-100 border-gray-200 opacity-60 cursor-not-allowed"
                : "bg-gray-50 border-gray-200"
            }`}>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={sending || windowClosed}
                className="text-gray-400 hover:text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer shrink-0 mb-0.5"
              >
                <Paperclip className="w-4 h-4" />
              </button>

              <textarea
                ref={textareaRef}
                rows={1}
                value={windowClosed ? "" : message}
                disabled={windowClosed}
                onChange={(e) => {
                  if (windowClosed) return;
                  setMessage(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = `${e.target.scrollHeight}px`;

                  if (user?.username) {
                    emitTypingStart(id, user.username);
                    if (typingTimerRef.current)
                      clearTimeout(typingTimerRef.current);
                    typingTimerRef.current = setTimeout(() => {
                      emitTypingStop(id, user.username!);
                      typingTimerRef.current = null;
                    }, 2000);
                  }
                }}
                onBlur={() => { handleTypingStop(); }}
                onKeyDown={(e) => {
                  if (windowClosed) return;
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                    if (textareaRef.current)
                      textareaRef.current.style.height = "auto";
                  }
                }}
                placeholder={windowClosed ? "Messaging disabled — 24h window closed" : "Type a message..."}
                className="flex-1 text-[14px] text-gray-700 placeholder:text-gray-400 outline-none bg-transparent resize-none overflow-hidden leading-[1.5] py-0.5 max-h-40 disabled:cursor-not-allowed"
              />

              <div className="relative shrink-0">
                <button
                  ref={emojiButtonRef}
                  type="button"
                  disabled={windowClosed}
                  onClick={() => setShowEmojiPicker((v) => !v)}
                  className={`text-gray-400 hover:text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer mb-0.5 ${showEmojiPicker ? "text-[#3B694C]" : ""}`}
                >
                  <Smile className="w-4 h-4" />
                </button>
                {showEmojiPicker && (
                  <div ref={emojiPickerRef} className="absolute bottom-8 right-0 z-50 emoji-picker-green">
                    <Suspense fallback={null}>
                      <EmojiPicker
                        theme="light"
                        onEmojiSelect={(emoji: { native: string }) => {
                          const ta = textareaRef.current;
                          if (!ta) return;
                          const start = ta.selectionStart ?? message.length;
                          const end = ta.selectionEnd ?? message.length;
                          const next = message.slice(0, start) + emoji.native + message.slice(end);
                          setMessage(next);
                          requestAnimationFrame(() => {
                            ta.focus();
                            const pos = start + emoji.native.length;
                            ta.setSelectionRange(pos, pos);
                          });
                        }}
                      />
                    </Suspense>
                  </div>
                )}
              </div>
            </div>

            {/* Template button — always accessible; RE_ENGAGEMENT when window is closed */}
            <button
              type="button"
              onClick={() => windowClosed ? setReengagementOpen(true) : setTemplatePickerOpen(true)}
              title={windowClosed ? "Send re-engagement template" : "Insert template"}
              className={`flex items-center gap-1.5 text-[12px] font-medium border rounded-xl px-2.5 py-2 transition-colors cursor-pointer shrink-0 ${
                windowClosed
                  ? "text-red-600 bg-red-50 border-red-300 hover:bg-red-100 hover:border-red-400"
                  : "text-gray-500 hover:text-[#3B694C] hover:bg-[#EEF6F1] border-gray-200 hover:border-[#3B694C]/30"
              }`}
            >
              <LayoutTemplate className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Template</span>
            </button>

            <button
              type="button"
              onClick={handleSend}
              disabled={!message.trim() || sending || windowClosed}
              className="flex items-center gap-2 bg-[#3B694C] hover:bg-[#2f5840] disabled:opacity-50 disabled:cursor-not-allowed text-white text-[13px] font-semibold px-4 py-2.5 rounded-xl transition-colors cursor-pointer shrink-0"
            >
              Send
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {templatePickerOpen && (
        <TemplatePickerModal
          conversationId={id}
          category="GENERAL"
          customerName={customer?.name ?? "Customer"}
          agentName={user?.username ?? "Agent"}
          onClose={() => setTemplatePickerOpen(false)}
          onSent={() => setTemplatePickerOpen(false)}
        />
      )}
      {reengagementOpen && (
        <TemplatePickerModal
          conversationId={id}
          category="RE_ENGAGEMENT"
          customerName={customer?.name ?? "Customer"}
          agentName={user?.username ?? "Agent"}
          onClose={() => setReengagementOpen(false)}
          onSent={() => setReengagementOpen(false)}
        />
      )}
    </div>
  );
}
