"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarCheck2, CalendarClock, CalendarPlus, Check, ChevronDown, CircleSlash, Eraser, Flag, Loader2, PhoneMissed } from "lucide-react";
import { apiCreateBookingRequest, apiGetConversationProfile, apiSetConversationOutcome } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import { useCurrentUser } from "@/components/CurrentUserProvider";
import { useToast } from "@/components/ui/toast";
import { Spinner } from "@/components/ui/spinner";
import type { Booking, ConversationOutcome, ConversationOutcomeState } from "@/types";
import {
  OUTCOME_CHIP, OUTCOME_LABEL, OVERDUE_CHIP, type ProfileWithOutcome,
  chipBooking, fmtWhen, isOverdue, toDateTimeInput,
} from "@/lib/chatOutcome";
import { isOpenRequest, notifyRequestChanged } from "@/lib/bookingRequests";
import { BookDialog } from "@/components/bookings/BookDialog";
import { NewRequestDialog } from "@/components/bookings/NewRequestDialog";

type OutcomeBody = Parameters<typeof apiSetConversationOutcome>[1];

const inputCls = "w-full border border-gray-200 rounded-lg px-2.5 py-2 text-[13px] outline-none focus:border-[#3B694C]";
const labelCls = "block text-[12px] font-semibold text-gray-500 mb-1";

/**
 * How this chat ended up — booked, follow up, not interested, no answer — and
 * the menu to record it. Sits beside the status and assignee controls.
 *
 * Reads the outcome from the inbox list row (kept live by the server's
 * `conversation.outcome` event, see useConversations). Our own change shows at
 * once from the server's answer, until the list catches up. A "Booked" chip
 * names the appointment, which isn't on the list row, so that comes from the
 * profile endpoint.
 */
