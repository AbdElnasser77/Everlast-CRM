"use client";

// "Test the assistant": ask what a patient might ask, in any language, and see
// exactly what the assistant would do — the reply, whether it would hand the
// chat over (and why), and which approved sources it used. Nothing is sent to
// anyone and nothing is saved.

import { useState } from "react";
import { AlertTriangle, BookOpen, Bot, Send, UserRound } from "lucide-react";
import { apiAskAssistant } from "@/lib/api";
import { AI_OUTCOME_LABEL, aiReasonLabel } from "@/lib/knowledge";
import type { AiAskResult, AiOutcome } from "@/types";
import { Spinner } from "@/components/ui/spinner";

const OUTCOME_TONE: Record<AiOutcome, string> = {
  ANSWERED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  HANDED_OFF: "bg-amber-50 text-amber-700 border-amber-200",
  URGENT: "bg-red-50 text-red-700 border-red-200",
  ERROR: "bg-gray-100 text-gray-600 border-gray-200",
};

export function AssistantTester({ aiConfigured }: { aiConfigured: boolean }) {
  const [question, setQuestion] = useState("");
  const [asked, setAsked] = useState("");
  const [result, setResult] = useState<AiAskResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiAskAssistant(q);
      setAsked(q);
      setResult(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The assistant couldn't answer");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl">
      <div className="px-5 py-4 border-b border-gray-100 flex items-start gap-3">
        <span className="w-9 h-9 rounded-full bg-brand-100 text-brand-fg flex items-center justify-center shrink-0">
          <Bot className="w-4.5 h-4.5" />
        </span>
        <div>
          <p className="text-[14px] font-bold text-gray-900">Test the assistant</p>
          <p className="text-[12px] text-gray-400 mt-0.5">
            Ask what a patient might ask, in English or Arabic. Only approved, searchable articles are used. Nothing is sent to anyone.
          </p>
        </div>
      </div>

      <div className="px-5 py-5 space-y-4">
        {!aiConfigured && (
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-[12px] text-amber-800">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            Cloudflare AI isn&apos;t configured on the server yet, so the assistant can&apos;t be tested.
          </div>
        )}

        <form onSubmit={ask} className="flex items-end gap-2">
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                ask(e);
              }
            }}
            dir="auto"
            rows={2}
            maxLength={2000}
            placeholder="e.g. How long is the downtime after Morpheus8?  /  كم مدة التعافي بعد الفيلر؟"
            disabled={!aiConfigured}
            className="flex-1 resize-none text-[14px] text-gray-800 border border-gray-200 rounded-xl px-4 py-3 outline-none placeholder:text-gray-400 bg-white focus:ring-2 focus:ring-brand/20 focus:border-brand transition-colors disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={busy || !question.trim() || !aiConfigured}
            title="Ask"
            className="h-[52px] w-[52px] shrink-0 rounded-xl bg-brand hover:bg-brand-strong text-white flex items-center justify-center transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? <Spinner size="sm" label="Asking" className="[&_svg]:text-white" /> : <Send className="w-4.5 h-4.5" />}
          </button>
        </form>

        {error && <p className="text-[13px] text-red-500 font-medium">{error}</p>}

        {result && (
          <div className="space-y-3">
            <div className="flex justify-start">
              <div className="max-w-[85%] flex items-start gap-2">
                <UserRound className="w-4 h-4 text-gray-400 mt-2 shrink-0" />
                <p dir="auto" className="text-[13px] text-gray-800 bg-gray-50 border border-gray-200 rounded-2xl rounded-tl-sm px-3.5 py-2 whitespace-pre-wrap">
                  {asked}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className={`text-[11px] font-semibold border rounded-full px-2.5 py-0.5 ${OUTCOME_TONE[result.outcome]}`}>
                {AI_OUTCOME_LABEL[result.outcome]}
              </span>
              {result.outcome !== "ANSWERED" && aiReasonLabel(result.reason) && (
                <span className="text-[12px] text-gray-600">{aiReasonLabel(result.reason)}</span>
              )}
              <span className="text-[11px] text-gray-400 ml-auto">
                {(result.latencyMs / 1000).toFixed(1)}s
                {result.usage.inputTokens + result.usage.outputTokens > 0 &&
                  ` · ${result.usage.inputTokens.toLocaleString()} in / ${result.usage.outputTokens.toLocaleString()} out tokens`}
              </span>
            </div>

            {result.reply && (
              <div className="flex justify-end">
                <div className="max-w-[85%]">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 text-right mb-1">
                    {result.outcome === "ANSWERED" ? "The patient would get" : "The patient would get (hand-over message)"}
                  </p>
                  <p dir="auto" className="text-[13px] text-gray-800 bg-[#E1E8F0] border border-[#C9D3DF] rounded-2xl rounded-tr-sm px-3.5 py-2 whitespace-pre-wrap">
                    {result.reply}
                  </p>
                </div>
              </div>
            )}

            {result.summary && result.outcome !== "ANSWERED" && (
              <p className="text-[12px] text-gray-600 bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2">
                <span className="font-semibold">Note for the team:</span> {result.summary}
              </p>
            )}

            {result.draft && (
              <details className="text-[12px] text-gray-500">
                <summary className="cursor-pointer select-none">The answer the safety check held back</summary>
                <p dir="auto" className="mt-1.5 whitespace-pre-wrap bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2">{result.draft}</p>
              </details>
            )}

            {result.error && <p className="text-[12px] text-red-500">The assistant failed: {result.error}</p>}

            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Sources used</p>
              {result.sources.length === 0 ? (
                <p className="text-[12px] text-gray-400">
                  {result.outcome === "URGENT" ? "None — red-flag words go straight to the team." : "No approved article matched."}
                </p>
              ) : (
                <ul className="space-y-1">
                  {result.sources.map((s, i) => (
                    <li key={i} className="flex items-center gap-2 text-[12px] text-gray-700">
                      <BookOpen className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                      <span className="truncate">
                        <span className="font-semibold">{s.title}</span> · {s.section}
                      </span>
                      <span className="ml-auto text-[11px] text-gray-400 tabular-nums">{s.score.toFixed(2)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {result.toolCalls.some((c) => c.name === "search_knowledge") && (
                <p className="text-[11px] text-gray-400 mt-1.5">
                  Searched again for:{" "}
                  {result.toolCalls
                    .filter((c) => c.name === "search_knowledge")
                    .map((c) => `"${String(c.args?.query ?? "")}"`)
                    .join(", ")}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
