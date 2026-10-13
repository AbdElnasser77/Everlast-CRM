"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarCheck2, CalendarPlus, CircleSlash, Hourglass, Loader2, UserRoundCheck } from "lucide-react";
import { apiGetConversationProfile } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import type { BookingRequest } from "@/types";
import { useCurrentUser } from "@/components/CurrentUserProvider";
import { personName, type ProfileWithOutcome } from "@/lib/chatOutcome";
import { isOpenRequest, onRequestChanged, requestAge, requestPreferred, requestService, requestSourceInfo } from "@/lib/bookingRequests";
import { useRequestActions } from "@/components/bookings/useRequestActions";

/**
 * "Booking requested · Laser · prefers Fri evening · from Anniversary campaign
 * · waiting 25m" — above the messages while this chat has an open request,
 * with Take it / Book / Couldn't book.
 */
export function BookingRequestBanner({ conversationId, patient }: { conversationId: string; patient?: string | null }) {
  const { can, me } = useCurrentUser();
  const canWork = can("conversation:write");
  const [loaded, setLoaded] = useState<{ id: string; requests: BookingRequest[] } | null>(null);
  const [reload, setReload] = useState(0);
  const actions = useRequestActions(() => setReload((n) => n + 1), patient);

  useEffect(() => {
    let cancelled = false;
    apiGetConversationProfile(conversationId)
      .then((res) => {
        if (cancelled) return;
        const requests = (res.data as unknown as ProfileWithOutcome).bookingRequests ?? [];
        setLoaded({ id: conversationId, requests });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [conversationId, reload]);

  // Ours (same tab) or a colleague's change, and the "waiting" age ticking on.
  useEffect(() => {
    const socket = getSocket();
    const onEvent = (p: { conversationId?: number | string }) => {
      if (String(p?.conversationId) === conversationId) setReload((n) => n + 1);
    };
    const events = ["booking_request.created", "booking_request.updated", "conversation.outcome"];
    events.forEach((e) => socket.on(e, onEvent));
    const off = onRequestChanged((id) => { if (id === conversationId) setReload((n) => n + 1); });
    const t = setInterval(() => setReload((n) => n + 1), 60_000);
    return () => {
      events.forEach((e) => socket.off(e, onEvent));
      off();
      clearInterval(t);
    };
  }, [conversationId]);

  const open = (loaded?.id === conversationId ? loaded.requests : [])
    .filter(isOpenRequest)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const req = open[0];
  if (!req) return actions.dialogs || null;

  const service = requestService(req);
  const preferred = requestPreferred(req);
  const age = requestAge(req);
  const mine = !!me && req.claimedById === me.id;
  const someoneElse = req.claimedById != null && !mine;
  const showTake = req.status === "NEW" || someoneElse;
  const claiming = actions.busy?.id === req.id && actions.busy.action === "claim";
  const src = requestSourceInfo(req);
  const bits = [
    service,
    preferred && `prefers ${preferred}`,
    src.tone === "proven" || src.tone === "confirmed" ? (src.campaign ? `from ${src.campaign.name} campaign` : src.text)
    : src.tone === "suggested" && src.campaign ? `maybe ${src.campaign.name} campaign (not confirmed)`
    : src.tone === "plain" ? `came via ${src.text}`
    : req.source === "FLOW" ? "via booking flow" : null,
  ].filter(Boolean) as string[];

  return (
    <div className="relative z-10 shrink-0 flex flex-wrap items-center gap-x-3 gap-y-2 px-4 md:px-5 py-2 bg-brand-50 border-b border-brand/15">
      <span className="w-7 h-7 rounded-full bg-brand-200 text-brand-fg flex items-center justify-center shrink-0">
        <CalendarPlus className="w-3.5 h-3.5" />
      </span>
      <div className="flex-1 min-w-[180px] text-[12.5px] leading-snug">
        <p className="text-gray-700 truncate" title={["Booking requested", ...bits].join(" · ")}>
          <Link href="/bookings" className="font-semibold text-brand-fg hover:underline">Booking requested</Link>
          {bits.map((b) => <span key={b}><span className="text-gray-300"> · </span>{b}</span>)}
          {open.length > 1 && <span className="text-gray-400"> · +{open.length - 1} more</span>}
        </p>
        <p className="text-[11.5px] text-gray-500 flex items-center gap-2 mt-0.5">
          {age && (
            <span className={`inline-flex items-center gap-1 font-semibold border rounded px-1.5 py-px tabular-nums ${age.tone}`}>
              <Hourglass className="w-3 h-3" /> waiting {age.label}
            </span>
          )}
          <span className="truncate">
            {mine ? "You're handling it" : req.claimedBy ? `${personName(req.claimedBy)} is handling it` : "Nobody has taken it yet"}
          </span>
        </p>
      </div>
      {canWork && (
        <div className="flex items-center gap-1.5 shrink-0">
          {showTake && (
            <button
              type="button"
              onClick={() => actions.claim(req)}
              disabled={claiming}
              className="h-8 inline-flex items-center gap-1.5 px-3 rounded-full text-[12px] font-semibold text-brand-fg bg-white border border-brand/30 hover:bg-brand-100 transition-colors cursor-pointer disabled:opacity-60"
            >
              {claiming ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserRoundCheck className="w-3.5 h-3.5" />}
              {someoneElse ? "Take over" : "Take it"}
            </button>
          )}
          <button
            type="button"
            onClick={() => actions.book(req)}
            className="h-8 inline-flex items-center gap-1.5 px-3 rounded-full text-[12px] font-semibold text-white bg-brand hover:bg-[#2f5840] transition-colors cursor-pointer"
          >
            <CalendarCheck2 className="w-3.5 h-3.5" /> Book
          </button>
          <button
            type="button"
            onClick={() => actions.notBooked(req)}
            title="Couldn't book"
            className="h-8 inline-flex items-center gap-1.5 px-3 rounded-full text-[12px] font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 transition-colors cursor-pointer"
          >
            <CircleSlash className="w-3.5 h-3.5 text-gray-400" /> <span className="hidden sm:inline">Couldn&apos;t book</span>
          </button>
        </div>
      )}
      {actions.dialogs}
    </div>
  );
}