export function ConversationOutcomeControl({
  conversationId,
  outcome,
  followUpAt,
}: {
  conversationId: string;
  outcome: ConversationOutcome | null;
  followUpAt: string | null;
}) {
  const { can } = useCurrentUser();
  const toast = useToast();
  const editable = can("conversation:write");
  const numericId = Number(conversationId);
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<"booked" | "follow_up" | "new_request" | null>(null);
  // What the chat's open booking request asked for, to prefill "Booked…".
  const [bookPrefill, setBookPrefill] = useState<{ requested: Record<string, unknown> | null; patient: string | null } | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [saving, setSaving] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Our own change, keyed by what the list said when we made it: once the list
  // says something else (it caught up, or a colleague changed it), the list wins.
  const listKey = `${conversationId}|${outcome}|${followUpAt}`;
  const [own, setOwn] = useState<{ key: string; state: ConversationOutcomeState } | null>(null);
  const mine = own && own.key === listKey ? own.state : null;
  const shownOutcome = mine ? mine.outcome : outcome;
  const shownFollowUp = mine ? mine.followUpAt : followUpAt;

  // The appointment behind a "Booked" chip. Refetched when the outcome changes
  // anywhere (a booking cancelled from the contact panel, a colleague's booking).
  const [booked, setBooked] = useState<{ id: string; booking: Booking | null } | null>(null);
  const [refetch, setRefetch] = useState(0);
  useEffect(() => {
    if (outcome !== "BOOKED") return;
    let cancelled = false;
    apiGetConversationProfile(conversationId)
      .then((res) => {
        if (cancelled) return;
        const bookings = (res.data as unknown as ProfileWithOutcome).bookings;
        setBooked({ id: conversationId, booking: chipBooking(bookings, numericId) });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [conversationId, numericId, outcome, refetch]);
  const booking = booked?.id === conversationId ? booked.booking : null;

  useEffect(() => {
    const socket = getSocket();
    const onOutcome = (p: { conversationId?: number | string }) => {
      if (String(p?.conversationId) === conversationId) setRefetch((n) => n + 1);
    };
    socket.on("conversation.outcome", onOutcome);
    return () => { socket.off("conversation.outcome", onOutcome); };
  }, [conversationId]);

  // A follow-up turns red the minute it falls due.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpen(false); triggerRef.current?.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  /** Saves; returns the server's refusal (shown by the caller) or null. */
  async function save(body: OutcomeBody, okMessage: string): Promise<string | null> {
    setOpen(false);
    setSaving(true);
    try {
      const res = await apiSetConversationOutcome(numericId, body);
      setOwn({ key: listKey, state: res.data });
      setBooked({ id: conversationId, booking: chipBooking(res.data.bookings, numericId) });
      setDialog(null);
      toast.success(okMessage);
      notifyRequestChanged(numericId);
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : "Couldn't save the outcome";
    } finally {
      setSaving(false);
    }
  }

  // "Booked…" goes through the chat's booking request (the server attaches it
  // to the open one, or opens one). Prefill from what the patient asked for.
  function openBooked() {
    setOpen(false);
    setPreparing(true);
    apiGetConversationProfile(conversationId)
      .then((res) => {
        const p = res.data as unknown as ProfileWithOutcome;
        const req = (p.bookingRequests ?? [])
          .filter(isOpenRequest)
          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0];
        setBookPrefill({ requested: req?.requested ?? null, patient: p.customer.name || null });
      })
      .catch(() => setBookPrefill({ requested: null, patient: null }))
      .finally(() => { setPreparing(false); setDialog("booked"); });
  }

  async function createRequest(body: Parameters<typeof apiCreateBookingRequest>[1]): Promise<string | null> {
    try {
      await apiCreateBookingRequest(numericId, body);
      setDialog(null);
      toast.success("Booking request opened — it's yours");
      notifyRequestChanged(numericId);
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : "Couldn't open the request";
    }
  }

  async function quick(body: OutcomeBody, okMessage: string) {
    const err = await save(body, okMessage);
    if (err) toast.error(err);
  }

  const overdue = shownOutcome === "FOLLOW_UP" && isOverdue(shownFollowUp, now);
  const when =
    shownOutcome === "BOOKED" && booking ? fmtWhen(booking.appointmentAt)
    : shownOutcome === "FOLLOW_UP" && shownFollowUp ? fmtWhen(shownFollowUp)
    : null;
  const label = shownOutcome ? (overdue ? "Follow up overdue" : OUTCOME_LABEL[shownOutcome]) : "Set outcome";
  const chipCls = shownOutcome
    ? `border ${overdue ? OVERDUE_CHIP : OUTCOME_CHIP[shownOutcome]}`
    : "border border-dashed border-gray-300 text-gray-500 hover:bg-gray-50";
  const Icon = shownOutcome === "BOOKED" ? Check
    : shownOutcome === "FOLLOW_UP" ? CalendarClock
    : shownOutcome === "NOT_INTERESTED" ? CircleSlash
    : shownOutcome === "NO_ANSWER" ? PhoneMissed
    : Flag;
  const title = shownOutcome ? `Outcome: ${label}${when ? ` · ${when}` : ""}` : "How did this chat end up?";

  const chipBody = (
    <>
      {saving || preparing ? <Spinner size="xs" label={preparing ? "Loading" : "Saving"} /> : <Icon className="w-3.5 h-3.5 shrink-0" />}
      <span className="truncate">
        {label}
        {when && <span className="hidden lg:inline font-normal"> · {when}</span>}
      </span>
    </>
  );

  // Read-only for anyone who can't work the chat — they still see the outcome.
  if (!editable) {
    if (!shownOutcome) return null;
    return (
      <span title={title} className={`hidden sm:inline-flex items-center gap-1.5 h-8 px-2.5 rounded-full text-[12px] font-medium max-w-[260px] ${chipCls}`}>
        {chipBody}
      </span>
    );
  }

  const item = "w-full flex items-center gap-2.5 px-3 py-2 text-left text-[13px] transition-colors";

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={saving || preparing}
        aria-haspopup="menu"
        aria-expanded={open}
        title={title}
        className={`flex items-center gap-1.5 h-8 pl-2.5 pr-2 rounded-full text-[12px] font-medium max-w-[280px] transition-colors cursor-pointer disabled:cursor-wait ${chipCls}`}
      >
        {chipBody}
        <ChevronDown className="w-3.5 h-3.5 opacity-60 shrink-0" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />
          <div role="menu" aria-label="Chat outcome" className="absolute right-0 top-10 z-[61] w-[220px] bg-white border border-gray-100 rounded-xl shadow-lg py-1.5">
            <p className="px-3 pt-1 pb-1 text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Outcome</p>
            <button type="button" role="menuitem" onClick={openBooked} className={`${item} text-[#3B694C] font-semibold hover:bg-[#EEF6F1]`}>
              <CalendarCheck2 className="w-4 h-4" /> <span className="flex-1">Booked…</span>
              {shownOutcome === "BOOKED" && <Check className="w-4 h-4 text-[#3B694C]" />}
            </button>
            <button type="button" role="menuitem" onClick={() => { setOpen(false); setDialog("follow_up"); }} className={`${item} text-gray-700 hover:bg-gray-50`}>
              <CalendarClock className="w-4 h-4 text-amber-600" /> <span className="flex-1">Follow up…</span>
              {shownOutcome === "FOLLOW_UP" && <Check className="w-4 h-4 text-[#3B694C]" />}
            </button>
            <button type="button" role="menuitem" onClick={() => quick({ outcome: "NOT_INTERESTED" }, "Marked as not interested")} className={`${item} text-gray-700 hover:bg-gray-50`}>
              <CircleSlash className="w-4 h-4 text-gray-400" /> <span className="flex-1">Not interested</span>
              {shownOutcome === "NOT_INTERESTED" && <Check className="w-4 h-4 text-[#3B694C]" />}
            </button>
            <button type="button" role="menuitem" onClick={() => quick({ outcome: "NO_ANSWER" }, "Marked as no answer")} className={`${item} text-gray-700 hover:bg-gray-50`}>
              <PhoneMissed className="w-4 h-4 text-gray-400" /> <span className="flex-1">No answer</span>
              {shownOutcome === "NO_ANSWER" && <Check className="w-4 h-4 text-[#3B694C]" />}
            </button>
            <div className="border-t border-gray-100 mt-1.5 pt-1.5">
              <p className="px-3 pt-1 pb-1 text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Booking</p>
              <button type="button" role="menuitem" onClick={() => { setOpen(false); setDialog("new_request"); }} className={`${item} text-gray-700 hover:bg-gray-50`}>
                <CalendarPlus className="w-4 h-4 text-[#3B694C]" /> <span className="flex-1">New booking request…</span>
              </button>
            </div>
            {shownOutcome && (
              <div className="border-t border-gray-100 mt-1.5 pt-1.5">
                <button type="button" role="menuitem" onClick={() => quick({ outcome: null }, "Outcome cleared")} className={`${item} text-gray-500 hover:bg-gray-50`}>
                  <Eraser className="w-4 h-4" /> Clear
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {dialog === "booked" && (
        <BookDialog
          requested={bookPrefill?.requested}
          patient={bookPrefill?.patient}
          onCancel={() => setDialog(null)}
          onSave={(appointments) =>
            save(
              { outcome: "BOOKED", appointments },
              appointments.length > 1 ? `${appointments.length} appointments booked` : `Booked for ${fmtWhen(appointments[0].appointmentAt)}`,
            )
          }
        />
      )}
      {dialog === "new_request" && (
        <NewRequestDialog onCancel={() => setDialog(null)} onSave={createRequest} />
      )}
      {dialog === "follow_up" && (
        <FollowUpDialog
          saving={saving}
          current={shownOutcome === "FOLLOW_UP" ? shownFollowUp : null}
          onCancel={() => setDialog(null)}
          onSave={(followUpAt) => save({ outcome: "FOLLOW_UP", followUpAt }, `Follow-up set for ${fmtWhen(followUpAt)}`)}
        />
      )}
    </div>
  );
}

// ── Dialogs ────────────────────────────────────────────────────────────────

function Dialog({ title, intro, onCancel, saving, children }: {
  title: string; intro: string; onCancel: () => void; saving: boolean; children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !saving) onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, saving]);

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-black/40 flex items-center justify-center px-4" onClick={() => !saving && onCancel()}>
      <div role="dialog" aria-modal="true" aria-label={title} className="bg-white rounded-2xl shadow-2xl w-[420px] max-w-full p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-[15px] font-bold text-gray-900 mb-1.5">{title}</h3>
        <p className="text-[13px] text-gray-500 mb-4">{intro}</p>
        {children}
      </div>
    </div>,
    document.body,
  );
}

