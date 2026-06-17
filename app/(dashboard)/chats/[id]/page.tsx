"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useEffect, useRef, startTransition } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  MoreHorizontal,
  Paperclip,
  Send,
  Smile,
  Play,
  Download,
  X,
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
} from "@/lib/api";
import type { Message } from "@/types";

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
    return <span className="text-[11px] text-[#DCF2E3]">✓✓</span>;
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
   directSrc: Cloudinary URL (agent-sent) → use immediately, no fetch
   fetchUrl:  proxy URL (customer-sent)   → fetch with credentials, blob URL */
function useMediaSrc(directSrc: string | null, fetchUrl: string | null) {
  const [src, setSrc] = useState<string | null>(directSrc);
  const [loading, setLoading] = useState(!directSrc);

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

function AudioMessage({ directSrc, fetchUrl }: { directSrc: string | null; fetchUrl: string | null }) {
  const { src, loading } = useMediaSrc(directSrc, fetchUrl);
  if (loading) return <div className="w-[240px] h-8 bg-gray-200/60 animate-pulse rounded-full" />;
  if (!src) return <span className="text-[12px] text-gray-400">Failed to load audio</span>;
  return <audio controls src={src} className="w-full min-w-[220px] block" />;
}

function VideoMessage({ directSrc, fetchUrl, isAgent }: { directSrc: string | null; fetchUrl: string | null; isAgent: boolean }) {
  const [triggered, setTriggered] = useState(false);
  const [lazySrc, setLazySrc] = useState<string | null>(null);
  const [loadingVideo, setLoadingVideo] = useState(false);

  // Agent video: Cloudinary URL → play immediately
  if (directSrc) {
    return <video controls src={directSrc} className="max-w-full rounded-xl block" style={{ maxHeight: 240 }} />;
  }

  // Customer video: lazy-fetch on tap
  if (!triggered) {
    return (
      <button type="button" onClick={async () => {
        setTriggered(true);
        setLoadingVideo(true);
        try {
          const res = await fetch(fetchUrl!, { credentials: "include" });
          if (!res.ok) throw new Error();
          setLazySrc(URL.createObjectURL(await res.blob()));
        } catch {}
        finally { setLoadingVideo(false); }
      }}
        className={`flex items-center gap-2 px-3 py-2 rounded-xl text-[13px] font-medium transition-colors cursor-pointer ${
          isAgent ? "bg-white/10 hover:bg-white/20 text-white" : "bg-gray-100 hover:bg-gray-200 text-gray-700"
        }`}
      >
        <Play className="w-4 h-4" />
        Tap to load video
      </button>
    );
  }
  if (loadingVideo) return <div className="w-[260px] h-[160px] bg-gray-200/60 animate-pulse rounded-xl" />;
  if (!lazySrc) return <span className="text-[12px] text-gray-400">Failed to load video</span>;
  return <video controls src={lazySrc} className="max-w-full rounded-xl block" style={{ maxHeight: 240 }} />;
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
  const rawId = msg._id ?? (msg as unknown as { id: unknown }).id;
  const proxyUrl = `${process.env.NEXT_PUBLIC_API_URL}/api/messages/${rawId}/media`;

  // Agent-sent: content IS the Cloudinary URL → no auth fetch needed
  // Customer-sent: content is a placeholder → proxy with auth → blob URL
  const directSrc = isAgent ? msg.content : null;
  const fetchUrl  = isAgent ? null : proxyUrl;

  if (msg.messageType === "IMAGE") return <ImageMessage directSrc={directSrc} fetchUrl={fetchUrl} />;
  if (msg.messageType === "VIDEO") return <VideoMessage directSrc={directSrc} fetchUrl={fetchUrl} isAgent={isAgent} />;
  if (msg.messageType === "AUDIO") return <AudioMessage directSrc={directSrc} fetchUrl={fetchUrl} />;
  if (msg.messageType === "DOCUMENT") return <DocumentMessage directSrc={directSrc} fetchUrl={fetchUrl} isAgent={isAgent} />;

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
  onSend: (files: File[], caption: string) => void;
  onClose: () => void;
  onAddMore: (f: File[]) => void;
  onRemove: (index: number) => void;
}) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [caption, setCaption] = useState("");
  const [previews, setPreviews] = useState<string[]>([]);
  const addMoreRef = useRef<HTMLInputElement>(null);

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
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Type a message…"
            className="w-full bg-transparent text-[14px] text-gray-700 placeholder:text-gray-400 outline-none"
            onKeyDown={(e) => { if (e.key === "Enter") onSend(files, caption); }}
          />
        </div>
        <button
          type="button"
          onClick={() => onSend(files, caption)}
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

