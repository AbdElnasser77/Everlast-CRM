"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2, Users, ShieldCheck, TriangleAlert, Loader2 } from "lucide-react";
import { apiGetSegmentOptions, apiPreviewSegment } from "@/lib/api";
import type {
  SegmentDefinition,
  SegmentField,
  SegmentOp,
  SegmentOptions,
  SegmentPreview,
  SegmentRule,
  SegmentRuleValue,
} from "@/types";

// ── Rule vocabulary ─────────────────────────────────────────────────────────
//
// Mirrors the server's field registry in utils/segmentFilter.js. The server is
// still the authority — it rejects anything it doesn't recognise — but the
// builder needs labels and input shapes the API doesn't carry, so the
// presentation layer lives here.

const FIELD_GROUPS: { group: string; fields: { field: SegmentField; label: string }[] }[] = [
  {
    group: "Who they are",
    fields: [
      { field: "gender", label: "Gender" },
      { field: "age", label: "Age" },
      { field: "nationality", label: "Nationality" },
      { field: "birthdayMonth", label: "Birthday month" },
      { field: "name", label: "Name" },
      { field: "phone", label: "Mobile" },
      { field: "email", label: "Email" },
      { field: "chartNumber", label: "Chart number" },
    ],
  },
  {
    group: "Their care",
    fields: [
      { field: "department", label: "Department" },
      { field: "tag", label: "Tag" },
      { field: "joinDate", label: "Join date" },
      { field: "createdAt", label: "Added to CRM" },
    ],
  },
  {
    group: "Their engagement",
    fields: [
      { field: "lastInboundAt", label: "Last message from patient" },
      { field: "lastCampaignAt", label: "Last campaign received" },
      { field: "hasConversation", label: "Has chatted before" },
      { field: "list", label: "Contact list" },
      { field: "optedOut", label: "Opted out" },
    ],
  },
];

const ALL_FIELDS = FIELD_GROUPS.flatMap((g) => g.fields);
const fieldLabel = (f: SegmentField) => ALL_FIELDS.find((x) => x.field === f)?.label ?? f;

const OPS_BY_FIELD: Record<SegmentField, SegmentOp[]> = {
  name: ["contains", "exists"],
  phone: ["contains", "starts_with"],
  email: ["contains", "exists"],
  chartNumber: ["exists"],
  nationality: ["in", "not_in", "exists"],
  gender: ["eq", "exists"],
  department: ["has_any", "has_all", "has_none", "is_empty"],
  tag: ["has_any", "has_all", "has_none", "is_empty"],
  joinDate: ["in_last_days", "older_than_days", "before", "after", "between", "exists"],
  createdAt: ["in_last_days", "older_than_days", "before", "after", "between"],
  age: ["between", "gte", "lte"],
  birthdayMonth: ["in"],
  optedOut: ["eq"],
  hasConversation: ["eq"],
  lastInboundAt: ["older_than_days", "in_last_days", "never"],
  lastCampaignAt: ["older_than_days", "in_last_days", "never"],
  list: ["in", "not_in"],
};

// Operator wording is per-field on purpose: "is any of" reads right for a
// nationality and wrong for a department someone can hold several of.
const OP_LABELS: Partial<Record<SegmentField, Partial<Record<SegmentOp, string>>>> = {
  department: { has_any: "is any of", has_all: "includes all of", has_none: "is none of", is_empty: "is" },
  tag: { has_any: "is any of", has_all: "includes all of", has_none: "is none of", is_empty: "is" },
  lastInboundAt: { older_than_days: "was more than", in_last_days: "was within", never: "" },
  lastCampaignAt: { older_than_days: "was more than", in_last_days: "was within", never: "" },
  joinDate: { in_last_days: "was within", older_than_days: "was more than" },
  createdAt: { in_last_days: "was within", older_than_days: "was more than" },
  age: { between: "is between", gte: "is at least", lte: "is at most" },
  optedOut: { eq: "" },
  hasConversation: { eq: "" },
};

const GENERIC_OP_LABELS: Record<SegmentOp, string> = {
  eq: "is",
  in: "is any of",
  not_in: "is none of",
  contains: "contains",
  starts_with: "starts with",
  exists: "is",
  has_any: "is any of",
  has_all: "includes all of",
  has_none: "is none of",
  is_empty: "is",
  before: "is before",
  after: "is after",
  between: "is between",
  gte: "is at least",
  lte: "is at most",
  in_last_days: "is within the last",
  older_than_days: "is more than",
  never: "",
};

