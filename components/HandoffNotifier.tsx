"use client";

// Alerts the team when a flow hands a customer to a person ("Connect me" /
// an Assign step). The server sends "flow.handoff" to every connected user who
// can reply on that number, whichever line they're viewing. Shown as:
//   - an alert card that stays until dismissed (a waiting customer shouldn't
//     vanish after five seconds like a toast),
//   - a short chime,
//   - a desktop notification when allowed, for when the CRM is in a background tab.
// "Open chat" switches to the conversation's number first when needed.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BellRing, X } from "lucide-react";
import { getSocket } from "@/lib/socket";
import { useCurrentUser } from "@/components/CurrentUserProvider";
import { useActiveNumber } from "@/components/WhatsAppNumberProvider";

interface Handoff {
  conversationId: number;
  whatsappNumberId: number;
  customerName: string | null;
  customerPhone: string;
  flowName: string;
  interest: string | null;
  agentId: number | null;
  agentUsername: string | null;
  at: string;
}

function chime() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [880, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.type = "sine";
      const t = ctx.currentTime + i * 0.18;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.4);
    });
    setTimeout(() => ctx.close().catch(() => {}), 1000);
  } catch {
    // Audio is a nicety; some browsers block it until the page is clicked.
  }
}

const who = (h: Handoff) => h.customerName || `+${h.customerPhone}`;

export default function HandoffNotifier() {
  const router = useRouter();
  const { me } = useCurrentUser();
  const { activeNumberId, switchNumber } = useActiveNumber();
  const [alerts, setAlerts] = useState<Handoff[]>([]);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(() =>
    typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported",
  );

  const dismiss = useCallback((conversationId: number) => {
    setAlerts((list) => list.filter((a) => a.conversationId !== conversationId));
  }, []);

  const openChat = useCallback((h: Handoff) => {
    dismiss(h.conversationId);
    const go = () => router.push(`/chats/${h.conversationId}`);
    if (String(h.whatsappNumberId) !== activeNumberId) {
      switchNumber(h.whatsappNumberId);
      setTimeout(go, 450); // after the switch has re-scoped the app
    } else {
      go();
    }
  }, [activeNumberId, dismiss, router, switchNumber]);

  useEffect(() => {
    const socket = getSocket();
    const onHandoff = (h: Handoff) => {
      // Assigned to someone else: that person gets it, not the whole team.
      if (h.agentId && me && h.agentId !== me.id) return;
      setAlerts((list) => [h, ...list.filter((a) => a.conversationId !== h.conversationId)].slice(0, 5));
      chime();
      if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
        const n = new Notification(`${who(h)} wants to talk to an agent`, {
          body: h.interest ? `Interested in: ${h.interest}` : `From the "${h.flowName}" flow`,
          tag: `handoff-${h.conversationId}`,
        });
        n.onclick = () => { window.focus(); openChat(h); n.close(); };
      }
    };
    socket.on("flow.handoff", onHandoff);
    return () => { socket.off("flow.handoff", onHandoff); };
  }, [me, openChat]);

  if (alerts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[9998] w-[340px] max-w-[calc(100vw-2rem)] space-y-2">
      {alerts.map((h) => (
        <div key={h.conversationId} className="bg-white rounded-2xl shadow-xl border border-amber-200 overflow-hidden animate-in slide-in-from-bottom-2">
          <div className="flex items-start gap-3 p-4">
            <span className="w-9 h-9 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
              <BellRing className="w-4.5 h-4.5" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-bold text-gray-900 leading-snug">
                {who(h)} wants to talk to an agent
              </p>
              {h.interest && <p className="text-[12px] text-gray-600 mt-0.5">Interested in: <span className="font-semibold">{h.interest}</span></p>}
              <p className="text-[11px] text-gray-400 mt-0.5">
                {h.agentUsername ? `Assigned to you · ` : "Waiting in Unassigned · "}
                {h.flowName} · {new Date(h.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
            <button type="button" onClick={() => dismiss(h.conversationId)} title="Dismiss" className="w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-600 shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-center gap-2 px-4 pb-3">
            <button type="button" onClick={() => openChat(h)} className="flex-1 text-[13px] font-semibold text-white bg-[#3B694C] hover:bg-[#2f5840] rounded-xl py-2">
              Open chat
            </button>
            {permission === "default" && (
              <button
                type="button"
                onClick={() => Notification.requestPermission().then(setPermission)}
                className="text-[12px] font-medium text-gray-500 hover:text-gray-800 px-2"
              >
                Enable desktop alerts
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
