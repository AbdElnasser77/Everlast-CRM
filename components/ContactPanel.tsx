"use client";

// The chat's contact panel — WhatsApp Web's "Contact info", for the CRM:
// who this is, what they booked through a flow, notes and tags the team can
// edit mid-conversation, the chat's media/docs/links, and the campaigns they
// received. Opened from the chat header.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  X, Search, Pencil, Check, Copy, CalendarCheck2, StickyNote, Tag, Image as ImageIcon, FileText, Link2,
  Megaphone, ShieldOff, Video, Music, ChevronRight, Loader2, ArrowLeft, ExternalLink,
} from "lucide-react";
import { apiGetConversationProfile, apiSearchMessages, apiUpdateCustomer } from "@/lib/api";
import type { ConversationProfile, Message } from "@/types";
import { RUN_STATUS_META } from "@/lib/flows";
import { useCurrentUser } from "@/components/CurrentUserProvider";
import { useToast } from "@/components/ui/toast";

const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";
const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
// A collected date is stored as 2026-10-15; show it as people write it.
const fmtAnswer = (v: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : v;
const pretty = (key: string) => key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

// The answers a booking is made of, in reading order; anything else follows.
const BOOKING_KEYS = ["offer", "preferred_date", "preferred_time", "contact_number"];

function Section({ icon: Icon, title, aside, children }: { icon: React.ComponentType<{ className?: string }>; title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="px-5 py-4 border-b border-gray-100">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-gray-400" />
        <h4 className="text-[13px] font-semibold text-gray-700 flex-1">{title}</h4>
        {aside}
      </div>
      {children}
    </section>
  );
}

type MediaTab = "media" | "docs" | "links";

export function ContactPanel({
  conversationId,
  refreshKey,
  onClose,
  onJumpToMessage,
}: {
  conversationId: string;
  /** Changes when new messages arrive, so media/links/bookings stay current. */
  refreshKey: number;
  onClose: () => void;
  /** Scrolls the chat to a message; false when it isn't loaded (older). */
  onJumpToMessage: (messageId: number) => boolean;
}) {
  const { can } = useCurrentUser();
  const canEdit = can("contact:write");
  const toast = useToast();
  const [profile, setProfile] = useState<ConversationProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  // Editing state
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", chartNumber: "", nationality: "" });
  const [notes, setNotes] = useState("");
  const [notesDirty, setNotesDirtyState] = useState(false);
  // Read by the loader so a refresh never overwrites a note being typed.
  const notesDirtyRef = useRef(false);
  const setNotesDirty = (v: boolean) => { notesDirtyRef.current = v; setNotesDirtyState(v); };
  const [newTag, setNewTag] = useState("");
  const [saving, setSaving] = useState(false);

  // Search + media views
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Message[]>([]);
  const [searchBusy, setSearchBusy] = useState(false);
  const [mediaTab, setMediaTab] = useState<MediaTab>("media");

  useEffect(() => {
    let cancelled = false;
    apiGetConversationProfile(conversationId)
      .then((res) => {
        if (cancelled) return;
        setProfile(res.data);
        setError(null);
        const c = res.data.customer;
        setForm({ name: c.name || "", email: c.email || "", chartNumber: c.chartNumber || "", nationality: c.nationality || "" });
        if (!notesDirtyRef.current) setNotes(c.notes || "");
      })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : "Couldn't load contact info"); });
    return () => { cancelled = true; };
  }, [conversationId, refreshKey, reload]);

  useEffect(() => {
    if (!searching || query.trim().length < 2) return;
    let cancelled = false;
    const t = setTimeout(() => {
      setSearchBusy(true);
      apiSearchMessages(query.trim(), conversationId, 1, 40)
        .then((res) => { if (!cancelled) setResults(res.data); })
        .catch(() => { if (!cancelled) setResults([]); })
        .finally(() => { if (!cancelled) setSearchBusy(false); });
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [searching, query, conversationId]);

  const save = useCallback(async (patch: Parameters<typeof apiUpdateCustomer>[1], okMessage: string) => {
    if (!profile) return false;
    setSaving(true);
    try {
      await apiUpdateCustomer(profile.customer.id, patch);
      toast.success(okMessage);
      setReload((n) => n + 1);
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save");
      return false;
    } finally {
      setSaving(false);
    }
  }, [profile, toast]);

  const jump = (messageId: number) => {
    if (!onJumpToMessage(messageId)) toast.info("That message is further up — scroll up in the chat to load it.");
  };

  const bookings = useMemo(() => (profile?.responses || []).filter((r) => r.answers.preferred_date || r.answers.contact_number), [profile]);
  const otherResponses = useMemo(() => (profile?.responses || []).filter((r) => !(r.answers.preferred_date || r.answers.contact_number)), [profile]);

  if (error) {
    return (
      <PanelShell onClose={onClose} title="Contact info">
        <p className="p-5 text-[13px] text-red-600">{error}</p>
      </PanelShell>
    );
  }
  if (!profile) {
    return (
      <PanelShell onClose={onClose} title="Contact info">
        <div className="flex-1 flex items-center justify-center"><Loader2 className="w-5 h-5 text-gray-300 animate-spin" /></div>
      </PanelShell>
    );
  }

  const c = profile.customer;
  const initials = (c.name || c.phone).split(" ").slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");

  // ── Search view (replaces the panel body, like WhatsApp Web) ─────────────
  if (searching) {
    return (
      <PanelShell
        onClose={onClose}
        title="Search messages"
        back={() => { setSearching(false); setQuery(""); setResults([]); }}
      >
        <div className="px-4 py-3 border-b border-gray-100">
          <div className="flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2">
            <Search className="w-3.5 h-3.5 text-gray-400" />
            <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search this chat…" className="flex-1 bg-transparent outline-none text-[13px]" />
            {searchBusy && <Loader2 className="w-3.5 h-3.5 text-gray-300 animate-spin" />}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {query.trim().length < 2 ? (
            <p className="p-5 text-[12px] text-gray-400">Type at least 2 characters.</p>
          ) : results.length === 0 && !searchBusy ? (
            <p className="p-5 text-[12px] text-gray-400">No messages found.</p>
          ) : (
            results.map((m) => (
              <button key={String(m.id ?? m._id)} type="button" onClick={() => jump(Number(m.id ?? m._id))} className="w-full text-left px-5 py-3 border-b border-gray-50 hover:bg-gray-50">
                <p className="text-[11px] text-gray-400">{fmtDateTime(m.createdAt)} · {m.senderType === "CUSTOMER" ? c.name || "Customer" : m.senderType === "BOT" ? "Automation" : "Team"}</p>
                <p className="text-[13px] text-gray-700 line-clamp-2">{snippet(m.content)}</p>
              </button>
            ))
          )}
        </div>
      </PanelShell>
    );
  }

  const imagesAndVideos = profile.media.filter((m) => m.messageType === "IMAGE" || m.messageType === "VIDEO");
  const docs = profile.media.filter((m) => m.messageType === "DOCUMENT" || m.messageType === "AUDIO");
  const mediaTotal = (profile.mediaCounts.IMAGE || 0) + (profile.mediaCounts.VIDEO || 0) + (profile.mediaCounts.DOCUMENT || 0) + (profile.mediaCounts.AUDIO || 0) + profile.links.length;

  return (
    <PanelShell onClose={onClose} title="Contact info">
      <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-[#3B694C]/25 [&::-webkit-scrollbar-thumb]:rounded-full">
        {/* Identity */}
        <div className="px-5 pt-6 pb-5 flex flex-col items-center text-center border-b border-gray-100">
          <div className="w-24 h-24 rounded-full bg-[#EEF6F1] text-[#3B694C] flex items-center justify-center text-[28px] font-bold">{initials}</div>
          {editing ? (
            <div className="w-full mt-4 space-y-2 text-left">
              {([
                ["name", "Name"], ["email", "Email"], ["chartNumber", "Chart number"], ["nationality", "Nationality"],
              ] as const).map(([k, label]) => (
                <label key={k} className="block">
                  <span className="text-[11px] font-semibold text-gray-400">{label}</span>
                  <input value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-[13px] outline-none focus:border-[#3B694C]" />
                </label>
              ))}
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setEditing(false)} className="text-[12px] text-gray-500 px-3 py-1.5 rounded-lg hover:bg-gray-50">Cancel</button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={async () => {
                    const ok = await save({
                      name: form.name.trim(), email: form.email.trim(),
                      chartNumber: form.chartNumber.trim() || null, nationality: form.nationality.trim() || null,
                    }, "Contact updated");
                    if (ok) setEditing(false);
                  }}
                  className="inline-flex items-center gap-1 text-[12px] font-semibold text-white bg-[#3B694C] hover:bg-[#2f5840] px-3 py-1.5 rounded-lg disabled:opacity-60"
                >
                  <Check className="w-3.5 h-3.5" /> Save
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="mt-3 flex items-center gap-1.5">
                <h3 className="text-[18px] font-bold text-gray-900">{c.name || "No name"}</h3>
                {canEdit && (
                  <button type="button" onClick={() => setEditing(true)} title="Edit contact" className="w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-700">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => { navigator.clipboard.writeText(`+${c.phone}`).then(() => toast.success("Number copied")).catch(() => {}); }}
                className="mt-0.5 inline-flex items-center gap-1 text-[13px] text-gray-500 hover:text-gray-800"
                title="Copy number"
              >
                +{c.phone} <Copy className="w-3 h-3" />
              </button>
              <p className="text-[11px] text-gray-400 mt-1">
                {profile.conversation.messageCount} messages · contact since {fmtDate(c.createdAt)}
                {profile.conversation.assignedAgent ? ` · with ${profile.conversation.assignedAgent.name || profile.conversation.assignedAgent.username}` : ""}
              </p>
              {(profile.optOut || c.optedOut) && (
                <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-red-600 bg-red-50 rounded-full px-2 py-0.5">
                  <ShieldOff className="w-3 h-3" /> Opted out{profile.optOut ? ` · ${fmtDate(profile.optOut.optedOutAt)}` : ""}
                </span>
              )}
            </>
          )}

          {!editing && (
            <div className="mt-4 flex gap-3">
              <PanelAction icon={Search} label="Search" onClick={() => setSearching(true)} />
              <PanelAction icon={ExternalLink} label="Contact" href={`/customers?search=${encodeURIComponent(c.phone)}`} />
            </div>
          )}

          {!editing && (c.email || c.chartNumber || c.nationality || c.gender || c.dateOfBirth) && (
            <dl className="mt-4 w-full grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-left text-[12px]">
              {c.chartNumber && (<><dt className="text-gray-400">Chart #</dt><dd className="text-gray-700">{c.chartNumber}</dd></>)}
              {c.email && (<><dt className="text-gray-400">Email</dt><dd className="text-gray-700 truncate">{c.email}</dd></>)}
              {c.nationality && (<><dt className="text-gray-400">Nationality</dt><dd className="text-gray-700">{c.nationality}</dd></>)}
              {c.gender && (<><dt className="text-gray-400">Gender</dt><dd className="text-gray-700">{c.gender === "MALE" ? "Male" : "Female"}</dd></>)}
              {c.dateOfBirth && (<><dt className="text-gray-400">Born</dt><dd className="text-gray-700">{fmtDate(c.dateOfBirth)}</dd></>)}
            </dl>
          )}
        </div>

        {/* Bookings */}
        <Section icon={CalendarCheck2} title="Booking requests" aside={bookings.length ? <span className="text-[11px] text-gray-400">{bookings.length}</span> : undefined}>
          {bookings.length === 0 ? (
            <p className="text-[12px] text-gray-400">No bookings yet. Requests made through a flow appear here.</p>
          ) : (
            <div className="space-y-2">
              {bookings.map((r) => {
                const keys = [...BOOKING_KEYS.filter((k) => r.answers[k]), ...Object.keys(r.answers).filter((k) => !BOOKING_KEYS.includes(k) && k !== "category")];
                return (
                  <div key={r.id} className="rounded-xl border border-[#3B694C]/20 bg-[#F5FAF7] p-3">
                    <div className="flex items-start gap-2">
                      <p className="flex-1 text-[13px] font-bold text-gray-900">{r.answers.offer || "Booking request"}</p>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${RUN_STATUS_META[r.status].cls}`}>{RUN_STATUS_META[r.status].label}</span>
                    </div>
                    <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[12px]">
                      {keys.filter((k) => k !== "offer").map((k) => (
                        <div key={k} className="contents">
                          <dt className="text-gray-400">{k === "preferred_date" ? "Date" : k === "preferred_time" ? "Time" : k === "contact_number" ? "Contact" : pretty(k)}</dt>
                          <dd className="text-gray-800 font-medium">{fmtAnswer(r.answers[k])}</dd>
                        </div>
                      ))}
                    </dl>
                    <Link href={`/campaigns/flows/${r.flow.id}`} className="mt-2 inline-flex items-center gap-0.5 text-[11px] text-[#3B694C] hover:underline">
                      {r.flow.name} · {fmtDateTime(r.startedAt)} <ChevronRight className="w-3 h-3" />
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
          {otherResponses.length > 0 && (
            <p className="mt-2 text-[11px] text-gray-400">
              Also browsed: {[...new Set(otherResponses.map((r) => r.answers.offer || r.answers.category).filter(Boolean))].slice(0, 4).join(", ") || "—"}
            </p>
          )}
        </Section>

        {/* Notes */}
        <Section icon={StickyNote} title="Notes">
          <textarea
            value={notes}
            disabled={!canEdit}
            onChange={(e) => { setNotes(e.target.value); setNotesDirty(true); }}
            rows={3}
            placeholder={canEdit ? "Add a note for the team — e.g. prefers evenings, allergic to…" : "No notes"}
            className="w-full resize-y border border-gray-200 rounded-lg px-2.5 py-2 text-[13px] outline-none focus:border-[#3B694C] disabled:bg-gray-50"
          />
          {notesDirty && (
            <div className="flex justify-end gap-2 mt-1.5">
              <button type="button" onClick={() => { setNotes(c.notes || ""); setNotesDirty(false); }} className="text-[12px] text-gray-500 px-2.5 py-1 rounded-lg hover:bg-gray-50">Discard</button>
              <button
                type="button"
                disabled={saving}
                onClick={async () => { if (await save({ notes }, "Note saved")) setNotesDirty(false); }}
                className="text-[12px] font-semibold text-white bg-[#3B694C] hover:bg-[#2f5840] px-3 py-1 rounded-lg disabled:opacity-60"
              >
                Save note
              </button>
            </div>
          )}
        </Section>

        {/* Tags */}
        <Section icon={Tag} title="Tags">
          <div className="flex flex-wrap gap-1.5">
            {c.tags.map((t) => (
              <span key={t} className="inline-flex items-center gap-1 text-[12px] bg-gray-100 text-gray-700 rounded-full pl-2.5 pr-1 py-0.5">
                {t}
                {canEdit && (
                  <button type="button" title="Remove tag" onClick={() => save({ tags: c.tags.filter((x) => x !== t) }, "Tag removed")} className="w-4 h-4 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-200 hover:text-gray-700">
                    <X className="w-3 h-3" />
                  </button>
                )}
              </span>
            ))}
            {c.tags.length === 0 && <span className="text-[12px] text-gray-400">No tags</span>}
          </div>
          {canEdit && (
            <form
              className="mt-2 flex gap-1.5"
              onSubmit={async (e) => {
                e.preventDefault();
                const t = newTag.trim();
                if (!t || c.tags.includes(t)) return setNewTag("");
                if (await save({ tags: [...c.tags, t] }, "Tag added")) setNewTag("");
              }}
            >
              <input value={newTag} onChange={(e) => setNewTag(e.target.value)} placeholder="Add a tag…" className="flex-1 border border-gray-200 rounded-lg px-2.5 py-1.5 text-[12px] outline-none focus:border-[#3B694C]" />
              <button type="submit" disabled={!newTag.trim() || saving} className="text-[12px] font-semibold text-[#3B694C] border border-[#3B694C]/30 bg-[#EEF6F1] px-3 rounded-lg disabled:opacity-40">Add</button>
            </form>
          )}
        </Section>

        {/* Media, links and docs */}
        <Section icon={ImageIcon} title="Media, links and docs" aside={<span className="text-[11px] text-gray-400">{mediaTotal}</span>}>
          <div className="flex gap-1 mb-3">
            {([["media", `Media (${imagesAndVideos.length})`], ["docs", `Docs (${docs.length})`], ["links", `Links (${profile.links.length})`]] as const).map(([k, label]) => (
              <button key={k} type="button" onClick={() => setMediaTab(k)} className={`text-[12px] px-2.5 py-1 rounded-full border ${mediaTab === k ? "bg-[#DCF2E3] border-[#3B694C] text-[#3B694C] font-semibold" : "border-gray-200 text-gray-500"}`}>
                {label}
              </button>
            ))}
          </div>
          {mediaTab === "media" && (imagesAndVideos.length === 0 ? <Empty text="No photos or videos in this chat." /> : (
            <div className="grid grid-cols-3 gap-1.5">
              {imagesAndVideos.map((m) => (
                <button key={m.id} type="button" onClick={() => jump(m.id)} className="relative aspect-square rounded-lg overflow-hidden bg-gray-100 hover:opacity-90" title={fmtDateTime(m.createdAt)}>
                  {m.messageType === "IMAGE" && m.mediaUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.mediaUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="absolute inset-0 flex items-center justify-center text-gray-400">{m.messageType === "VIDEO" ? <Video className="w-5 h-5" /> : <ImageIcon className="w-5 h-5" />}</span>
                  )}
                </button>
              ))}
            </div>
          ))}
          {mediaTab === "docs" && (docs.length === 0 ? <Empty text="No documents or voice notes." /> : (
            <ul className="space-y-1">
              {docs.map((m) => (
                <li key={m.id}>
                  <button type="button" onClick={() => jump(m.id)} className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-50 text-left">
                    {m.messageType === "AUDIO" ? <Music className="w-4 h-4 text-gray-400 shrink-0" /> : <FileText className="w-4 h-4 text-gray-400 shrink-0" />}
                    <span className="flex-1 min-w-0 text-[12px] text-gray-700 truncate">{m.messageType === "AUDIO" ? "Voice note" : (m.mediaUrl || m.content || "Document").split("/").pop()}</span>
                    <span className="text-[11px] text-gray-400 shrink-0">{fmtDate(m.createdAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
          ))}
          {mediaTab === "links" && (profile.links.length === 0 ? <Empty text="No links shared." /> : (
            <ul className="space-y-1">
              {profile.links.map((l) => (
                <li key={l.url} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-50">
                  <Link2 className="w-4 h-4 text-gray-400 shrink-0" />
                  <a href={l.url} target="_blank" rel="noreferrer" className="flex-1 min-w-0 text-[12px] text-[#3B694C] hover:underline truncate">{l.url.replace(/^https?:\/\//, "")}</a>
                  <button type="button" onClick={() => jump(l.messageId)} title="Show in chat" className="text-[11px] text-gray-400 hover:text-gray-700 shrink-0">{fmtDate(l.createdAt)}</button>
                </li>
              ))}
            </ul>
          ))}
        </Section>

        {/* Campaigns */}
        <Section icon={Megaphone} title="Campaigns received" aside={profile.campaigns.length ? <span className="text-[11px] text-gray-400">{profile.campaigns.length}</span> : undefined}>
          {profile.campaigns.length === 0 ? <Empty text="No campaigns sent to this contact on this number." /> : (
            <ul className="space-y-1.5">
              {profile.campaigns.map((cp, i) => (
                <li key={`${cp.id}-${i}`}>
                  <Link href={`/campaigns/${cp.id}`} className="flex items-center gap-2 text-[12px] hover:bg-gray-50 rounded-lg px-1.5 py-1">
                    <span className="flex-1 min-w-0 truncate text-gray-700">{cp.name}</span>
                    {cp.repliedAt && <span className="text-[10px] font-semibold text-[#3B694C] bg-[#EEF6F1] rounded-full px-1.5">Replied</span>}
                    <span className="text-[11px] text-gray-400 shrink-0">{fmtDate(cp.sentAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </PanelShell>
  );
}

function snippet(content: string): string {
  try {
    const p = JSON.parse(content);
    if (p && typeof p.body === "string") return p.body;
  } catch {
    // plain text
  }
  return content;
}

function Empty({ text }: { text: string }) {
  return <p className="text-[12px] text-gray-400">{text}</p>;
}

function PanelAction({ icon: Icon, label, onClick, href }: { icon: React.ComponentType<{ className?: string }>; label: string; onClick?: () => void; href?: string }) {
  const inner = (
    <>
      <span className="w-11 h-11 rounded-full bg-gray-50 border border-gray-100 flex items-center justify-center text-[#3B694C] group-hover:bg-[#EEF6F1]">
        <Icon className="w-4.5 h-4.5" />
      </span>
      <span className="text-[11px] text-gray-600">{label}</span>
    </>
  );
  return href ? (
    <Link href={href} className="group flex flex-col items-center gap-1">{inner}</Link>
  ) : (
    <button type="button" onClick={onClick} className="group flex flex-col items-center gap-1">{inner}</button>
  );
}

function PanelShell({ title, onClose, back, children }: { title: string; onClose: () => void; back?: () => void; children: React.ReactNode }) {
  return (
    <aside className="w-full md:w-[360px] lg:w-[380px] shrink-0 h-full flex flex-col bg-white border-l border-gray-100 relative z-10">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 shrink-0">
        <button type="button" onClick={back ?? onClose} title={back ? "Back" : "Close"} className="w-8 h-8 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100">
          {back ? <ArrowLeft className="w-4 h-4" /> : <X className="w-4 h-4" />}
        </button>
        <h3 className="text-[15px] font-semibold text-gray-900">{title}</h3>
      </div>
      {children}
    </aside>
  );
}
