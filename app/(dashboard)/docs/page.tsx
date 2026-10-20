"use client";

import { Suspense, useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Search, X } from "lucide-react";
import { useCurrentUser } from "@/components/CurrentUserProvider";
import { PageSpinner } from "@/components/ui/spinner";
import { SectionedLayout } from "@/components/SectionedLayout";
import { DOC_PAGES } from "@/components/docs";
import { ROLE_LABEL, ROLES, roleCan, type DocCtx } from "@/components/docs/model";
import { DocLinksContext } from "@/components/docs/primitives";
import type { UserRole } from "@/types";

// The in-app guide. Same shell as Settings; the open page lives in the URL
// (?page=) so links and reloads land on it. Pages are filtered by the reader's
// permissions, and an admin can preview another role's guide (?as=ROLE).

const isRole = (v: string | null): v is UserRole => ROLES.includes(v as UserRole);

function DocsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { me, can } = useCurrentUser();
  const [query, setQuery] = useState("");

  const ownRole: UserRole = me?.role ?? "AGENT";
  const canPreview = can("settings:write");
  const asParam = searchParams.get("as");
  const previewRole = canPreview && isRole(asParam) && asParam !== ownRole ? asParam : null;

  const ctx = useMemo<DocCtx>(
    () => (previewRole ? { role: previewRole, can: roleCan(previewRole), previewing: true } : { role: ownRole, can, previewing: false }),
    [previewRole, ownRole, can],
  );

  const pages = useMemo(() => DOC_PAGES.filter((p) => !p.visible || p.visible(ctx)), [ctx]);
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = words.length
    ? pages.filter((p) => {
        const text = `${p.label} ${p.description} ${p.group} ${p.keywords ?? ""}`.toLowerCase();
        return words.every((w) => text.includes(w));
      })
    : pages;

  const current = pages.find((p) => p.key === searchParams.get("page")) ?? pages[0];
  const index = pages.indexOf(current);
  const prev = index > 0 ? pages[index - 1] : null;
  const next = index < pages.length - 1 ? pages[index + 1] : null;

  const hrefFor = useCallback(
    (page: string, as: UserRole | null = previewRole) => `/docs?${new URLSearchParams({ page, ...(as ? { as } : {}) })}`,
    [previewRole],
  );
  const links = useMemo(() => ({ href: (page: string) => hrefFor(page), has: (page: string) => pages.some((p) => p.key === page) }), [hrefFor, pages]);
  const open = (page: string) => router.replace(hrefFor(page), { scroll: false });
  const viewAs = (role: UserRole) => router.replace(hrefFor("welcome", role === ownRole ? null : role), { scroll: false });

  const sidebarTop = (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 focus-within:ring-2 focus-within:ring-brand/20 focus-within:border-brand transition-colors">
        <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the guide…"
          aria-label="Search the guide"
          className="flex-1 min-w-0 text-[13px] text-gray-700 placeholder:text-gray-400 outline-none bg-transparent [&::-webkit-search-cancel-button]:hidden"
        />
        {query && (
          <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="text-gray-300 hover:text-gray-500 cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {canPreview ? (
        <label className="flex items-center gap-2 text-[12px] text-gray-500">
          View as
          <select
            value={ctx.role}
            onChange={(e) => viewAs(e.target.value as UserRole)}
            className="flex-1 min-w-0 text-[12px] font-semibold text-gray-800 bg-white border border-gray-200 rounded-lg px-2 py-1 outline-none cursor-pointer focus:border-brand"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}{r === ownRole ? " (you)" : ""}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="text-[12px] text-gray-500">
          Guide for <span className="font-semibold text-brand-fg">{ROLE_LABEL[ctx.role]}</span>
        </p>
      )}
    </div>
  );

  return (
    <DocLinksContext.Provider value={links}>
      <SectionedLayout
        title="Documentation"
        subtitle="How to use Everlast CRM"
        sections={shown}
        active={current}
        onSelect={open}
        columnClassName="max-w-3xl"
        sidebarTop={sidebarTop}
        emptyMenu={<p className="px-2.5 text-[13px] text-gray-400">No pages match &ldquo;{query}&rdquo;.</p>}
      >
        <article className="px-6 py-8">
          {ctx.previewing && (
            <div className="mb-6 flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-[13px] text-amber-800">
              <span>
                Previewing the guide as <b>{ROLE_LABEL[ctx.role]}</b>.
              </span>
              <button type="button" onClick={() => viewAs(ownRole)} className="font-semibold hover:underline cursor-pointer">
                Back to my guide
              </button>
            </div>
          )}

          {current.body(ctx)}

          <nav aria-label="Previous and next page" className="mt-12 pt-6 border-t border-gray-200 grid grid-cols-2 gap-3">
            {prev ? (
              <button
                type="button"
                onClick={() => open(prev.key)}
                className="group text-left rounded-xl border border-gray-200 bg-white px-4 py-3 hover:border-brand/40 transition-colors cursor-pointer"
              >
                <span className="flex items-center gap-1 text-[11.5px] text-gray-400"><ArrowLeft className="w-3 h-3" /> Previous</span>
                <span className="block text-[13.5px] font-semibold text-gray-800 group-hover:text-brand-fg truncate">{prev.label}</span>
              </button>
            ) : <span />}
            {next && (
              <button
                type="button"
                onClick={() => open(next.key)}
                className="group text-right rounded-xl border border-gray-200 bg-white px-4 py-3 hover:border-brand/40 transition-colors cursor-pointer"
              >
                <span className="flex items-center justify-end gap-1 text-[11.5px] text-gray-400">Next <ArrowRight className="w-3 h-3" /></span>
                <span className="block text-[13.5px] font-semibold text-gray-800 group-hover:text-brand-fg truncate">{next.label}</span>
              </button>
            )}
          </nav>
        </article>
      </SectionedLayout>
    </DocLinksContext.Provider>
  );
}

export default function DocsPage() {
  // Pages are chosen from the server's permission list, so wait for it.
  const { ready } = useCurrentUser();
  if (!ready) return <PageSpinner />;
  // useSearchParams needs a Suspense boundary in the app router.
  return (
    <Suspense fallback={<PageSpinner />}>
      <DocsContent />
    </Suspense>
  );
}
