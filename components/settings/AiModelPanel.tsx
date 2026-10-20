"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { CheckCircle2, AlertTriangle, XCircle, RefreshCw, KeyRound, Search, Wrench } from "lucide-react";
import {
  apiGetSettings,
  apiSaveAiProvider,
  apiTestAiConnection,
  apiGetAiModels,
  apiStartReindexKnowledge,
  apiGetReindexStatus,
} from "@/lib/api";
import type {
  AiProviderSetting,
  AiProviderBehaviour,
  AiProviderSave,
  AiStatus,
  AiCatalogModel,
  AiTestResult,
  AiReindexStatus,
} from "@/types";
import { useToast } from "@/components/ui/toast";
import { PageSpinner } from "@/components/ui/spinner";
import {
  LoadError,
  SectionCard,
  errorMessage,
  inputCls,
  labelCls,
  primaryBtnCls,
  secondaryBtnCls,
} from "@/components/settings/shared";

// Settings → AI assistant → AI model & Cloudflare: which Cloudflare account and
// models the assistant uses, and the numbers that shape its answers. Applies
// on save — no restart. The API token is write-only: the server only ever says
// whether one exists and its last four characters.

type BehaviourKey = keyof AiProviderBehaviour;
type BehaviourForm = Record<BehaviourKey, string>;

interface Form {
  accountId: string;
  chatModel: string;
  embedModel: string;
  behaviour: BehaviourForm;
}

const EMBED_DIMS = 1024;

// Grouped as the page shows them, each with what it does.
const GROUPS: { title: string; description: string; fields: { key: BehaviourKey; label: string; help: string; step: string; optional?: boolean }[] }[] = [
  {
    title: "Answer style",
    description: "How the model writes.",
    fields: [
      { key: "temperature", label: "Temperature", step: "0.05", help: "Lower = steadier, more literal answers; higher = more varied wording. 0.2–0.4 suits a clinic." },
      { key: "maxOutputTokens", label: "Max reply tokens", step: "1", help: "The most the model may write per call, including any hidden reasoning. Too low cuts answers off." },
      { key: "topP", label: "Top P (optional)", step: "0.05", optional: true, help: "Another way to limit randomness. Leave blank to use the model's default." },
    ],
  },
  {
    title: "Conversation",
    description: "When the assistant answers, and how much it reads.",
    fields: [
      { key: "debounceSeconds", label: "Wait before replying (seconds)", step: "1", help: "Patients often send several messages in a row; the assistant waits this long after the last one and answers them together." },
      { key: "historyMessages", label: "History messages", step: "1", help: "How many recent messages of the chat the model sees. More context costs more and is slower." },
      { key: "maxReplyChars", label: "Max reply length (characters)", step: "1", help: "A longer answer is held back and the chat goes to the team instead." },
    ],
  },
  {
    title: "Knowledge search",
    description: "How the assistant finds approved answers.",
    fields: [
      { key: "retrievalTopK", label: "Results per question", step: "1", help: "How many knowledge-base passages are given to the model for each question." },
      { key: "similarityThreshold", label: "Similarity threshold", step: "0.01", help: "How close a passage must be to count. Raise it if unrelated sources show up; lower it if good questions find nothing." },
      { key: "maxExtraSearches", label: "Extra searches", step: "1", help: "Searches the model may run itself, with better wording, when the first results don't answer the question." },
      { key: "maxToolRounds", label: "Tool rounds", step: "1", help: "Model calls that may use tools before the assistant gives up and hands the chat to the team." },
    ],
  },
  {
    title: "Reliability",
    description: "",
    fields: [
      { key: "requestTimeoutSeconds", label: "Request timeout (seconds)", step: "1", help: "How long to wait for Cloudflare before giving up (one retry follows). The message then simply waits in the inbox." },
    ],
  },
];

const BEHAVIOUR_KEYS = GROUPS.flatMap((g) => g.fields.map((f) => f.key));

const toBehaviourForm = (v: AiProviderBehaviour): BehaviourForm =>
  Object.fromEntries(BEHAVIOUR_KEYS.map((k) => [k, v[k] === null || v[k] === undefined ? "" : String(v[k])])) as BehaviourForm;