function DialogButtons({ saving, onCancel, label }: { saving: boolean; onCancel: () => void; label: string }) {
  return (
    <div className="flex justify-end gap-2 pt-1">
      <button type="button" onClick={onCancel} disabled={saving} className="px-4 py-2 rounded-xl text-[13px] font-medium text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer disabled:opacity-50">
        Cancel
      </button>
      <button type="submit" disabled={saving} className="px-4 py-2 rounded-xl text-[13px] font-semibold text-white bg-[#3B694C] hover:bg-[#2f5840] transition-colors cursor-pointer disabled:opacity-60 flex items-center gap-1.5">
        {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
        {label}
      </button>
    </div>
  );
}

// Quick picks for when to get back to the patient.
function followUpPicks(): { label: string; at: Date }[] {
  const now = new Date();
  const inHour = new Date(now.getTime() + 60 * 60_000);
  inHour.setSeconds(0, 0);
  const at10 = (days: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + days);
    d.setHours(10, 0, 0, 0);
    return d;
  };
  return [
    { label: "In 1 hour", at: inHour },
    { label: "Tomorrow 10:00", at: at10(1) },
    { label: "In 3 days", at: at10(3) },
  ];
}

/** When someone should get back to this patient. */
function FollowUpDialog({ saving, current, onCancel, onSave }: {
  saving: boolean;
  current: string | null;
  onCancel: () => void;
  onSave: (followUpAt: string) => Promise<string | null>;
}) {
  const [picks] = useState(followUpPicks);
  const [value, setValue] = useState(() =>
    current && new Date(current).getTime() > Date.now() ? toDateTimeInput(new Date(current)) : toDateTimeInput(picks[1].at),
  );
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const d = new Date(value);
    if (!value || Number.isNaN(d.getTime())) return setError("Pick when to follow up.");
    if (d.getTime() < Date.now()) return setError("That time has already passed — pick a time in the future.");
    setError(null);
    const err = await onSave(d.toISOString());
    if (err) setError(err);
  }

  return (
    <Dialog title="Follow up later" intro="Set when to get back to this patient. It turns red in the inbox once it's due." onCancel={onCancel} saving={saving}>
      <form onSubmit={submit} className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {picks.map((p) => {
            const v = toDateTimeInput(p.at);
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => { setValue(v); setError(null); }}
                className={`text-[12px] px-2.5 py-1 rounded-full border transition-colors cursor-pointer ${value === v ? "bg-[#DCF2E3] border-[#3B694C] text-[#3B694C] font-semibold" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
        <label className="block">
          <span className={labelCls}>Follow up on</span>
          <input type="datetime-local" required value={value} onChange={(e) => setValue(e.target.value)} className={inputCls} />
        </label>
        {value && !Number.isNaN(new Date(value).getTime()) && (
          <p className="text-[12px] text-gray-400">{fmtWhen(new Date(value).toISOString())}</p>
        )}
        {error && <p className="text-[13px] text-red-500 font-medium">{error}</p>}
        <DialogButtons saving={saving} onCancel={onCancel} label="Set follow-up" />
      </form>
    </Dialog>
  );
}
