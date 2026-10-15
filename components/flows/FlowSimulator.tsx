"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, RotateCcw, Send, X } from "lucide-react";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import type { ClinicDay, FlowGraph, FlowNode, FlowOption, Template } from "@/types";
import { SLOT_DEFAULTS, flowCardLabel } from "@/lib/flows";
import { apiCheckSlot, apiGetAvailabilityDay, apiGetAvailableDays, apiParsePatientWhen } from "@/lib/api";
import { WaText } from "@/components/templates/shared";

// A dry run of the flow being edited — unsaved changes included. It walks the
// graph with the same rules as the server's engine (utils/flowEngine.js) but
// sends nothing to WhatsApp and saves nothing: a safe way to click through
// every branch before a real campaign goes out.

type Item =
  | { kind: "bot"; nodeId?: string; text?: string; mediaType?: string; mediaUrl?: string; footer?: string; header?: string; buttons?: FlowOption[]; list?: { label: string; rows: FlowOption[] }; cards?: SimCard[] }
  | { kind: "user"; text: string }
  | { kind: "event"; text: string; tone?: "info" | "warn" | "end" };

type SimCard = {
  label: string;
  body?: string;
  mediaType?: string;
  mediaUrl?: string;
  // id is "<cardIndex>.<buttonId>" for quick replies; links just show.
  taps: FlowOption[];
  links: { title: string; url?: string }[];
};

type Waiting =
  | { kind: "start" }
  | { kind: "carousel"; nodeId: string }
  | { kind: "buttons"; nodeId: string; options: FlowOption[] }
  | { kind: "list"; nodeId: string; options: FlowOption[]; label: string }
  | { kind: "question"; nodeId: string }
  // Pick appointment: "loading" while the clinic system is asked.
  | { kind: "slot"; nodeId: string; phase: SlotPhase; date?: string; misses: number }
  | null;

type SlotPhase = "loading" | "day" | "time" | "fallback_date" | "fallback_time";
type SlotWaiting = Extract<NonNullable<Waiting>, { kind: "slot" }>;
type SlotAction = { kind: "enter" } | { kind: "tap"; option: FlowOption } | { kind: "text"; text: string };
type SlotResult = "park" | "done";

const MAX_STEPS = 25;

// ── Pick appointment — the server's rules (flowEngine.js slotAdvance), with
// the real free days and times from the clinic system. ──
const SLOT_ROWS = 10;
const MAX_SLOT_MISSES = 3;
const PLAIN_TIME_RE = /^\d{1,2}([:.]\d{2})?\s*(am|pm|a\.m\.|p\.m\.)?$/i;
const DAY_PARTS = [
  { id: "morning", title: "🌅 Morning", has: (t: string) => t < "12:00" },
  { id: "afternoon", title: "☀️ Afternoon", has: (t: string) => t >= "12:00" && t < "17:00" },
  { id: "evening", title: "🌙 Evening", has: (t: string) => t >= "17:00" },
];
const ANOTHER_DAY: FlowOption = { id: "days", title: "📅 Another day" };

/** "16:30" → "4:30 PM" */
function fmtSlotTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

const dayLabel = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });

function spread<T>(list: T[], n: number): T[] {
  if (list.length <= n) return list;
  return Array.from({ length: n }, (_, i) => list[Math.round((i * (list.length - 1)) / (n - 1))]);
}

// The clinic system didn't answer — the step falls back, as on the server.
class ClinicDown extends Error {}
async function clinic<T>(call: Promise<{ data: T }>): Promise<T> {
  try {
    return (await call).data;
  } catch (err) {
    throw new ClinicDown(err instanceof Error ? err.message : "unavailable");
  }
}