const formFrom = (v: AiProviderSetting): Form => ({
  accountId: v.accountId,
  chatModel: v.chatModel || v.effective.chatModel,
  embedModel: v.embedModel || v.effective.embedModel,
  behaviour: toBehaviourForm(v),
});

const sourceLabel = (s: string | null) => (s === "settings" ? "from settings" : s === "env" ? "from config.env" : s === "default" ? "built-in default" : "");

const isEmbedding = (m: AiCatalogModel) => /embed/i.test(m.task);

const formatCtx = (n: number | null) => (n == null ? null : n >= 1000 ? `${Math.round(n / 1000)}K context` : `${n} context`);

// ---------------------------------------------------------------------------
// Model picker: a searchable list from the catalog, plus a custom ID field.
// ---------------------------------------------------------------------------

function ModelPicker({
  models,
  value,
  onChange,
  label,
  placeholder,
}: {
  models: AiCatalogModel[];
  value: string;
  onChange: (id: string) => void;
  label: string;
  placeholder: string;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = q ? models.filter((m) => m.id.toLowerCase().includes(q) || m.description.toLowerCase().includes(q)) : models;
  const inCatalog = models.some((m) => m.id === value);

  return (
    <div>
      <label className={labelCls}>{label}</label>
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-3 border-b border-gray-100">
          <Search className="w-4 h-4 text-gray-400 shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${models.length} model${models.length === 1 ? "" : "s"}…`}
            aria-label={`Search ${label.toLowerCase()}`}
            className="w-full text-[13px] text-gray-800 bg-transparent py-2.5 outline-none placeholder:text-gray-400"
          />
        </div>
        <ul role="listbox" aria-label={label} className="max-h-56 overflow-y-auto divide-y divide-gray-100">
          {shown.length === 0 && <li className="px-3 py-3 text-[12px] text-gray-400">No model matches “{query}”.</li>}
          {shown.map((m) => {
            const selected = m.id === value;
            return (
              <li key={m.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => onChange(m.id)}
                  className={`w-full text-left px-3 py-2 transition-colors cursor-pointer ${selected ? "bg-brand-100" : "hover:bg-gray-50"}`}
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`text-[13px] font-mono break-all ${selected ? "text-brand-fg font-semibold" : "text-gray-800"}`}>{m.id}</span>
                    {m.functionCalling && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-1.5 py-px">
                        <Wrench className="w-2.5 h-2.5" /> tools ✓
                      </span>
                    )}
                    {formatCtx(m.contextWindow) && (
                      <span className="text-[10px] font-medium text-gray-500 bg-gray-100 rounded-full px-1.5 py-px">{formatCtx(m.contextWindow)}</span>
                    )}
                    {m.beta && <span className="text-[10px] font-medium text-amber-700 bg-amber-50 rounded-full px-1.5 py-px">beta</span>}
                    {m.deprecated && <span className="text-[10px] font-medium text-red-600 bg-red-50 rounded-full px-1.5 py-px">deprecated</span>}
                  </div>
                  {m.description && <p className="text-[11px] text-gray-400 mt-0.5 line-clamp-2">{m.description}</p>}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="mt-2">
        <label className="block text-[12px] font-medium text-gray-500 mb-1">Custom model ID</label>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value.trim())}
          placeholder={placeholder}
          spellCheck={false}
          className={`${inputCls} font-mono text-[13px] py-2`}
        />
        {value && !inCatalog && models.length > 0 && (
          <p className="text-[11px] text-amber-700 mt-1">Not in the list — check the ID with “Test connection” before saving.</p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export function AiModelPanel() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [view, setView] = useState<AiProviderSetting | null>(null);
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [form, setForm] = useState<Form | null>(null);

  // Token editing: "keep" shows the saved one; "replace" shows the input.
  const [tokenMode, setTokenMode] = useState<"keep" | "replace">("keep");
  const [tokenInput, setTokenInput] = useState("");

  const [models, setModels] = useState<AiCatalogModel[]>([]);
  const [catalog, setCatalog] = useState<{ source: "cloudflare" | "fallback"; error: string | null; fetchedAt: string | null } | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<AiTestResult | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  const [reindex, setReindex] = useState<AiReindexStatus | null>(null);
  const [polling, setPolling] = useState(false);
  const mounted = useRef(true);

  const applyView = useCallback((v: AiProviderSetting) => {
    setView(v);
    setForm(formFrom(v));
    setTokenMode(v.hasToken ? "keep" : "replace");
    setTokenInput("");
  }, []);

  const refreshStatus = useCallback(() => {
    return apiGetSettings()
      .then((res) => {
        if (!mounted.current) return;
        setStatus(res.data.aiStatus);
        setView(res.data.aiProvider);
      })
      .catch(() => {});
  }, []);

  // (The Reload button sets catalogLoading itself; the first load starts with it on.)
  const loadModels = useCallback((refresh = false) => {
    return apiGetAiModels(refresh)
      .then((res) => {
        if (!mounted.current) return;
        setModels(res.data);
        setCatalog({ source: res.source, error: res.error, fetchedAt: res.fetchedAt });
      })
      .catch((err) => {
        if (!mounted.current) return;
        setCatalog({ source: "fallback", error: errorMessage(err, "Couldn't load the model list."), fetchedAt: null });
      })
      .finally(() => mounted.current && setCatalogLoading(false));
  }, []);

  const load = useCallback(() => {
    return apiGetSettings()
      .then((res) => {
        applyView(res.data.aiProvider);
        setStatus(res.data.aiStatus);
        if (res.data.aiStatus.reindex?.running) {
          setReindex(res.data.aiStatus.reindex);
          setPolling(true);
        }
        setLoadError(null);
      })
      .catch((err) => setLoadError(errorMessage(err, "Couldn't load the AI model settings.")))
      .finally(() => setLoading(false));
  }, [applyView]);

  useEffect(() => {
    mounted.current = true;
    load();
    loadModels();
    return () => {
      mounted.current = false;
    };
  }, [load, loadModels]);

  // Re-index progress, while one runs.
  useEffect(() => {
    if (!polling) return;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      apiGetReindexStatus()
        .then((res) => {
          if (!mounted.current) return;
          setReindex(res.data);
          if (res.data.running) timer = setTimeout(tick, 1500);
          else {
            setPolling(false);
            refreshStatus();
          }
        })
        .catch(() => {
          if (mounted.current) timer = setTimeout(tick, 4000);
        });
    };
    timer = setTimeout(tick, 800);
    return () => clearTimeout(timer);
  }, [polling, refreshStatus]);

  const chatModels = useMemo(() => models.filter((m) => !isEmbedding(m)), [models]);
  const embedModels = useMemo(() => models.filter(isEmbedding), [models]);

  if (loading) return <PageSpinner label="Loading AI model settings" />;
  if (loadError || !form || !view) {
    return <LoadError message={loadError || "No data"} onRetry={() => { setLoading(true); load(); }} />;
  }

  const setField = <K extends keyof Omit<Form, "behaviour">>(key: K, value: Form[K]) => setForm((f) => (f ? { ...f, [key]: value } : f));
  const setNum = (key: BehaviourKey, value: string) => setForm((f) => (f ? { ...f, behaviour: { ...f.behaviour, [key]: value } } : f));

  const embedChanged = form.embedModel.trim() !== view.effective.embedModel;
  const replacingToken = tokenMode === "replace" && tokenInput.trim() !== "";

  function resetBehaviour() {
    if (!view) return;
    setForm((f) => (f ? { ...f, behaviour: toBehaviourForm(view.defaults) } : f));
  }

  async function handleTest() {
    if (!form) return;
    setTesting(true);
    setTest(null);
    setTestError(null);
    try {
      const res = await apiTestAiConnection({
        accountId: form.accountId.trim(),
        ...(replacingToken ? { apiToken: tokenInput.trim() } : {}),
        chatModel: form.chatModel.trim(),
        embedModel: form.embedModel.trim(),
        requestTimeoutSeconds: form.behaviour.requestTimeoutSeconds,
      });
      setTest(res.data);
    } catch (err) {
      setTestError(errorMessage(err, "The test couldn't run."));
    } finally {
      setTesting(false);
    }
  }

  async function handleSave(removeToken = false) {
    if (!form || !view) return;
    if (embedChanged && !removeToken) {
      const ok = window.confirm(
        `Change the embedding model to ${form.embedModel}?\n\nThe whole knowledge base will be re-indexed with it. Until that finishes the assistant can't find any article and hands questions to the team.`,
      );
      if (!ok) return;
    }
    if (removeToken && !window.confirm("Remove the saved API token? The assistant stops unless CLOUDFLARE_AI_TOKEN is set in config.env.")) return;

    // Blank stays blank ("") so the server answers with which field and range;
    // a blank Top P means "model default".
    const behaviour = {} as Record<BehaviourKey, number | string | null>;
    for (const k of BEHAVIOUR_KEYS) {
      const raw = form.behaviour[k].trim();
      behaviour[k] = raw === "" ? (k === "topP" ? null : "") : Number(raw);
    }

    const payload: AiProviderSave = {
      accountId: form.accountId.trim(),
      chatModel: form.chatModel.trim(),
      embedModel: form.embedModel.trim(),
      ...behaviour,
      ...(replacingToken && !removeToken ? { apiToken: tokenInput.trim() } : {}),
      ...(removeToken ? { removeToken: true } : {}),
    };

    setSaving(true);
    setError(null);
    try {
      const res = await apiSaveAiProvider(payload);
      applyView(res.data);
      setTest(null);
      toast.success(removeToken ? "API token removed" : "AI model settings saved");
      if (res.reindexing) {
        toast.success("Re-indexing the knowledge base with the new embedding model");
        setPolling(true);
      }
      refreshStatus();
    } catch (err) {
      setError(errorMessage(err, "Failed to save the AI model settings"));
    } finally {
      setSaving(false);
    }
  }

  async function handleReindex() {
    try {
      const res = await apiStartReindexKnowledge();
      setReindex(res.data);
      setPolling(true);
      if (res.alreadyRunning) toast.success("A re-index is already running — showing its progress");
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't start the re-index"));
    }
  }

  const configured = Boolean(status?.configured);
  const reindexRunning = Boolean(reindex?.running);

  return (
    <div className="space-y-5">
      {/* Status line */}
      <div className={`flex items-start gap-3 rounded-2xl border px-5 py-4 ${configured ? "bg-white border-gray-200" : "bg-amber-50 border-amber-200"}`}>
        {configured ? <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" /> : <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />}
        <div className="text-[13px] min-w-0">
          <p className="font-semibold text-gray-800">{configured ? "Configured ✓" : "Not configured ✗ — add the account ID and API token below"}</p>
          <p className="text-[12px] text-gray-500 mt-0.5 break-words">
            Chat <span className="font-mono">{status?.chatModel}</span> · Embeddings <span className="font-mono">{status?.embedModel}</span>
          </p>
          <p className="text-[12px] text-gray-500 mt-0.5">
            {status?.approved == null
              ? "Couldn't count the knowledge base articles."
              : `${status.approved} approved article${status.approved === 1 ? "" : "s"}, ${status.indexed ?? 0} searchable.`}
          </p>
          {reindex && (reindexRunning || reindex.finishedAt) && (
            <p className={`text-[12px] mt-1 ${reindexRunning ? "text-brand-fg font-medium" : reindex.failed || reindex.error ? "text-amber-700" : "text-gray-500"}`}>
              {reindexRunning
                ? `Re-indexing… ${reindex.done} of ${reindex.total || "?"} articles`
                : `Last re-index: ${reindex.indexed} indexed, ${reindex.skipped} skipped (not approved), ${reindex.failed} failed${reindex.error ? ` — ${reindex.error}` : ""}`}
            </p>
          )}
          {reindex && !reindexRunning && reindex.errors.length > 0 && (
            <ul className="text-[11px] text-amber-700 mt-1 space-y-0.5">
              {reindex.errors.slice(0, 3).map((e) => (
                <li key={e.id}>Article #{e.id}: {e.error}</li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Cloudflare account */}
      <SectionCard
        title="Cloudflare account"
        description={
          <>
            Where to find these: Cloudflare dashboard → <b>AI</b> → <b>Workers AI</b> → <b>Use REST API</b>. Copy the Account ID there, and
            create an API token with the Workers AI permissions.
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className={labelCls}>Account ID</label>
            <input
              type="text"
              value={form.accountId}
              onChange={(e) => setField("accountId", e.target.value)}
              placeholder={view.sources.accountId === "env" ? `From config.env: ${view.effective.accountId}` : "32-character account ID"}
              spellCheck={false}
              autoComplete="off"
              className={`${inputCls} font-mono text-[13px]`}
            />
            {!form.accountId && view.sources.accountId === "env" && (
              <p className="text-[12px] text-gray-400 mt-1">Empty = the one in config.env is used.</p>
            )}
          </div>

          <div>
            <label className={labelCls}>API token</label>
            {tokenMode === "keep" && view.hasToken ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 text-[13px] text-gray-700 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
                  <KeyRound className="w-3.5 h-3.5 text-gray-400" />
                  Saved <span className="font-mono">••••{view.tokenLast4}</span>
                  <span className="text-gray-400">({sourceLabel(view.tokenSource)})</span>
                </span>
                <button type="button" onClick={() => setTokenMode("replace")} className={secondaryBtnCls} disabled={!view.encryptionAvailable}>
                  Replace
                </button>
                {view.savedToken && (
                  <button type="button" onClick={() => handleSave(true)} disabled={saving} className={`${secondaryBtnCls} text-red-600`}>
                    Remove
                  </button>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  type="password"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  placeholder={view.encryptionAvailable ? "Paste the Cloudflare API token" : "Can't be saved here yet — see below"}
                  disabled={!view.encryptionAvailable}
                  autoComplete="new-password"
                  spellCheck={false}
                  className={`${inputCls} font-mono text-[13px] disabled:opacity-60`}
                />
                {view.hasToken && (
                  <button type="button" onClick={() => { setTokenMode("keep"); setTokenInput(""); }} className={secondaryBtnCls}>
                    Cancel
                  </button>
                )}
              </div>
            )}
            {view.tokenError && (
              <p className="text-[12px] text-amber-700 mt-1.5">
                The saved token can&apos;t be read ({view.tokenError}). Enter it again.
              </p>
            )}
            {view.savedToken && view.tokenSource === "env" && !view.tokenError && (
              <p className="text-[12px] text-gray-400 mt-1">Using config.env&apos;s token.</p>
            )}
            {!view.encryptionAvailable && (
              <p className="text-[12px] text-amber-700 mt-1.5">
                Set SETTINGS_ENCRYPTION_KEY (32+ characters) in the server settings first, or put CLOUDFLARE_AI_TOKEN in config.env.
              </p>
            )}
            <p className="text-[12px] text-gray-400 mt-1">Stored encrypted. It is never shown again — only its last four characters.</p>
          </div>
        </div>
      </SectionCard>

      {/* Models */}
      <SectionCard
        title="Models"
        description={
          <span className="inline-flex flex-wrap items-center gap-x-2">
            {catalog?.source === "cloudflare"
              ? `Live list from Cloudflare${catalog.fetchedAt ? ` (loaded ${new Date(catalog.fetchedAt).toLocaleTimeString()})` : ""}.`
              : `Built-in list${catalog?.error ? ` — ${catalog.error}` : ""}.`}
            <button
              type="button"
              onClick={() => {
                setCatalogLoading(true);
                loadModels(true);
              }}
              disabled={catalogLoading}
              className="inline-flex items-center gap-1 font-semibold text-brand-fg hover:underline cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${catalogLoading ? "animate-spin" : ""}`} /> Reload
            </button>
          </span>
        }
      >
        <div className="space-y-6">
          <div>
            <ModelPicker
              models={chatModels}
              value={form.chatModel}
              onChange={(id) => setField("chatModel", id)}
              label="Chat model"
              placeholder={view.defaults.chatModel}
            />
            <p className="text-[12px] text-gray-400 mt-1.5">
              In force: <span className="font-mono">{view.effective.chatModel}</span> ({sourceLabel(view.sources.chatModel)}). The assistant needs a
              model with tool calling (“tools ✓”) to search and hand over.
            </p>
          </div>

          <div>
            <ModelPicker
              models={embedModels}
              value={form.embedModel}
              onChange={(id) => setField("embedModel", id)}
              label="Embedding model"
              placeholder={view.defaults.embedModel}
            />
            <p className="text-[12px] text-gray-400 mt-1.5">
              In force: <span className="font-mono">{view.effective.embedModel}</span> ({sourceLabel(view.sources.embedModel)}).
            </p>
            <div className={`mt-2 flex items-start gap-2 rounded-xl border px-3 py-2.5 ${embedChanged ? "bg-amber-50 border-amber-200" : "bg-gray-50 border-gray-200"}`}>
              <AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${embedChanged ? "text-amber-600" : "text-gray-400"}`} />
              <p className="text-[12px] text-gray-600">
                The knowledge base stores {EMBED_DIMS}-dimension vectors, so the embedding model must produce exactly {EMBED_DIMS} (bge-m3 does) —
                the server checks before saving. Changing it re-indexes every article; until that finishes the assistant finds nothing and hands
                questions to the team.
                {embedChanged && <b className="block mt-1 text-amber-800">You are changing the embedding model.</b>}
              </p>
            </div>
          </div>
        </div>
      </SectionCard>

      {/* Generation & behaviour */}
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-semibold text-gray-700">Generation &amp; behaviour</p>
        <button type="button" onClick={resetBehaviour} className={secondaryBtnCls}>
          Reset to defaults
        </button>
      </div>
      {GROUPS.map((g) => (
        <SectionCard key={g.title} title={g.title} description={g.description || undefined}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-4">
            {g.fields.map((f) => {
              const lim = view.limits[f.key];
              const def = view.defaults[f.key];
              return (
                <div key={f.key}>
                  <label className={labelCls} htmlFor={`ai-${f.key}`}>
                    {f.label}
                  </label>
                  <input
                    id={`ai-${f.key}`}
                    type="number"
                    inputMode="decimal"
                    min={lim?.min}
                    max={lim?.max}
                    step={f.step}
                    value={form.behaviour[f.key]}
                    onChange={(e) => setNum(f.key, e.target.value)}
                    placeholder={f.optional ? "Model default" : undefined}
                    className={`${inputCls} py-2`}
                  />
                  <p className="text-[12px] text-gray-400 mt-1">
                    {f.help}{" "}
                    <span className="text-gray-500">
                      Range {lim?.min}–{lim?.max}
                      {def !== null && def !== undefined ? `, default ${def}` : ""}.
                    </span>
                  </p>
                </div>
              );
            })}
          </div>
        </SectionCard>
      ))}

      {/* Test result */}
      {(test || testError) && (
        <div className="bg-white border border-gray-200 rounded-2xl px-5 py-4 space-y-2" aria-live="polite">
          <p className="text-[13px] font-semibold text-gray-800">Test connection</p>
          {testError && <p className="text-[13px] text-red-500">{testError}</p>}
          {test && (
            <>
              <TestRow
                ok={test.chat.ok}
                title={`Chat · ${test.chat.model}`}
                detail={
                  test.chat.ok
                    ? `${test.chat.latencyMs} ms${test.chat.sample ? ` · replied “${test.chat.sample}”` : ""}${test.chat.note ? ` · ${test.chat.note}` : ""}`
                    : test.chat.error || "Failed"
                }
              />
              <TestRow
                ok={test.embed.ok}
                title={`Embeddings · ${test.embed.model}`}
                detail={
                  test.embed.ok
                    ? `${test.embed.latencyMs} ms · ${test.embed.dims} dimensions`
                    : `${test.embed.error || "Failed"}${test.embed.dims ? ` (${test.embed.dims} dimensions)` : ""}`
                }
              />
              <p className="text-[11px] text-gray-400">Tested with the values on this page — nothing was saved.</p>
            </>
          )}
        </div>
      )}

      {error && <p className="text-[13px] text-red-500 font-medium">{error}</p>}

      <div className="flex flex-wrap items-center justify-end gap-2">
        <button type="button" onClick={handleReindex} disabled={reindexRunning || !configured} className={secondaryBtnCls}>
          <RefreshCw className={`w-3.5 h-3.5 ${reindexRunning ? "animate-spin" : ""}`} />
          {reindexRunning ? "Re-indexing…" : "Re-index knowledge base"}
        </button>
        <button type="button" onClick={handleTest} disabled={testing} className={secondaryBtnCls}>
          {testing ? "Testing…" : "Test connection"}
        </button>
        <button type="button" onClick={() => handleSave(false)} disabled={saving} className={primaryBtnCls}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

function TestRow({ ok, title, detail }: { ok: boolean; title: string; detail: string }) {
  return (
    <div className="flex items-start gap-2">
      {ok ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" /> : <XCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />}
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-gray-800 break-all">{title}</p>
        <p className={`text-[12px] break-words ${ok ? "text-gray-500" : "text-red-600"}`}>{detail}</p>
      </div>
    </div>
  );
}
