"use client";

// The knowledge base: what the AI assistant may tell patients. Staff write one
// article per treatment or topic; once an admin approves it (and the server has
// indexed it — "Searchable") the assistant answers from it. Everyone with
// knowledge:read can read it; knowledge:write edits it and tests the assistant.

import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, Bot, Plus, Search } from "lucide-react";
import { apiListKnowledge } from "@/lib/api";
import { KNOWLEDGE_STATUS_LABEL, KNOWLEDGE_STATUS_PILL } from "@/lib/knowledge";
import type { KnowledgeArticle, KnowledgeStatus } from "@/types";
import { useCurrentUser } from "@/components/CurrentUserProvider";
import { NoAccess } from "@/components/NoAccess";
import { PageSpinner, Spinner } from "@/components/ui/spinner";
import { ArticleEditor } from "@/components/knowledge/ArticleEditor";
import { AssistantTester } from "@/components/knowledge/AssistantTester";
import { inputCls, primaryBtnCls, secondaryBtnCls } from "@/components/settings/shared";

const STATUS_FILTERS: (KnowledgeStatus | "ALL")[] = ["ALL", "APPROVED", "DRAFT", "ARCHIVED"];

// What the right-hand side shows.
type View = { kind: "test" } | { kind: "new" } | { kind: "article"; id: number };

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });

export default function KnowledgePage() {
  const { ready, can } = useCurrentUser();
  const canRead = can("knowledge:read");
  const canWrite = can("knowledge:write");

  const [articles, setArticles] = useState<KnowledgeArticle[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [aiConfigured, setAiConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [status, setStatus] = useState<KnowledgeStatus | "ALL">("ALL");
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>({ kind: "test" });
  const [dirty, setDirty] = useState(false);

  // Typing settles for a moment before the list is asked again.
  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(() => {
    return apiListKnowledge({ status: status === "ALL" ? undefined : status, category: category || undefined, search: query || undefined })
      .then((res) => {
        setArticles(res.data);
        setCategories(res.categories);
        setAiConfigured(res.aiConfigured);
        setLoadError(null);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Couldn't load the knowledge base"))
      .finally(() => setLoading(false));
  }, [status, category, query]);

  useEffect(() => {
    if (canRead) load();
  }, [canRead, load]);

  const selected = view.kind === "article" ? articles.find((a) => a.id === view.id) ?? null : null;

  // Leaving unsaved edits asks first.
  const go = useCallback(
    (next: View) => {
      if (dirty && !window.confirm("You have unsaved changes to this article. Leave without saving?")) return;
      setDirty(false);
      setView(next);
    },
    [dirty],
  );

  const onSaved = useCallback((a: KnowledgeArticle) => {
    setArticles((list) => (list.some((x) => x.id === a.id) ? list.map((x) => (x.id === a.id ? a : x)) : [a, ...list]));
    setCategories((list) => (a.category && !list.includes(a.category) ? [...list, a.category].sort() : list));
    setView({ kind: "article", id: a.id });
  }, []);

  const onDeleted = useCallback((id: number) => {
    setArticles((list) => list.filter((x) => x.id !== id));
    setDirty(false);
    setView({ kind: "test" });
  }, []);

  const counts = useMemo(() => {
    const approved = articles.filter((a) => a.status === "APPROVED");
    return { approved: approved.length, searchable: approved.filter((a) => a.searchable).length };
  }, [articles]);

  if (!ready) return <PageSpinner />;
  if (!canRead) return <NoAccess what="the knowledge base" />;

  return (
    <div className="h-full flex flex-col min-h-0 bg-white font-[family-name:var(--font-geist-sans)]">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100 gap-4 flex-wrap">
        <div>
          <h1 className="text-[22px] font-bold text-gray-900 tracking-tight">Knowledge base</h1>
          <p className="text-[13px] text-gray-400 mt-0.5">
            What the AI assistant may tell patients. Only approved articles are used.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canWrite && (
            <button type="button" onClick={() => go({ kind: "test" })} className={secondaryBtnCls}>
              <Bot className="w-4 h-4" /> Test the assistant
            </button>
          )}
          {canWrite && (
            <button type="button" onClick={() => go({ kind: "new" })} className={primaryBtnCls}>
              <Plus className="w-4 h-4" /> New article
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
        {/* List */}
        <div className="lg:w-[360px] shrink-0 border-b lg:border-b-0 lg:border-r border-gray-100 flex flex-col min-h-0 max-h-[45vh] lg:max-h-none">
          <div className="p-4 space-y-3 border-b border-gray-100">
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                dir="auto"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search articles"
                className={`${inputCls} pl-10 py-2.5`}
              />
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {STATUS_FILTERS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  className={`px-3 py-1 rounded-full text-[12px] border transition-colors cursor-pointer font-medium ${
                    status === s ? "bg-brand-200 border-brand text-brand-fg" : "border-gray-200 text-gray-500 hover:bg-gray-50 bg-white"
                  }`}
                >
                  {s === "ALL" ? "All" : KNOWLEDGE_STATUS_LABEL[s]}
                </button>
              ))}
            </div>
            {categories.length > 0 && (
              <select value={category} onChange={(e) => setCategory(e.target.value)} className={`${inputCls} py-2 cursor-pointer`}>
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            )}
            <p className="text-[11px] text-gray-400">
              {counts.approved} approved{status === "ALL" && !category && !query ? "" : " in this view"} · {counts.searchable} searchable
              {!aiConfigured && <span className="text-amber-700"> · AI not configured</span>}
            </p>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-gray-200 [&::-webkit-scrollbar-thumb]:rounded-full">
            {loading ? (
              <div className="flex justify-center py-10">
                <Spinner />
              </div>
            ) : loadError ? (
              <div className="p-6 text-center">
                <p className="text-[13px] text-red-500">{loadError}</p>
                <button type="button" onClick={() => { setLoading(true); load(); }} className={`${secondaryBtnCls} mt-3`}>
                  Try again
                </button>
              </div>
            ) : articles.length === 0 ? (
              <div className="text-center py-10 px-6">
                <div className="w-12 h-12 rounded-2xl bg-brand-100 flex items-center justify-center mx-auto mb-3">
                  <BookOpen className="w-5 h-5 text-brand-fg" />
                </div>
                <p className="text-[14px] font-semibold text-gray-800">{query || status !== "ALL" || category ? "No matching articles" : "No articles yet"}</p>
                <p className="text-[12px] text-gray-400 mt-1">
                  {canWrite ? "Write one per treatment or topic, then approve it." : "An admin adds and approves articles."}
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {articles.map((a) => {
                  const active = view.kind === "article" && view.id === a.id;
                  return (
                    <li key={a.id}>
                      <button
                        type="button"
                        onClick={() => !active && go({ kind: "article", id: a.id })}
                        className={`w-full text-left px-4 py-3 transition-colors cursor-pointer ${active ? "bg-brand-100" : "hover:bg-gray-50"}`}
                      >
                        <div className="flex items-start gap-2">
                          <p dir="auto" className="flex-1 min-w-0 text-[13px] font-semibold text-gray-900 truncate">{a.title}</p>
                          <span className={`shrink-0 text-[10px] font-semibold border rounded-full px-2 py-0.5 ${KNOWLEDGE_STATUS_PILL[a.status]}`}>
                            {KNOWLEDGE_STATUS_LABEL[a.status]}
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-400 mt-0.5 truncate">
                          {a.category || "No category"} · Updated {fmtDate(a.updatedAt)}
                          {a.status === "APPROVED" && !a.searchable && <span className="text-amber-700"> · Not searchable yet</span>}
                        </p>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Editor / tester */}
        <div className="flex-1 min-h-0 overflow-y-auto bg-canvas px-4 sm:px-6 py-6 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-gray-200 [&::-webkit-scrollbar-thumb]:rounded-full">
          <div className="max-w-3xl mx-auto">
            {view.kind === "test" &&
              (canWrite ? (
                <AssistantTester aiConfigured={aiConfigured} />
              ) : (
                <p className="text-[13px] text-gray-400 p-6">Pick an article on the left to read it.</p>
              ))}
            {view.kind === "new" && (
              <ArticleEditor
                key="new"
                article={null}
                categories={categories}
                canWrite={canWrite}
                aiConfigured={aiConfigured}
                onSaved={onSaved}
                onDeleted={onDeleted}
                onDirtyChange={setDirty}
              />
            )}
            {view.kind === "article" &&
              (selected ? (
                <ArticleEditor
                  key={selected.id}
                  article={selected}
                  categories={categories}
                  canWrite={canWrite}
                  aiConfigured={aiConfigured}
                  onSaved={onSaved}
                  onDeleted={onDeleted}
                  onDirtyChange={setDirty}
                />
              ) : (
                <p className="text-[13px] text-gray-400 text-center py-10">This article isn&apos;t in the current list — clear the filters to see it.</p>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