function interpolate(text: string | undefined, name: string, answers: Record<string, string>): string {
  if (!text) return "";
  const vars: Record<string, string> = {
    first_name: name.split(" ")[0] || "there",
    customer_name: name || "there",
    name: name || "there",
    phone: "+971500000000",
    ...answers,
  };
  return text.replace(/\{\{\s*([a-z_][a-z0-9_]*)\s*\}\}/gi, (full, k: string) => {
    const v = vars[k.toLowerCase()];
    if (v === undefined) return full;
    // Same as the server: a collected date reads as "15 Oct 2026".
    return /^\d{4}-\d{2}-\d{2}$/.test(v)
      ? new Date(`${v}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
      : v;
  });
}

// Same rules as the server's parseAnswer.
function parseAnswer(type: string | undefined, raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  switch (type) {
    case "number": {
      const n = v.replace(/,/g, "");
      return /^-?\d+(\.\d+)?$/.test(n) ? n : null;
    }
    case "email":
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v.toLowerCase() : null;
    case "phone": {
      const p = parsePhoneNumberFromString(v, "AE");
      return p && p.isValid() ? p.number : null;
    }
    case "date": {
      let m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(v);
      let y: number, mo: number, d: number;
      if (m) { d = +m[1]; mo = +m[2]; y = +m[3]; }
      else if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(v))) { y = +m[1]; mo = +m[2]; d = +m[3]; }
      else return null;
      const dt = new Date(Date.UTC(y, mo - 1, d));
      if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
      return dt.toISOString().slice(0, 10);
    }
    default:
      return v;
  }
}

const RETRY: Record<string, string> = {
  number: "Please reply with a number.",
  email: "That doesn't look like an email address — please try again.",
  phone: "Please send a valid phone number.",
  date: "Please send the date as DD/MM/YYYY.",
  text: "Please type your answer.",
};

export function FlowSimulator({
  graph,
  templates = [],
  onClose,
  onActiveNode,
}: {
  graph: FlowGraph;
  /** For showing a carousel step's real cards (image, text, links). */
  templates?: Template[];
  onClose: () => void;
  /** The step the run is parked on, so the canvas can highlight it. */
  onActiveNode?: (id: string | null) => void;
}) {
  const [name, setName] = useState("Sara Ahmed");
  const [items, setItems] = useState<Item[]>([]);
  const [waiting, setWaiting] = useState<Waiting>({ kind: "start" });
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [input, setInput] = useState("");
  // After a hand-off the bot stays out: old buttons go to the agent.
  const [handedOff, setHandedOff] = useState(false);
  const handedOffRef = useRef(false); // set while walking, applied in settle()
  const scrollRef = useRef<HTMLDivElement>(null);
  const genRef = useRef(0);

  const trigger = graph.nodes.find((n) => n.type === "trigger");
  const startButtons = trigger?.data.buttons || [];
  const hasAny = graph.edges.some((e) => e.source === trigger?.id && e.sourceHandle === "any");

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [items]);

  const node = (id: string | null) => (id ? graph.nodes.find((n) => n.id === id) ?? null : null);
  const next = (id: string, handle: string) =>
    graph.edges.find((e) => e.source === id && (e.sourceHandle || "next") === handle)?.target ?? null;

  // Execute from a step until something waits for the customer, or the run ends.
  function walk(startId: string | null, ans: Record<string, string>, out: Item[]): Waiting {
    let id = startId;
    for (let i = 0; i < MAX_STEPS; i++) {
      const n: FlowNode | null = node(id);
      if (!n) {
        out.push({ kind: "event", text: "Flow ended — nothing is connected after this point.", tone: "end" });
        return null;
      }
      const d = n.data;
      const say = (t?: string) => interpolate(t, name, ans);
      switch (n.type) {
        case "message": {
          out.push({ kind: "bot", nodeId: n.id, text: say(d.text), mediaType: d.mediaType, mediaUrl: d.mediaUrl, footer: d.footer, buttons: d.buttons });
          if (d.buttons && d.buttons.length) return { kind: "buttons", nodeId: n.id, options: d.buttons };
          id = next(n.id, "next");
          break;
        }
        case "list":
          out.push({ kind: "bot", nodeId: n.id, text: say(d.text), header: d.header ? say(d.header) : undefined, footer: d.footer, list: { label: d.buttonLabel || "Options", rows: d.rows || [] } });
          return { kind: "list", nodeId: n.id, options: d.rows || [], label: d.buttonLabel || "Options" };
        case "carousel": {
          const tpl = templates.find((t) => t.id === d.templateId);
          const cards: SimCard[] = (d.cards || []).map((c, ci) => {
            const real = tpl?.cards?.[ci];
            return {
              label: c.label ?? `Card ${ci + 1}`,
              body: real?.body,
              mediaType: real?.mediaType,
              mediaUrl: real?.mediaUrl,
              taps: c.buttons.map((b) => ({ id: `${ci}.${b.id}`, title: b.title })),
              links: (real?.buttons || []).filter((b) => b.type === "URL").map((b) => ({ title: b.title, url: b.url })),
            };
          });
          if (!cards.length) {
            out.push({ kind: "event", text: "This Carousel step has no template chosen.", tone: "warn" });
            return null;
          }
          out.push({ kind: "bot", nodeId: n.id, text: tpl ? interpolate(tpl.body, name, ans) : undefined, cards });
          if (tpl && tpl.approvalStatus !== "APPROVED") {
            out.push({ kind: "event", text: `“${tpl.name}” isn't approved by Meta yet — for real customers this step would fail until it is.`, tone: "warn" });
          }
          if (cards.some((c) => c.taps.length)) return { kind: "carousel", nodeId: n.id };
          id = next(n.id, "next");
          break;
        }
        case "cards": {
          const cards: SimCard[] = (d.cards || []).map((c, ci) => ({
            label: flowCardLabel(c, ci),
            body: c.body ? say(c.body) : undefined,
            mediaType: c.mediaType,
            mediaUrl: c.mediaUrl,
            taps: c.buttons.filter((b) => b.type !== "URL").map((b) => ({ id: `${c.id}.${b.id}`, title: b.title })),
            links: c.buttons.filter((b) => b.type === "URL").map((b) => ({ title: b.title, url: b.url })),
          }));
          out.push({ kind: "bot", nodeId: n.id, text: say(d.text), cards });
          if (cards.some((c) => c.taps.length)) return { kind: "carousel", nodeId: n.id };
          id = next(n.id, "next");
          break;
        }
        case "question":
          out.push({ kind: "bot", text: say(d.text) });
          return { kind: "question", nodeId: n.id };
        case "slot_picker":
          // Carries on in slotMove once the clinic system answers (see settle).
          return { kind: "slot", nodeId: n.id, phase: "loading", misses: 0 };
        case "tag":
          out.push({ kind: "event", text: `Tag added to the customer: “${d.tag || "—"}”` });
          id = next(n.id, "next");
          break;
        case "assign":
          if (d.text) out.push({ kind: "bot", text: say(d.text) });
          out.push({ kind: "event", text: "Handed to an agent — the chat would now appear in their inbox. Automation stops; older buttons now go to the agent too.", tone: "end" });
          handedOffRef.current = true;
          return null;
        case "end":
          if (d.text) out.push({ kind: "bot", text: say(d.text) });
          out.push({ kind: "event", text: "Flow completed.", tone: "end" });
          return null;
        default:
          return null;
      }
    }
    out.push({ kind: "event", text: `Stopped after ${MAX_STEPS} steps without waiting for the customer — the flow probably loops.`, tone: "warn" });
    return null;
  }

  function settle(out: Item[], w: Waiting, ans: Record<string, string>) {
    if (handedOffRef.current) {
      handedOffRef.current = false;
      setHandedOff(true);
    }
    setItems((prev) => [...prev, ...out]);
    setWaiting(w);
    setAnswers(ans);
    onActiveNode?.(w && w.kind !== "start" ? w.nodeId : null);
    if (w?.kind === "slot" && w.phase === "loading") void slotMove(w, ans, { kind: "enter" });
  }

  // One move of a Pick appointment step (the server's slotAdvance).
  async function slotMove(w0: SlotWaiting, ans0: Record<string, string>, action: SlotAction) {
    const n = node(w0.nodeId);
    if (!n) return;
    const gen = genRef.current;
    const d = n.data;
    const ans = { ...ans0 };
    const out: Item[] = [];
    if (action.kind === "tap") {
      out.push({ kind: "user", text: action.option.title });
      jumpNote(n.id, out);
    }
    if (action.kind === "text") out.push({ kind: "user", text: action.text });
    const fresh = action.kind === "enter" || w0.phase === "loading";
    const st: { phase: SlotPhase; date?: string; misses: number } = fresh ? { phase: "day", misses: 0 } : { phase: w0.phase, date: w0.date, misses: w0.misses };
    setWaiting({ kind: "slot", nodeId: n.id, phase: "loading", misses: st.misses });
    let chosenDate = st.phase === "time" ? st.date : undefined;

    const text = (key: keyof typeof SLOT_DEFAULTS, extra: Record<string, string> = {}) =>
      interpolate((d[key] as string | undefined) || SLOT_DEFAULTS[key], name, { ...ans, ...extra });
    const bot = (it: Omit<Extract<Item, { kind: "bot" }>, "kind" | "nodeId">) => out.push({ kind: "bot", nodeId: n.id, ...it });

    const done = (vals: Record<string, string>): SlotResult => {
      delete ans.slot_status;
      delete ans.slot_label;
      Object.assign(ans, vals);
      // Unchecked answers get a readable label too, as on the server.
      if (!ans.slot_label && !ans.slot_status) {
        const day = ans.preferred_date;
        const time = ans.preferred_time;
        const label = [day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? dayLabel(day) : day, time && /^\d{2}:\d{2}$/.test(time) ? fmtSlotTime(time) : time].filter(Boolean);
        if (label.length) ans.slot_label = label.join(", ");
      }
      const saved = [...Object.keys(vals), ...(ans.slot_label && !vals.slot_label ? ["slot_label"] : [])];
      out.push({ kind: "event", text: `Saved ${saved.map((k) => `${k} = “${ans[k]}”`).join(", ")}` });
      return "done";
    };
    const askFallbackDay = (): SlotResult => {
      st.phase = "fallback_date";
      bot({ text: text("fallbackDayText") });
      return "park";
    };
    const askFallbackTime = (): SlotResult => {
      st.phase = "fallback_time";
      bot({ text: text("fallbackTimeText") });
      return "park";
    };

    const showDays = async (intro?: string): Promise<SlotResult> => {
      const days = await clinic(apiGetAvailableDays(SLOT_ROWS));
      if (!days.length) {
        bot({ text: text("noSlotsText") });
        return done({ slot_status: "NONE_AVAILABLE", slot_checked: "false" });
      }
      st.phase = "day";
      st.date = undefined;
      bot({
        text: intro ? `${intro}\n\nHere are the nearest available days — pick one below, or type a date (e.g. 25 Oct).` : text("dayText"),
        list: {
          label: "Choose a day",
          rows: days.slice(0, SLOT_ROWS).map((day) => ({
            id: `d.${day.date}`,
            title: day.label,
            description: `${day.slots.length} time${day.slots.length === 1 ? "" : "s"} available`,
          })),
        },
      });
      return "park";
    };
    const notOpen = (day: ClinicDay, lead = "") => showDays(`${lead}${day.message || ""}`.trim());
    const getDay = (date: string) => clinic(apiGetAvailabilityDay(date));

    const showTimes = (day: ClinicDay, lead?: string, part?: string): SlotResult => {
      st.phase = "time";
      st.date = day.date;
      const parts = DAY_PARTS.filter((p) => day.slots.some(p.has));
      const inPart = part ? day.slots.filter(DAY_PARTS.find((p) => p.id === part)?.has ?? (() => true)) : day.slots;
      // Too many for one list: the part of the day first.
      if (inPart.length > SLOT_ROWS - 1 && !part && parts.length > 1) {
        const body = `${lead ? `${lead} ` : ""}🕒 ${day.label} has plenty of free times. Which part of the day suits you?`;
        const options = parts.map((p) => {
          const times = day.slots.filter(p.has);
          return { id: `p.${day.date}.${p.id}`, title: p.title, description: `${times.length} times · ${fmtSlotTime(times[0])} – ${fmtSlotTime(times[times.length - 1])}` };
        });
        // Buttons while "Another day" still fits beside them, else a list.
        if (parts.length < 3) bot({ text: body, buttons: [...options.map(({ id, title }) => ({ id, title })), ANOTHER_DAY] });
        else bot({ text: body, list: { label: "Choose", rows: [...options, ANOTHER_DAY] } });
        return "park";
      }
      bot({
        text: lead ? `${lead}\n\nHere are the free times on ${day.label} — pick one below, or type a time.` : text("timeText", { day: day.label }),
        list: { label: "Choose a time", rows: [...spread(inPart, SLOT_ROWS - 1).map((t) => ({ id: `t.${day.date}.${t}`, title: fmtSlotTime(t) })), ANOTHER_DAY] },
      });
      return "park";
    };

    // The final check, right when the time is chosen.
    const pickTime = async (date: string, time: string, known?: ClinicDay): Promise<SlotResult> => {
      const day = known ?? (await getDay(date));
      const listed = day.status === "OPEN" && day.slots.includes(time);
      if (!listed || !(await clinic(apiCheckSlot(date, time))).free) {
        const now = listed ? await getDay(date) : day;
        if (now.status === "PAST") return notOpen(now);
        const left = now.status === "OPEN" ? now.slots.filter((t) => t !== time) : [];
        if (!left.length) return now.status === "OPEN" ? showDays("That time was just taken 😕") : notOpen(now, "That time was just taken 😕 ");
        return showTimes({ ...now, slots: left }, "That time was just taken 😕");
      }
      return done({ preferred_date: date, preferred_time: time, slot_checked: "true", slot_label: `${day.label}, ${fmtSlotTime(time)}` });
    };

    // An answer it can't use. After MAX_SLOT_MISSES, their words as they are.
    const miss = async (raw: string, retry: () => Promise<SlotResult> | SlotResult): Promise<SlotResult> => {
      st.misses += 1;
      if (st.misses < MAX_SLOT_MISSES) return retry();
      out.push({ kind: "event", text: `${MAX_SLOT_MISSES} answers it couldn't use — taking what they typed as it is.`, tone: "warn" });
      if (st.phase === "time" && st.date) return done({ preferred_date: st.date, preferred_time: raw, slot_checked: "false" });
      ans.preferred_date = raw;
      ans.slot_checked = "false";
      return askFallbackTime();
    };

    const move = async (): Promise<SlotResult> => {
      if (action.kind === "enter") return showDays();
      if (action.kind === "tap") {
        const id = action.option.id;
        st.misses = 0;
        if (id === "days") return showDays();
        const [kind, date, rest] = id.split(".");
        chosenDate = date;
        if (kind === "d" || kind === "p") {
          const day = await getDay(date);
          if (day.status !== "OPEN") return notOpen(day);
          return showTimes(day, undefined, kind === "p" ? rest : undefined);
        }
        return pickTime(date, rest);
      }
      const raw = action.text.trim().slice(0, 500);
      if (st.phase === "fallback_date") {
        ans.preferred_date = raw;
        ans.slot_checked = "false";
        return askFallbackTime();
      }
      if (st.phase === "fallback_time") return done({ preferred_time: raw, slot_checked: "false" });
      const parsed = await clinic(apiParsePatientWhen(raw));
      if (st.phase === "time" && st.date) {
        // A date instead: they'd rather another day ("20 Oct" also reads as 20:00).
        const otherDate = PLAIN_TIME_RE.test(raw) ? null : parsed.date;
        if (otherDate) {
          chosenDate = otherDate;
          const day = await getDay(otherDate);
          if (day.status !== "OPEN") return miss(raw, () => notOpen(day));
          st.misses = 0;
          return showTimes(day);
        }
        const day = await getDay(st.date);
        if (day.status !== "OPEN") return notOpen(day);
        const time = parsed.time;
        if (!time) return miss(raw, () => showTimes(day, "Sorry, I didn't catch that time."));
        if (!day.slots.includes(time)) return miss(raw, () => showTimes(day, `Sorry, ${fmtSlotTime(time)} isn't available on ${day.label}.`));
        return pickTime(day.date, time, day);
      }
      if (!parsed.date) return miss(raw, () => showDays("Sorry, I didn't catch that date."));
      chosenDate = parsed.date;
      const day = await getDay(parsed.date);
      if (day.status !== "OPEN") return miss(raw, () => notOpen(day));
      st.misses = 0;
      return showTimes(day);
    };

    let result: SlotResult;
    try {
      result = await move();
    } catch (err) {
      if (!(err instanceof ClinicDown)) throw err;
      out.push({ kind: "event", text: `The clinic system didn't answer (${err.message}) — a real patient gets plain questions instead, saved as typed.`, tone: "warn" });
      if (chosenDate) {
        ans.preferred_date = chosenDate;
        ans.slot_checked = "false";
        result = askFallbackTime();
      } else {
        result = askFallbackDay();
      }
    }

    if (gen !== genRef.current) return; // restarted meanwhile
    if (result === "done") settle(out, walk(next(n.id, "next"), ans, out), ans);
    else settle(out, { kind: "slot", nodeId: n.id, phase: st.phase, date: st.date, misses: st.misses }, ans);
  }

  function tapStart(option: FlowOption | null, typed?: string) {
    const out: Item[] = [{ kind: "user", text: option ? option.title : typed || "" }];
    const target = option ? next(trigger!.id, `btn:${option.id}`) : next(trigger!.id, "any");
    if (!target) {
      out.push({ kind: "event", text: option ? `Nothing is connected to “${option.title}” — this tap would just land in the inbox.` : "“Any other reply” isn't connected — a typed reply would just land in the inbox.", tone: "warn" });
      return settle(out, null, answers);
    }
    out.push({ kind: "event", text: option ? `Flow started from “${option.title}”` : "Flow started from a typed reply" });
    setHandedOff(false);
    const ans = {};
    settle(out, walk(target, ans, out), ans);
  }

  // A tap on an EARLIER message: jump there (same visit), or start a fresh
  // visit from it if this one ended. Never after a hand-off.
  function jumpNote(nodeId: string, out: Item[]) {
    if (waiting && waiting.kind !== "start" && waiting.nodeId === nodeId) return;
    out.push({
      kind: "event",
      text: waiting ? "Tapped an earlier message — jumping there." : "Tapped an earlier message after the visit ended — starting a fresh visit from it.",
    });
  }

  function chooseCard(option: FlowOption, cardLabel: string, nodeId: string) {
    if (handedOff) return;
    const n = node(nodeId);
    if (!n) return;
    const dot = option.id.lastIndexOf(".");
    const ci = option.id.slice(0, dot);
    const bid = option.id.slice(dot + 1);
    const label = `${cardLabel} · ${option.title}`;
    // Product cards save the product; a carousel template saves card · button.
    const saved = n.type === "cards" ? cardLabel : label;
    const ans = { ...answers };
    if (n.data.variable) ans[n.data.variable] = saved;
    const out: Item[] = [{ kind: "user", text: label }];
    jumpNote(n.id, out);
    if (n.data.variable) out.push({ kind: "event", text: `Saved ${n.data.variable} = “${saved}”` });
    settle(out, walk(next(n.id, `card:${ci}:${bid}`), ans, out), ans);
  }

  function choose(option: FlowOption, nodeId: string) {
    if (handedOff) return;
    const n = node(nodeId);
    if (!n) return;
    if (n.type === "slot_picker") {
      if (waiting?.kind === "slot" && waiting.phase === "loading") return;
      // A tap says what it means (a day, a time…), so an older list works too.
      const w: SlotWaiting = waiting?.kind === "slot" && waiting.nodeId === n.id ? waiting : { kind: "slot", nodeId: n.id, phase: "day", misses: 0 };
      void slotMove(w, answers, { kind: "tap", option });
      return;
    }
    const ans = { ...answers };
    if (n.data.variable) ans[n.data.variable] = option.title;
    const out: Item[] = [{ kind: "user", text: option.title }];
    jumpNote(n.id, out);
    if (n.data.variable) out.push({ kind: "event", text: `Saved ${n.data.variable} = “${option.title}”` });
    const handle = `${n.type === "list" ? "row" : "btn"}:${option.id}`;
    settle(out, walk(next(n.id, handle), ans, out), ans);
  }

  function sendText() {
    const text = input.trim();
    if (!text || !waiting) return;
    setInput("");
    if (waiting.kind === "start") {
      if (!hasAny) {
        setItems((p) => [...p, { kind: "user", text }, { kind: "event", text: "A typed reply doesn't start this flow (“Any other reply” isn't connected). An agent would see it in the inbox.", tone: "warn" }]);
        return;
      }
      return tapStart(null, text);
    }
    if (waiting.kind === "slot") {
      if (waiting.phase !== "loading") void slotMove(waiting, answers, { kind: "text", text });
      return;
    }
    if (waiting.kind !== "question") {
      setItems((p) => [...p, { kind: "user", text }, { kind: "event", text: "The flow is waiting for a button tap — typed text goes to the agents in the inbox and the flow keeps waiting.", tone: "warn" }]);
      return;
    }
    const n = node(waiting.nodeId);
    if (!n) return;
    const value = parseAnswer(n.data.inputType, text);
    if (value === null) {
      setItems((p) => [...p, { kind: "user", text }, { kind: "bot", text: n.data.errorText || RETRY[n.data.inputType || "text"] || RETRY.text }]);
      return;
    }
    const ans = { ...answers, [n.data.variable || "answer"]: value };
    const out: Item[] = [{ kind: "user", text }, { kind: "event", text: `Saved ${n.data.variable} = “${value}”` }];
    settle(out, walk(next(n.id, "next"), ans, out), ans);
  }

  function restart() {
    genRef.current += 1; // drops a Pick appointment answer still on its way
    setItems([]);
    setAnswers({});
    setInput("");
    setWaiting({ kind: "start" });
    setHandedOff(false);
    onActiveNode?.(null);
  }

  const slotLoading = waiting?.kind === "slot" && waiting.phase === "loading";
  const canType = waiting?.kind === "question" || waiting?.kind === "start" || (waiting?.kind === "slot" && !slotLoading);
  const placeholder =
    waiting?.kind === "question" ? "Type the customer's answer…"
    : slotLoading ? "Checking the clinic system…"
    : waiting?.kind === "slot" ? "Tap a day or time, or type one (e.g. tomorrow, 4:30 pm)…"
    : waiting?.kind === "start" ? "Or type a reply to the campaign…" : waiting ? "Waiting for a tap (typing goes to the inbox)" : "Flow finished — restart to try another path";

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
        <div className="min-w-0">
          <p className="text-[14px] font-bold text-gray-900">Test this flow</p>
          <p className="text-[11px] text-gray-400">Dry run — nothing is sent or saved</p>
        </div>
        <button type="button" onClick={restart} title="Start over" className="ml-auto w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-50">
          <RotateCcw className="w-4 h-4" />
        </button>
        <button type="button" onClick={onClose} title="Close test" className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-50">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="px-4 py-2 border-b border-gray-100 flex items-center gap-2">
        <span className="text-[11px] text-gray-400 shrink-0">Test as</span>
        <input value={name} onChange={(e) => setName(e.target.value)} className="flex-1 text-[12px] border border-gray-200 rounded-md px-2 py-1 focus:outline-none focus:border-brand" />
      </div>

      {/* Phone */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-4 space-y-2.5 bg-[#ECE5DD]">
        {/* The campaign message that starts it all */}
        <div className="max-w-[85%]">
          <div className="bg-white rounded-xl rounded-tl-sm px-3 py-2 shadow-sm">
            <p className="text-[11px] font-semibold text-brand-fg mb-0.5">Campaign message</p>
            <p className="text-[13px] text-gray-500 italic">Your campaign template{startButtons.length ? " with its buttons" : ""}</p>
          </div>
          {startButtons.map((b) => (
            <button
              key={b.id}
              type="button"
              disabled={waiting?.kind !== "start"}
              onClick={() => tapStart(b)}
              className="mt-1 w-full bg-white rounded-xl py-2 text-[13px] font-medium text-brand-fg shadow-sm enabled:hover:bg-brand-50 disabled:opacity-50"
            >
              {b.title || "Button"}
            </button>
          ))}
          {startButtons.length === 0 && (
            <p className="text-[11px] text-amber-700 mt-1">Add the template&apos;s buttons to the Start step to test them.</p>
          )}
        </div>

        {items.map((it, i) => {
          if (it.kind === "user") {
            return (
              <div key={i} className="flex justify-end">
                <div className="max-w-[80%] bg-[#DCF8C6] rounded-xl rounded-tr-sm px-3 py-2 text-[13px] text-gray-800 shadow-sm whitespace-pre-wrap">{it.text}</div>
              </div>
            );
          }
          if (it.kind === "event") {
            const cls = it.tone === "warn" ? "bg-amber-50 text-amber-800 border-amber-200" : it.tone === "end" ? "bg-gray-800 text-white dark:text-gray-50 border-gray-800" : "bg-white/70 text-gray-600 border-white";
            return (
              <div key={i} className="flex justify-center">
                <span className={`text-[11px] rounded-lg border px-2.5 py-1 text-center max-w-[90%] ${cls}`}>{it.text}</span>
              </div>
            );
          }
          const nodeId = it.nodeId || "";
          return (
            <div key={i} className="max-w-[85%]">
              <div className="bg-white rounded-xl rounded-tl-sm px-3 py-2 shadow-sm">
                {it.mediaType && it.mediaType !== "NONE" && (
                  it.mediaType === "IMAGE" && it.mediaUrl
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={it.mediaUrl} alt="" className="w-full max-h-40 object-cover rounded-lg mb-1.5" />
                    : <div className="bg-gray-100 rounded-lg px-2 py-3 mb-1.5 text-[12px] text-gray-500">{it.mediaType === "VIDEO" ? "▶ Video" : "📄 Document"}</div>
                )}
                {it.header && <p className="text-[13px] font-bold text-gray-900 mb-0.5">{it.header}</p>}
                {it.text ? <p className="text-[13px] text-gray-800 whitespace-pre-wrap break-words"><WaText text={it.text} /></p> : null}
                {it.footer && <p className="text-[11px] text-gray-400 mt-1">{it.footer}</p>}
              </div>
              {it.buttons?.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  disabled={handedOff}
                  onClick={() => choose(b, nodeId)}
                  className="mt-1 w-full bg-white rounded-xl py-2 text-[13px] font-medium text-brand-fg shadow-sm enabled:hover:bg-brand-50 disabled:opacity-50"
                >
                  {b.title || "Button"}
                </button>
              ))}
              {it.cards && (
                <div className="mt-1 -mx-1 flex gap-2 overflow-x-auto pb-1 snap-x">
                  {it.cards.map((c, ci) => (
                    <div key={ci} className="snap-start shrink-0 w-[180px] bg-white rounded-xl shadow-sm overflow-hidden">
                      {c.mediaType === "VIDEO"
                        ? <div className="h-24 bg-gray-100 flex items-center justify-center text-[12px] text-gray-500">▶ Video</div>
                        : c.mediaUrl
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={c.mediaUrl} alt="" className="w-full h-24 object-cover" />
                          : <div className="h-24 bg-gray-100" />}
                      <p className="px-2.5 pt-2 text-[12px] text-gray-800 whitespace-pre-wrap line-clamp-4"><WaText text={c.body || c.label} /></p>
                      <div className="p-1.5 space-y-1">
                        {c.taps.map((b) => (
                          <button
                            key={b.id}
                            type="button"
                            disabled={handedOff}
                            onClick={() => chooseCard(b, c.label, nodeId)}
                            className="w-full border border-gray-100 rounded-lg py-1.5 text-[12px] font-medium text-brand-fg enabled:hover:bg-brand-50 disabled:opacity-50"
                          >
                            {b.title}
                          </button>
                        ))}
                        {c.links.map((l, li) => (
                          <a key={li} href={l.url} target="_blank" rel="noreferrer" className="block w-full border border-gray-100 rounded-lg py-1.5 text-center text-[12px] font-medium text-brand-fg hover:bg-brand-50">
                            🔗 {l.title}
                          </a>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {it.list && (
                <div className="mt-1 bg-white rounded-xl shadow-sm overflow-hidden">
                  <p className="py-2 text-center text-[13px] font-medium text-brand-fg border-b border-gray-100">☰ {it.list.label}</p>
                  {it.list.rows.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      disabled={handedOff}
                      onClick={() => choose(r, nodeId)}
                      className="w-full text-left px-3 py-2 border-b border-gray-50 last:border-0 enabled:hover:bg-brand-50 disabled:opacity-50"
                    >
                      <span className="block text-[13px] text-gray-800">{r.title || "Option"}</span>
                      {r.description && <span className="block text-[11px] text-gray-400">{r.description}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {slotLoading && (
          <div className="flex justify-center">
            <span className="inline-flex items-center gap-1.5 text-[11px] rounded-lg border border-white bg-white/70 text-gray-600 px-2.5 py-1">
              <Loader2 className="w-3 h-3 animate-spin" /> Checking free times in the clinic system…
            </span>
          </div>
        )}
      </div>

      {Object.keys(answers).length > 0 && (
        <div className="px-4 py-2 border-t border-gray-100 bg-gray-50">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Saved to Responses</p>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(answers).map(([k, v]) => (
              <span key={k} className="text-[11px] bg-white border border-gray-200 rounded-md px-1.5 py-0.5"><span className="font-mono text-gray-400">{k}</span> {v}</span>
            ))}
          </div>
        </div>
      )}

      <form
        onSubmit={(e) => { e.preventDefault(); sendText(); }}
        className="flex items-center gap-2 px-3 py-2.5 border-t border-gray-100"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={!waiting || slotLoading}
          placeholder={placeholder}
          className={`flex-1 text-[13px] border rounded-full px-3.5 py-2 focus:outline-none focus:border-brand disabled:bg-gray-50 ${canType ? "border-gray-200" : "border-gray-100"}`}
        />
        <button type="submit" disabled={!waiting || slotLoading || !input.trim()} className="w-9 h-9 rounded-full bg-brand text-white flex items-center justify-center disabled:opacity-40">
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}
