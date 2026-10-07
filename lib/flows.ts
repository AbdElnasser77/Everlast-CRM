// Shared helpers for the flow builder. The server (utils/flowGraph.js) is the
// authority on what's valid; the limits here only drive counters and hints.
import type { FlowGraph, FlowNode, FlowNodeData, FlowNodeType, FlowOption, FlowRunStatus, Template, TemplateCard } from "@/types";

export const FLOW_LIMITS = {
  body: 1024,
  text: 4096,
  buttonTitle: 20,
  buttons: 3,
  listRows: 10,
  rowTitle: 24,
  rowDescription: 72,
  listButtonLabel: 20,
  header: 60,
  footer: 60,
};

export interface StepMeta {
  label: string;
  hint: string;
  color: string; // accent for the node header
}

export const STEP_META: Record<FlowNodeType, StepMeta> = {
  trigger: { label: "Start", hint: "When the customer taps a button on the campaign message", color: "#3B694C" },
  message: { label: "Message", hint: "Send text, an image or video, with up to 3 buttons", color: "#4F72A8" },
  list: { label: "List", hint: "A menu of up to 10 options", color: "#8C7BC0" },
  carousel: { label: "Carousel template", hint: "An approved carousel template (paid per send)", color: "#0E8C7A" },
  cards: { label: "Product cards", hint: "Swipeable cards with images and buttons — free in the chat window", color: "#D9466F" },
  question: { label: "Question", hint: "Ask something and save the answer (e.g. a booking date)", color: "#E2A33B" },
  tag: { label: "Tag", hint: "Add a tag to the customer", color: "#4AA7C2" },
  assign: { label: "Hand to agent", hint: "Assign the chat to a person — automation stops", color: "#C8475B" },
  end: { label: "End", hint: "Optionally send a last message, then stop", color: "#6B7280" },
};

/** Step types offered in the palette (the Start step is created with the flow). */
export const ADDABLE_STEPS: FlowNodeType[] = ["message", "list", "cards", "carousel", "question", "tag", "assign", "end"];

export const RUN_STATUS_META: Record<FlowRunStatus, { label: string; cls: string }> = {
  ACTIVE: { label: "In progress", cls: "bg-blue-50 text-blue-700" },
  COMPLETED: { label: "Completed", cls: "bg-green-50 text-green-700" },
  HANDED_OFF: { label: "Handed to agent", cls: "bg-amber-50 text-amber-700" },
  STOPPED: { label: "Stopped", cls: "bg-gray-100 text-gray-600" },
  EXPIRED: { label: "No answer (24h)", cls: "bg-gray-100 text-gray-500" },
  FAILED: { label: "Failed", cls: "bg-red-50 text-red-700" },
};