export default function ConversationPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { conversations, markRead } = useConversationsContext();
  const conversation = conversations.find((c) => String(c.id ?? c._id) === id);
  const customer = conversation?.customer ?? null;

  const {
    messages,
    loading,
    appendOptimistic,
    confirmOptimistic,
    typingUsers,
  } = useMessages(id);

  const [aiReply, setAiReply] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Mark as read when leaving the conversation
  useEffect(() => {
    return () => {
      markRead(id);
    };
  }, [id, markRead]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typingUsers]);

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

  async function handleSend() {
    const text = message.trim();
    if (!text || sending) return;
    setMessage("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setSending(true);

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
    };
    appendOptimistic(optimistic);

    try {
      const res = await apiSendMessage(id, text);
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

  async function handleSendPending(files: File[], caption: string) {
    setPendingFiles([]);
    handleTypingStop();
    setSending(true);

    const text = caption.trim();

    // Build optimistic messages immediately so all appear at once
    const optimistics = files.map((file) => {
      const msgType: Message["messageType"] =
        file.type.startsWith("image/") ? "IMAGE" :
        file.type.startsWith("video/") ? "VIDEO" :
        file.type.startsWith("audio/") ? "AUDIO" : "DOCUMENT";
      const localUrl = URL.createObjectURL(file);
      const tempId = `temp-${Date.now()}-${Math.random()}`;
      const msg: Message = {
        _id: tempId,
        conversationId: id,
        senderType: "AGENT",
        senderId: null,
        content: localUrl,
        messageType: msgType,
        status: null,
        createdAt: new Date().toISOString(),
      };
      appendOptimistic(msg);
      return { file, tempId, optimistic: msg };
    });

    // Upload and send sequentially — each confirms before the next starts
    for (const { file, tempId, optimistic } of optimistics) {
      try {
        const { url, messageType } = await apiUploadMedia(file);
        const res = await apiSendMessage(id, text, url, messageType);
        const realId =
          ((res.data as Record<string, unknown>)._id as string) ??
          String((res.data as Record<string, unknown>).id);
        confirmOptimistic(tempId, { ...optimistic, _id: realId, content: url, messageType, status: res.data.status });
      } catch {
        confirmOptimistic(tempId, { ...optimistic, status: "FAILED" });
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

  // Derive effective status: prefer local override, then fall back to context value

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
        <div className="relative z-10 flex-1 overflow-y-auto overflow-x-hidden px-6 py-5 space-y-3 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-[#3B694C]/20 [&::-webkit-scrollbar-thumb]:rounded-full">
          {messages.map((msg, i) => {
            const mid =
              msg._id != null
                ? String(msg._id)
                : msg.id != null
                  ? String(msg.id)
                  : `msg-${i}`;
            const isSending = mid.startsWith("temp-");

            return msg.senderType === "CUSTOMER" ? (
              <div key={mid} className="flex justify-start">
                <div className="max-w-[65%] min-w-0">
                  <div className="bg-white border border-gray-100 rounded-2xl rounded-tl-sm px-4 pt-2.5 pb-2 shadow-sm">
                    <MessageContent msg={msg} isAgent={false} />
                    <p className="text-[10px] text-gray-400 text-right mt-1 -mb-0.5">
                      {formatMessageTime(msg.createdAt)}
                    </p>
                  </div>
                </div>
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
                return (
                  <div key={mid} className="flex justify-end items-end gap-2">
                    <div className="max-w-[65%] min-w-0">
                      {senderChanged && (
                        <p className="text-[11px] text-gray-400 text-right mb-1">
                          {agent.name}
                        </p>
                      )}
                      <div
                        className={`bg-[#3B694C] rounded-2xl rounded-tr-sm px-4 pt-2.5 pb-2 shadow-sm transition-opacity ${isSending ? "opacity-75" : "opacity-100"}`}
                      >
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
      ))}

      {/* Input bar — hidden while preview panel is open */}
      {pendingFiles.length === 0 && <div className="relative z-10 shrink-0 flex items-end gap-3 px-4 py-3 bg-white border-t border-gray-100">
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept="image/*,video/mp4,video/3gpp,audio/*,.pdf,.doc,.docx,.xls,.xlsx"
          onChange={handleFileSelect}
        />
        <div className="flex-1 flex items-end gap-3 bg-gray-50 border border-gray-200 rounded-2xl px-4 py-2.5">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={sending}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-40 transition-colors cursor-pointer shrink-0 mb-0.5"
          >
            <Paperclip className="w-4 h-4" />
          </button>

          <textarea
            ref={textareaRef}
            rows={1}
            value={message}
            onChange={(e) => {
              setMessage(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${e.target.scrollHeight}px`;

              // Typing indicator
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
            onBlur={() => {
              handleTypingStop();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
                if (textareaRef.current)
                  textareaRef.current.style.height = "auto";
              }
            }}
            placeholder="Type a message..."
            className="flex-1 text-[14px] text-gray-700 placeholder:text-gray-400 outline-none bg-transparent resize-none overflow-hidden leading-[1.5] py-0.5 max-h-40"
          />

          <button
            type="button"
            className="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer shrink-0 mb-0.5"
          >
            <Smile className="w-4 h-4" />
          </button>
        </div>

        <button
          type="button"
          onClick={handleSend}
          disabled={!message.trim() || sending}
          className="flex items-center gap-2 bg-[#3B694C] hover:bg-[#2f5840] disabled:opacity-50 disabled:cursor-not-allowed text-white text-[13px] font-semibold px-4 py-2.5 rounded-xl transition-colors cursor-pointer shrink-0"
        >
          Send
          <Send className="w-3.5 h-3.5" />
        </button>
      </div>}
    </div>
  );
}