const opLabel = (field: SegmentField, op: SegmentOp) =>
  OP_LABELS[field]?.[op] ?? GENERIC_OP_LABELS[op] ?? op;

// ── Value input shapes ──────────────────────────────────────────────────────

type ValueKind =
  | "text" | "bool" | "gender"
  | "multi-department" | "multi-tag" | "multi-nationality" | "multi-list" | "multi-month"
  | "date" | "date-range" | "number" | "number-range";

function valueKind(field: SegmentField, op: SegmentOp): ValueKind {
  if (op === "exists" || op === "is_empty" || op === "never") return "bool";
  if (field === "optedOut" || field === "hasConversation") return "bool";
  if (field === "gender") return "gender";
  if (field === "department") return "multi-department";
  if (field === "tag") return "multi-tag";
  if (field === "nationality") return "multi-nationality";
  if (field === "list") return "multi-list";
  if (field === "birthdayMonth") return "multi-month";
  if (op === "before" || op === "after") return "date";
  if (op === "between") return field === "age" ? "number-range" : "date-range";
  return op === "contains" || op === "starts_with" ? "text" : "number";
}

// Suffix that turns a bare number into a readable clause.
function valueSuffix(field: SegmentField, op: SegmentOp): string {
  if (op === "in_last_days") return "days";
  if (op === "older_than_days") return "days ago";
  if (field === "age") return "years";
  return "";
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function defaultValue(field: SegmentField, op: SegmentOp): SegmentRuleValue {
  switch (valueKind(field, op)) {
    case "bool": return true;
    case "gender": return "FEMALE";
    case "date": return new Date().toISOString().slice(0, 10);
    case "date-range": {
      const today = new Date().toISOString().slice(0, 10);
      const yearAgo = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
      return [yearAgo, today];
    }
    case "number-range": return [30, 50];
    case "number": return field === "age" ? 30 : 60;
    case "text": return "";
    default: return [];
  }
}

// ── Plain-language rendering ────────────────────────────────────────────────
//
// A rule the user can read back as a sentence is a rule they can catch a
// mistake in. This is the difference between "I think this targets lapsed
// dermatology patients" and knowing it does.

function renderValue(rule: SegmentRule, options: SegmentOptions | null): string {
  const kind = valueKind(rule.field, rule.op);
  const v = rule.value;

  if (kind === "bool") {
    const yes = v === true || v === "true";
    if (rule.op === "exists") return yes ? "set" : "not set";
    if (rule.op === "is_empty") return yes ? "empty" : "not empty";
    if (rule.op === "never") return yes ? "never happened" : "has happened";
    if (rule.field === "optedOut") return yes ? "yes" : "no";
    if (rule.field === "hasConversation") return yes ? "yes" : "no";
    return yes ? "yes" : "no";
  }
  if (kind === "gender") return String(v).toLowerCase();
  if (kind === "multi-month") {
    return (Array.isArray(v) ? v : []).map((m) => MONTHS[Number(m) - 1] ?? m).join(", ") || "—";
  }
  if (kind === "multi-list") {
    const names = (Array.isArray(v) ? v : []).map(
      (id) => options?.lists.find((l) => l.id === Number(id))?.name ?? `#${id}`
    );
    return names.join(", ") || "—";
  }
  if (Array.isArray(v)) {
    if (kind === "date-range" || kind === "number-range") return `${v[0]} and ${v[1]}`;
    return v.join(", ") || "—";
  }
  const suffix = valueSuffix(rule.field, rule.op);
  return suffix ? `${v} ${suffix}` : String(v || "—");
}

function describeRule(rule: SegmentRule, options: SegmentOptions | null): string {
  const op = opLabel(rule.field, rule.op);
  const value = renderValue(rule, options);
  return [fieldLabel(rule.field), op, value].filter(Boolean).join(" ");
}

// ── Small inputs ────────────────────────────────────────────────────────────

const inputCls =
  "text-[13px] rounded-xl border border-gray-200 px-3 py-2 outline-none focus:ring-2 focus:ring-[#3B694C]/20 focus:border-[#3B694C] transition-colors bg-white";

function MultiPicker({
  values,
  options,
  onChange,
  placeholder,
  emptyHint,
}: {
  values: (string | number)[];
  options: { value: string | number; label: string; hint?: string }[];
  onChange: (next: (string | number)[]) => void;
  placeholder: string;
  emptyHint?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const selected = new Set(values.map(String));
  const filtered = query
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;

  function toggle(v: string | number) {
    const next = selected.has(String(v))
      ? values.filter((x) => String(x) !== String(v))
      : [...values, v];
    onChange(next);
  }

  if (options.length === 0) {
    return (
      <span className="text-[12px] text-amber-600 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
        {emptyHint ?? "No values available yet"}
      </span>
    );
  }

  return (
    <div ref={boxRef} className="relative min-w-[180px]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`${inputCls} w-full text-left flex items-center justify-between gap-2 cursor-pointer hover:border-gray-300`}
      >
        <span className={values.length ? "text-gray-900 truncate" : "text-gray-400"}>
          {values.length
            ? options
                .filter((o) => selected.has(String(o.value)))
                .map((o) => o.label)
                .join(", ")
            : placeholder}
        </span>
        <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="m6 9 6 6 6-6" /></svg>
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-[260px] max-h-[280px] overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg py-1">
          {options.length > 8 && (
            <div className="px-2 pb-1 sticky top-0 bg-white">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search…"
                autoFocus
                className="w-full text-[12px] rounded-lg border border-gray-200 px-2.5 py-1.5 outline-none focus:border-[#3B694C]"
              />
            </div>
          )}
          {filtered.length === 0 && (
            <p className="px-3 py-2 text-[12px] text-gray-400">No match</p>
          )}
          {filtered.map((o) => (
            <button
              key={String(o.value)}
              type="button"
              onClick={() => toggle(o.value)}
              className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left hover:bg-gray-50 cursor-pointer"
            >
              <span
                className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                  selected.has(String(o.value)) ? "bg-[#3B694C] border-[#3B694C]" : "border-gray-300"
                }`}
              >
                {selected.has(String(o.value)) && (
                  <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round"><path d="m5 13 4 4L19 7" /></svg>
                )}
              </span>
              <span className="text-[13px] text-gray-700 flex-1 truncate">{o.label}</span>
              {o.hint && <span className="text-[11px] text-gray-400 shrink-0">{o.hint}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ValueEditor({
  rule,
  options,
  onChange,
}: {
  rule: SegmentRule;
  options: SegmentOptions | null;
  onChange: (value: SegmentRuleValue) => void;
}) {
  const kind = valueKind(rule.field, rule.op);
  const suffix = valueSuffix(rule.field, rule.op);
  const arr = Array.isArray(rule.value) ? rule.value : [];

  switch (kind) {
    case "bool": {
      const yes = rule.value === true || rule.value === "true";
      const labels =
        rule.op === "exists" ? ["Set", "Not set"]
        : rule.op === "is_empty" ? ["Empty", "Not empty"]
        : rule.op === "never" ? ["Never", "Has happened"]
        : ["Yes", "No"];
      return (
        <div className="inline-flex items-center bg-gray-100 rounded-xl p-1">
          {[true, false].map((val, i) => (
            <button
              key={String(val)}
              type="button"
              onClick={() => onChange(val)}
              className={`text-[12px] font-semibold px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                yes === val ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {labels[i]}
            </button>
          ))}
        </div>
      );
    }

    case "gender":
      return (
        <div className="inline-flex items-center bg-gray-100 rounded-xl p-1">
          {["FEMALE", "MALE"].map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => onChange(g)}
              className={`text-[12px] font-semibold px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                rule.value === g ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {g === "FEMALE" ? "Female" : "Male"}
            </button>
          ))}
        </div>
      );

    case "multi-department":
      return (
        <MultiPicker
          values={arr}
          onChange={onChange}
          placeholder="Pick departments"
          emptyHint="No departments on file yet — import contacts first"
          options={(options?.departments ?? []).map((d) => ({ value: d, label: d }))}
        />
      );

    case "multi-tag":
      return (
        <MultiPicker
          values={arr}
          onChange={onChange}
          placeholder="Pick tags"
          emptyHint="No tags on file yet"
          options={(options?.tags ?? []).map((t) => ({ value: t, label: t }))}
        />
      );

    case "multi-nationality":
      return (
        <MultiPicker
          values={arr}
          onChange={onChange}
          placeholder="Pick nationalities"
          emptyHint="No nationalities on file yet"
          options={(options?.nationalities ?? []).map((n) => ({ value: n, label: n }))}
        />
      );

    case "multi-list":
      return (
        <MultiPicker
          values={arr}
          onChange={onChange}
          placeholder="Pick lists"
          emptyHint="No contact lists yet"
          options={(options?.lists ?? []).map((l) => ({
            value: l.id,
            label: l.name,
            hint: l.memberCount.toLocaleString(),
          }))}
        />
      );

    case "multi-month":
      return (
        <MultiPicker
          values={arr}
          onChange={onChange}
          placeholder="Pick months"
          options={MONTHS.map((m, i) => ({ value: i + 1, label: m }))}
        />
      );

    case "date":
      return (
        <input
          type="date"
          value={String(rule.value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          className={inputCls}
        />
      );

    case "date-range":
      return (
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={String(arr[0] ?? "")}
            onChange={(e) => onChange([e.target.value, arr[1] ?? ""])}
            className={inputCls}
          />
          <span className="text-[12px] text-gray-400">and</span>
          <input
            type="date"
            value={String(arr[1] ?? "")}
            onChange={(e) => onChange([arr[0] ?? "", e.target.value])}
            className={inputCls}
          />
        </div>
      );

    case "number-range":
      return (
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            value={String(arr[0] ?? "")}
            onChange={(e) => onChange([e.target.value, arr[1] ?? ""])}
            className={`${inputCls} w-20`}
          />
          <span className="text-[12px] text-gray-400">and</span>
          <input
            type="number"
            min={0}
            value={String(arr[1] ?? "")}
            onChange={(e) => onChange([arr[0] ?? "", e.target.value])}
            className={`${inputCls} w-20`}
          />
          {suffix && <span className="text-[12px] text-gray-400">{suffix}</span>}
        </div>
      );

    case "number":
      return (
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            value={String(rule.value ?? "")}
            onChange={(e) => onChange(e.target.value)}
            className={`${inputCls} w-24`}
          />
          {suffix && <span className="text-[12px] text-gray-400">{suffix}</span>}
        </div>
      );

    default:
      return (
        <input
          value={String(rule.value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          placeholder={rule.field === "phone" ? "e.g. +971" : "Type a value"}
          className={`${inputCls} min-w-[160px]`}
        />
      );
  }
}

// ── The builder ─────────────────────────────────────────────────────────────

export interface SegmentBuilderProps {
  definition: SegmentDefinition;
  onChange: (def: SegmentDefinition) => void;
  excludeOptedOut: boolean;
  onExcludeOptedOutChange: (v: boolean) => void;
  /** Reports every preview result, so a parent can gate "Save" or "Next" on it. */
  onPreview?: (preview: SegmentPreview | null) => void;
}

export default function SegmentBuilder({
  definition,
  onChange,
  excludeOptedOut,
  onExcludeOptedOutChange,
  onPreview,
}: SegmentBuilderProps) {
  const [options, setOptions] = useState<SegmentOptions | null>(null);
  const [preview, setPreview] = useState<SegmentPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  useEffect(() => {
    apiGetSegmentOptions().then((res) => setOptions(res.data)).catch(() => {});
  }, []);

  // The preview is the whole point, so it has to keep up with typing without
  // firing a COUNT per keystroke. Debounced, and every response carries the
  // token of the request that asked for it — an earlier, slower query must
  // never overwrite the number for what is currently on screen.
  const requestSeq = useRef(0);
  const definitionKey = JSON.stringify(definition);

  const runPreview = useCallback(async () => {
    const token = ++requestSeq.current;
    if (definition.rules.length === 0) {
      setPreview(null);
      setPreviewError(null);
      setPreviewing(false);
      onPreview?.(null);
      return;
    }
    setPreviewing(true);
    try {
      const res = await apiPreviewSegment(definition, excludeOptedOut);
      if (token !== requestSeq.current) return;
      setPreview(res.data);
      setPreviewError(null);
      onPreview?.(res.data);
    } catch (err) {
      if (token !== requestSeq.current) return;
      setPreview(null);
      setPreviewError(err instanceof Error ? err.message : "Couldn't count that audience");
      onPreview?.(null);
    } finally {
      if (token === requestSeq.current) setPreviewing(false);
    }
    // definitionKey stands in for `definition` so an identical rule object
    // rebuilt on re-render doesn't retrigger the count.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [definitionKey, excludeOptedOut, onPreview]);

  useEffect(() => {
    const t = setTimeout(runPreview, 350);
    return () => clearTimeout(t);
  }, [runPreview]);

  function updateRule(index: number, patch: Partial<SegmentRule>) {
    const rules = definition.rules.map((r, i) => {
      if (i !== index) return r;
      const next = { ...r, ...patch };
      // Changing the field or operator can invalidate the value — a date where
      // a number belongs sends a 400 the user can do nothing useful with, so
      // reset to a sane default for the new shape instead.
      if (patch.field && patch.field !== r.field) {
        const op = OPS_BY_FIELD[patch.field][0];
        return { field: patch.field, op, value: defaultValue(patch.field, op) };
      }
      if (patch.op && patch.op !== r.op && valueKind(next.field, patch.op) !== valueKind(r.field, r.op)) {
        next.value = defaultValue(next.field, patch.op);
      }
      return next;
    });
    onChange({ ...definition, rules });
  }

  function addRule() {
    const field: SegmentField = "department";
    const op = OPS_BY_FIELD[field][0];
    onChange({ ...definition, rules: [...definition.rules, { field, op, value: defaultValue(field, op) }] });
  }

  function removeRule(index: number) {
    onChange({ ...definition, rules: definition.rules.filter((_, i) => i !== index) });
  }

  const sentence = useMemo(() => {
    if (definition.rules.length === 0) return null;
    const joiner = definition.match === "ALL" ? " and " : " or ";
    return definition.rules.map((r) => describeRule(r, options)).join(joiner);
  }, [definition, options]);

  return (
    <div className="flex flex-col lg:flex-row gap-5 items-start">
      {/* ── Rules ── */}
      <div className="flex-1 min-w-0 w-full space-y-3">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="text-[13px] text-gray-500">Include contacts matching</span>
          <div className="inline-flex items-center bg-gray-100 rounded-xl p-1">
            {(["ALL", "ANY"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => onChange({ ...definition, match: m })}
                className={`text-[12px] font-semibold px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                  definition.match === m ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {m === "ALL" ? "all rules" : "any rule"}
              </button>
            ))}
          </div>
        </div>

        {definition.rules.length === 0 && (
          <div className="rounded-2xl border-2 border-dashed border-gray-200 px-5 py-8 text-center">
            <div className="w-11 h-11 rounded-2xl bg-[#EEF6F1] flex items-center justify-center mx-auto mb-3">
              <Users className="w-5 h-5 text-[#3B694C]" />
            </div>
            <p className="text-[14px] font-semibold text-gray-700">No rules yet</p>
            <p className="text-[12.5px] text-gray-400 mt-1">
              Add a rule to narrow the audience. With none, this would match every contact.
            </p>
          </div>
        )}

        {definition.rules.map((rule, i) => (
          <div
            key={i}
            className="relative rounded-2xl border border-gray-100 bg-white px-4 py-3.5 hover:border-gray-200 transition-colors"
          >
            <div className="flex items-center gap-2.5 flex-wrap pr-8">
              <span className="text-[11px] font-bold uppercase tracking-wider text-gray-300 w-9 shrink-0">
                {i === 0 ? "Where" : definition.match === "ALL" ? "And" : "Or"}
              </span>

              <select
                value={rule.field}
                onChange={(e) => updateRule(i, { field: e.target.value as SegmentField })}
                className={`${inputCls} cursor-pointer`}
              >
                {FIELD_GROUPS.map((g) => (
                  <optgroup key={g.group} label={g.group}>
                    {g.fields.map((f) => (
                      <option key={f.field} value={f.field}>{f.label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>

              {OPS_BY_FIELD[rule.field].length > 1 ? (
                <select
                  value={rule.op}
                  onChange={(e) => updateRule(i, { op: e.target.value as SegmentOp })}
                  className={`${inputCls} cursor-pointer text-gray-500`}
                >
                  {OPS_BY_FIELD[rule.field].map((op) => (
                    <option key={op} value={op}>{opLabel(rule.field, op) || "—"}</option>
                  ))}
                </select>
              ) : (
                <span className="text-[13px] text-gray-400">{opLabel(rule.field, rule.op)}</span>
              )}

              <ValueEditor rule={rule} options={options} onChange={(value) => updateRule(i, { value })} />
            </div>

            <button
              type="button"
              onClick={() => removeRule(i)}
              title="Remove rule"
              className="absolute top-3 right-3 p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}

        <button
          type="button"
          onClick={addRule}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 text-[13px] font-semibold text-gray-600 hover:bg-[#EEF6F1] hover:border-[#3B694C] hover:text-[#3B694C] transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Add rule
        </button>

        {sentence && (
          <div className="rounded-xl bg-gray-50 border border-gray-100 px-4 py-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1">In plain words</p>
            <p className="text-[13px] text-gray-700 leading-relaxed">{sentence}.</p>
          </div>
        )}
      </div>

      {/* ── Live audience ── */}
      <aside className="w-full lg:w-[300px] shrink-0 space-y-3 lg:sticky lg:top-0">
        <div className="rounded-2xl border border-gray-100 bg-white p-5">
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-4 h-4 text-[#3B694C]" />
            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Audience right now</p>
          </div>

          {previewError ? (
            <div className="flex items-start gap-2 text-[12.5px] text-red-600">
              <TriangleAlert className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{previewError}</span>
            </div>
          ) : definition.rules.length === 0 ? (
            <p className="text-[13px] text-gray-400">Add a rule to see how many contacts qualify.</p>
          ) : (
            <>
              <div className="flex items-baseline gap-2">
                <p className="text-[40px] font-bold text-gray-900 leading-none tabular-nums">
                  {previewing && !preview ? "—" : (preview?.reachable ?? 0).toLocaleString()}
                </p>
                {previewing && <Loader2 className="w-3.5 h-3.5 text-gray-300 animate-spin" />}
              </div>
              <p className="text-[12.5px] text-gray-400 mt-1">
                reachable contact{preview?.reachable === 1 ? "" : "s"}
              </p>

              {!!preview?.suppressed && (
                <div className="flex items-start gap-2 mt-3 pt-3 border-t border-gray-50 text-[12px] text-gray-500">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#3B694C] shrink-0 mt-0.5" />
                  <span>
                    {preview.suppressed.toLocaleString()} of {preview.matched.toLocaleString()} matched
                    contact{preview.matched === 1 ? "" : "s"} opted out and will not be messaged.
                  </span>
                </div>
              )}

              {preview?.reachable === 0 && (
                <div className="flex items-start gap-2 mt-3 pt-3 border-t border-gray-50 text-[12px] text-amber-700">
                  <TriangleAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>Nobody matches these rules. Loosen one before saving.</span>
                </div>
              )}
            </>
          )}
        </div>

        <label className="flex items-start gap-2.5 rounded-2xl border border-gray-100 bg-white px-4 py-3.5 cursor-pointer">
          <input
            type="checkbox"
            checked={excludeOptedOut}
            onChange={(e) => onExcludeOptedOutChange(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-[#3B694C] cursor-pointer"
          />
          <span>
            <span className="block text-[13px] font-semibold text-gray-800">Exclude opted-out contacts</span>
            <span className="block text-[11.5px] text-gray-400 mt-0.5 leading-relaxed">
              Campaigns always skip them regardless. Turning this off only changes what this segment
              reports, never who gets messaged.
            </span>
          </span>
        </label>

        {preview && preview.sample.length > 0 && (
          <div className="rounded-2xl border border-gray-100 bg-white p-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2.5">Sample</p>
            <ul className="space-y-2">
              {preview.sample.slice(0, 6).map((c) => (
                <li key={c.id} className="flex items-center gap-2.5">
                  <span className="w-7 h-7 rounded-lg bg-[#EEF6F1] text-[#3B694C] text-[10px] font-bold flex items-center justify-center shrink-0">
                    {(c.name ?? "?").slice(0, 2).toUpperCase()}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[12.5px] font-medium text-gray-800 truncate">
                      {c.name || "Unnamed"}
                    </span>
                    <span className="block text-[11px] text-gray-400 truncate">
                      {c.departments[0] ?? c.phone}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            {preview.reachable > 6 && (
              <p className="text-[11px] text-gray-300 mt-2.5 pt-2.5 border-t border-gray-50">
                and {(preview.reachable - 6).toLocaleString()} more
              </p>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}

export { describeRule, fieldLabel };