export const uid = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 8)}`;

export function defaultData(type: FlowNodeType): FlowNodeData {
  switch (type) {
    case "trigger":
      return { templateId: null, buttons: [] };
    case "message":
      return { text: "", mediaType: "NONE", buttons: [] };
    case "list":
      return { text: "", buttonLabel: "View options", rows: [{ id: uid("r"), title: "" }] };
    case "carousel":
      return { templateId: null, cards: [] };
    case "cards":
      return { text: "", cards: [newFlowCard(2), newFlowCard(2)] };
    case "question":
      return { text: "", inputType: "text", variable: "" };
    case "tag":
      return { tag: "" };
    case "assign":
      return { agentId: null, text: "Thanks! One of our team will be with you shortly." };
    case "end":
      return { text: "" };
  }
}

/** Output handles of a step, as [handleId, label] — mirrors flowGraph.handlesOf. */
export function outputsOf(type: FlowNodeType, data: FlowNodeData): [string, string][] {
  switch (type) {
    case "trigger":
      return [...(data.buttons || []).map((b): [string, string] => [`btn:${b.id}`, b.title || "Button"]), ["any", "Any other reply"]];
    case "message":
      return data.buttons && data.buttons.length
        ? data.buttons.map((b): [string, string] => [`btn:${b.id}`, b.title || "Button"])
        : [["next", "Then"]];
    case "list":
      return (data.rows || []).map((r): [string, string] => [`row:${r.id}`, r.title || "Option"]);
    case "carousel": {
      const taps = (data.cards || []).flatMap((c, i) =>
        c.buttons.map((b): [string, string] => [`card:${i}:${b.id}`, `${c.label ?? `Card ${i + 1}`} · ${b.title}`]),
      );
      return taps.length ? taps : [["next", "Then"]];
    }
    case "cards": {
      const taps = (data.cards || []).flatMap((c, i) =>
        c.buttons
          .filter((b) => b.type !== "URL")
          .map((b): [string, string] => [`card:${c.id}:${b.id}`, `${flowCardLabel(c, i)} · ${b.title || "Button"}`]),
      );
      return taps.length ? taps : [["next", "Then"]];
    }
    case "question":
      return [["next", "After a valid answer"]];
    case "tag":
      return [["next", "Then"]];
    default:
      return [];
  }
}

export function starterGraph(): FlowGraph {
  const start: FlowNode = { id: "start", type: "trigger", position: { x: 0, y: 120 }, data: defaultData("trigger") };
  return { nodes: [start], edges: [] };
}

/** A one-line description of a step for the canvas card. */
export function previewOf(node: { type: FlowNodeType; data: FlowNodeData }): string {
  const d = node.data;
  switch (node.type) {
    case "trigger":
      return d.buttons?.length ? `${d.buttons.length} template button${d.buttons.length > 1 ? "s" : ""}` : "Add the template's buttons";
    case "message":
    case "list":
    case "question":
      return d.text || "No text yet";
    case "carousel":
      return d.cards?.length ? `${d.cards.length} cards: ${d.cards.map((c) => c.label).join(", ")}` : "Choose a carousel template";
    case "cards":
      return d.cards?.length ? `${d.cards.length} cards: ${d.cards.map((c, i) => flowCardLabel(c, i)).join(", ")}` : "Add some cards";
    case "tag":
      return d.tag ? `Adds “${d.tag}”` : "No tag yet";
    case "assign":
      return d.agentId ? "To a specific agent" : "To the team (unassigned queue)";
    case "end":
      return d.text || "Ends silently";
  }
}

// ── Templates → flow ────────────────────────────────────────────────────────

/** A short name for a carousel card: the first line of its text. */
export function cardLabel(card: TemplateCard, index: number): string {
  const first = card.body.split("\n")[0].trim();
  return (first.length > 24 ? `${first.slice(0, 23)}…` : first) || `Card ${index + 1}`;
}

/** A carousel step's snapshot of a template: each card's label and quick replies. */
export function carouselSnapshot(t: Pick<Template, "cards">) {
  return (t.cards || []).map((c, i) => ({
    label: cardLabel(c, i),
    buttons: c.buttons.filter((b) => b.type === "QUICK_REPLY").map((b) => ({ id: b.id, title: b.title })),
  }));
}

/**
 * The taps a campaign template can start a flow with, as Start-step buttons.
 * A standard template: one per quick reply, matched by title. A carousel: one
 * per card quick reply, id c<card>_<button> — the server matches the tap's
 * payload to that id, because several cards usually share a title.
 */
export function templateStartButtons(t: Pick<Template, "buttons" | "cards">): FlowOption[] {
  if (t.cards && t.cards.length) {
    return t.cards.flatMap((c, i) =>
      c.buttons.filter((b) => b.type === "QUICK_REPLY").map((b) => ({ id: `c${i}_${b.id}`, title: `${cardLabel(c, i)} · ${b.title}` })),
    );
  }
  return (t.buttons || [])
    .filter((b) => (b.type || "QUICK_REPLY") === "QUICK_REPLY")
    .map((b) => ({ id: uid("b"), title: b.title }));
}

// ── Product cards (interactive carousel) ──────────────────────────────────
export const CARD_LIMITS = { min: 2, max: 10, body: 160, lineBreaks: 2, button: 20 };

/** A new card with `quickReplies` quick-reply buttons (or one link button when 0). */
export function newFlowCard(quickReplies: number): import("@/types").FlowCard {
  return {
    id: uid("card"),
    mediaType: "IMAGE",
    mediaUrl: "",
    body: "",
    buttons: quickReplies > 0
      ? Array.from({ length: quickReplies }, (_, j) => ({ id: `b${j}`, type: "QUICK_REPLY" as const, title: j === 0 ? "View offer" : "Book now" }))
      : [{ id: "b0", type: "URL" as const, title: "Shop now", url: "" }],
  };
}

/** The card's name: its first line without WhatsApp formatting. */
export function flowCardLabel(c: import("@/types").FlowCard, i: number): string {
  const first = (c.body || "").split("\n")[0].replace(/[*_~`]/g, "").trim();
  return first || c.label || `Card ${i + 1}`;
}

export const VARIABLE_RE = /^[a-z_][a-z0-9_]{0,39}$/;
export const BUILT_IN_VARIABLES = ["first_name", "customer_name", "phone"];
