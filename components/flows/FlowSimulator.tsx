"use client";

import { useEffect, useRef, useState } from "react";
import { RotateCcw, Send, X } from "lucide-react";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import type { FlowGraph, FlowNode, FlowOption, Template } from "@/types";

// A dry run of the flow being edited — unsaved changes included. It walks the
// graph with the same rules as the server's engine (utils/flowEngine.js) but
// sends nothing to WhatsApp and saves nothing: a safe way to click through
// every branch before a real campaign goes out.

type Item =
  | { kind: "bot"; text?: string; mediaType?: string; mediaUrl?: string; footer?: string; header?: string; buttons?: FlowOption[]; list?: { label: string; rows: FlowOption[] }; cards?: SimCard[] }
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
  | null;

const MAX_STEPS = 25;

function interpolate(text: string | undefined, name: string, answers: Record<string, string>): string {
  if (!text) return "";
  const vars: Record<string, string> = {
    first_name: name.split(" ")[0] || "there",
    customer_name: name || "there",
    name: name || "there",
    phone: "+971500000000",
    ...answers,
  };
  return text.replace(/\{\{\s*([a-z_][a-z0-9_]*)\s*\}\}/gi, (full, k: string) => vars[k.toLowerCase()] ?? full);
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
  const scrollRef = useRef<HTMLDivElement>(null);

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
          out.push({ kind: "bot", text: say(d.text), mediaType: d.mediaType, mediaUrl: d.mediaUrl, footer: d.footer, buttons: d.buttons });
          if (d.buttons && d.buttons.length) return { kind: "buttons", nodeId: n.id, options: d.buttons };
          id = next(n.id, "next");
          break;
        }
        case "list":
          out.push({ kind: "bot", text: say(d.text), header: d.header ? say(d.header) : undefined, footer: d.footer, list: { label: d.buttonLabel || "Options", rows: d.rows || [] } });
          return { kind: "list", nodeId: n.id, options: d.rows || [], label: d.buttonLabel || "Options" };
        case "carousel": {
          const tpl = templates.find((t) => t.id === d.templateId);
          const cards: SimCard[] = (d.cards || []).map((c, ci) => {
            const real = tpl?.cards?.[ci];
            return {
              label: c.label,
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
          out.push({ kind: "bot", text: tpl ? interpolate(tpl.body, name, ans) : undefined, cards });
          if (tpl && tpl.approvalStatus !== "APPROVED") {
            out.push({ kind: "event", text: `“${tpl.name}” isn't approved by Meta yet — for real customers this step would fail until it is.`, tone: "warn" });
          }
          if (cards.some((c) => c.taps.length)) return { kind: "carousel", nodeId: n.id };
          id = next(n.id, "next");
          break;
        }
        case "question":
          out.push({ kind: "bot", text: say(d.text) });
          return { kind: "question", nodeId: n.id };
        case "tag":
          out.push({ kind: "event", text: `Tag added to the customer: “${d.tag || "—"}”` });
          id = next(n.id, "next");
          break;
        case "assign":
          if (d.text) out.push({ kind: "bot", text: say(d.text) });
          out.push({ kind: "event", text: "Handed to an agent — the chat would now appear in their inbox. Automation stops.", tone: "end" });
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
    setItems((prev) => [...prev, ...out]);
    setWaiting(w);
    setAnswers(ans);
    onActiveNode?.(w && w.kind !== "start" ? w.nodeId : null);
  }

  function tapStart(option: FlowOption | null, typed?: string) {
    const out: Item[] = [{ kind: "user", text: option ? option.title : typed || "" }];
    const target = option ? next(trigger!.id, `btn:${option.id}`) : next(trigger!.id, "any");
    if (!target) {
      out.push({ kind: "event", text: option ? `Nothing is connected to “${option.title}” — this tap would just land in the inbox.` : "“Any other reply” isn't connected — a typed reply would just land in the inbox.", tone: "warn" });
      return settle(out, null, answers);
    }
    out.push({ kind: "event", text: option ? `Flow started from “${option.title}”` : "Flow started from a typed reply" });
    const ans = {};
    settle(out, walk(target, ans, out), ans);
  }

  function chooseCard(option: FlowOption, cardLabel: string) {
    if (!waiting || waiting.kind !== "carousel") return;
    const n = node(waiting.nodeId);
    if (!n) return;
    const [ci, bid] = option.id.split(".");
    const label = `${cardLabel} · ${option.title}`;
    const ans = { ...answers };
    if (n.data.variable) ans[n.data.variable] = label;
    const out: Item[] = [{ kind: "user", text: label }];
    if (n.data.variable) out.push({ kind: "event", text: `Saved ${n.data.variable} = “${label}”` });
    settle(out, walk(next(n.id, `card:${ci}:${bid}`), ans, out), ans);
  }

  function choose(option: FlowOption) {
    if (!waiting || (waiting.kind !== "buttons" && waiting.kind !== "list")) return;
    const n = node(waiting.nodeId);
    if (!n) return;
    const ans = { ...answers };
    if (n.data.variable) ans[n.data.variable] = option.title;
    const out: Item[] = [{ kind: "user", text: option.title }];
    if (n.data.variable) out.push({ kind: "event", text: `Saved ${n.data.variable} = “${option.title}”` });
    const handle = `${waiting.kind === "list" ? "row" : "btn"}:${option.id}`;
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
    setItems([]);
    setAnswers({});
    setInput("");
    setWaiting({ kind: "start" });
    onActiveNode?.(null);
  }

  const canType = waiting?.kind === "question" || (waiting?.kind === "start");
  const placeholder =
    waiting?.kind === "question" ? "Type the customer's answer…" : waiting?.kind === "start" ? "Or type a reply to the campaign…" : waiting ? "Waiting for a tap (typing goes to the inbox)" : "Flow finished — restart to try another path";

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
        <input value={name} onChange={(e) => setName(e.target.value)} className="flex-1 text-[12px] border border-gray-200 rounded-md px-2 py-1 focus:outline-none focus:border-[#3B694C]" />
      </div>

      {/* Phone */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-4 space-y-2.5 bg-[#ECE5DD]">
        {/* The campaign message that starts it all */}
        <div className="max-w-[85%]">
          <div className="bg-white rounded-xl rounded-tl-sm px-3 py-2 shadow-sm">
            <p className="text-[11px] font-semibold text-[#3B694C] mb-0.5">Campaign message</p>
            <p className="text-[13px] text-gray-500 italic">Your campaign template{startButtons.length ? " with its buttons" : ""}</p>
          </div>
          {startButtons.map((b) => (
            <button
              key={b.id}
              type="button"
              disabled={waiting?.kind !== "start"}
              onClick={() => tapStart(b)}
              className="mt-1 w-full bg-white rounded-xl py-2 text-[13px] font-medium text-[#3B694C] shadow-sm enabled:hover:bg-[#F5FAF7] disabled:opacity-50"
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
            const cls = it.tone === "warn" ? "bg-amber-50 text-amber-800 border-amber-200" : it.tone === "end" ? "bg-gray-800 text-white border-gray-800" : "bg-white/70 text-gray-600 border-white";
            return (
              <div key={i} className="flex justify-center">
                <span className={`text-[11px] rounded-lg border px-2.5 py-1 text-center max-w-[90%] ${cls}`}>{it.text}</span>
              </div>
            );
          }
          const active = i === items.length - 1 || items.slice(i + 1).every((x) => x.kind === "event");
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
                {it.text ? <p className="text-[13px] text-gray-800 whitespace-pre-wrap break-words">{it.text}</p> : null}
                {it.footer && <p className="text-[11px] text-gray-400 mt-1">{it.footer}</p>}
              </div>
              {it.buttons?.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  disabled={!active || waiting?.kind !== "buttons"}
                  onClick={() => choose(b)}
                  className="mt-1 w-full bg-white rounded-xl py-2 text-[13px] font-medium text-[#3B694C] shadow-sm enabled:hover:bg-[#F5FAF7] disabled:opacity-50"
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
                      <p className="px-2.5 pt-2 text-[12px] text-gray-800 whitespace-pre-wrap line-clamp-4">{c.body || c.label}</p>
                      <div className="p-1.5 space-y-1">
                        {c.taps.map((b) => (
                          <button
                            key={b.id}
                            type="button"
                            disabled={!active || waiting?.kind !== "carousel"}
                            onClick={() => chooseCard(b, c.label)}
                            className="w-full border border-gray-100 rounded-lg py-1.5 text-[12px] font-medium text-[#3B694C] enabled:hover:bg-[#F5FAF7] disabled:opacity-50"
                          >
                            {b.title}
                          </button>
                        ))}
                        {c.links.map((l, li) => (
                          <a key={li} href={l.url} target="_blank" rel="noreferrer" className="block w-full border border-gray-100 rounded-lg py-1.5 text-center text-[12px] font-medium text-[#3B694C] hover:bg-[#F5FAF7]">
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
                  <p className="py-2 text-center text-[13px] font-medium text-[#3B694C] border-b border-gray-100">☰ {it.list.label}</p>
                  {it.list.rows.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      disabled={!active || waiting?.kind !== "list"}
                      onClick={() => choose(r)}
                      className="w-full text-left px-3 py-2 border-b border-gray-50 last:border-0 enabled:hover:bg-[#F5FAF7] disabled:opacity-50"
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
          disabled={!waiting}
          placeholder={placeholder}
          className={`flex-1 text-[13px] border rounded-full px-3.5 py-2 focus:outline-none focus:border-[#3B694C] disabled:bg-gray-50 ${canType ? "border-gray-200" : "border-gray-100"}`}
        />
        <button type="submit" disabled={!waiting || !input.trim()} className="w-9 h-9 rounded-full bg-[#3B694C] text-white flex items-center justify-center disabled:opacity-40">
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}
