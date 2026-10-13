"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { AlertTriangle, Pencil, Phone, Plus, RefreshCw } from "lucide-react";
import { apiGetAdminNumbers, apiCreateNumber, apiUpdateNumber, apiCheckNumberQuality } from "@/lib/api";
import type { AdminWhatsAppNumber } from "@/types";
import { useToast } from "@/components/ui/toast";
import { PageSpinner } from "@/components/ui/spinner";
import {
  DrawerShell,
  LoadError,
  Toggle,
  errorMessage,
  inputCls,
  labelCls,
  primaryBtnCls,
  secondaryBtnCls,
} from "@/components/settings/shared";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const QUALITY_CHIP: Record<string, { label: string; className: string; dot: string }> = {
  GREEN: { label: "High", className: "bg-green-50 text-green-700 border-green-200", dot: "bg-green-500" },
  YELLOW: { label: "Medium", className: "bg-amber-50 text-amber-600 border-amber-200", dot: "bg-amber-500" },
  RED: { label: "Low", className: "bg-red-50 text-red-600 border-red-200", dot: "bg-red-500" },
};
const QUALITY_UNKNOWN = { label: "Unknown", className: "bg-gray-100 text-gray-500 border-gray-200", dot: "bg-gray-400" };

function QualityChip({ rating }: { rating: string | null }) {
  const chip = (rating && QUALITY_CHIP[rating]) || QUALITY_UNKNOWN;
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${chip.className}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${chip.dot}`} />
      {chip.label}
    </span>
  );
}

function formatAgo(iso: string | null): string {
  if (!iso) return "never checked";
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "checked just now";
  if (mins < 60) return `checked ${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `checked ${hrs} hr${hrs > 1 ? "s" : ""} ago`;
  const days = Math.floor(hrs / 24);
  return `checked ${days} day${days > 1 ? "s" : ""} ago`;
}

// Send speed is how many messages a campaign on this number sends at once.
// The server accepts 1–20; a select means there is no invalid value to type.
const SPEEDS = Array.from({ length: 20 }, (_, i) => i + 1);

function SpeedSelect({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(Number(e.target.value))} className={`${inputCls} w-24 cursor-pointer`}>
      {SPEEDS.map((n) => (
        <option key={n} value={n}>{n}</option>
      ))}
    </select>
  );
}

function Detail({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">{label}</p>
      <div className={`text-[13px] text-gray-700 break-all ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}

function TokenKeySelect({
  value,
  onChange,
  tokenKeys,
}: {
  value: string;
  onChange: (v: string) => void;
  tokenKeys: string[];
}) {
  // A number can point at a key that has since been removed from the server;
  // keep it in the list so the select still shows what is saved.
  const options = value && !tokenKeys.includes(value) ? [value, ...tokenKeys] : tokenKeys;
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={`${inputCls} font-mono cursor-pointer`}>
      {!value && <option value="">Choose a token…</option>}
      {options.map((k) => (
        <option key={k} value={k}>
          {k}
          {tokenKeys.includes(k) ? "" : " (not set on server)"}
        </option>
      ))}
    </select>
  );
}

// ---------------------------------------------------------------------------
// Edit number drawer
// ---------------------------------------------------------------------------

interface EditNumberDrawerProps {
  open: boolean;
  number: AdminWhatsAppNumber | null;
  /** Bumped by the parent on every open, so the form starts fresh each time. */
  formKey: number;
  tokenKeys: string[];
  onClose: () => void;
  onSaved: () => void;
}

function EditNumberDrawer({ open, number, formKey, tokenKeys, onClose, onSaved }: EditNumberDrawerProps) {
  return (
    <DrawerShell open={open} onClose={onClose} title="Edit number">
      {number && <EditNumberForm key={formKey} number={number} tokenKeys={tokenKeys} onClose={onClose} onSaved={onSaved} />}
    </DrawerShell>
  );
}

interface EditNumberFormProps {
  number: AdminWhatsAppNumber;
  tokenKeys: string[];
  onClose: () => void;
  onSaved: () => void;
}

function EditNumberForm({ number, tokenKeys, onClose, onSaved }: EditNumberFormProps) {
  const toast = useToast();
  const [label, setLabel] = useState(number.label);
  const [speed, setSpeed] = useState(number.sendConcurrency);
  const [tokenKey, setTokenKey] = useState(number.tokenEnvKey);
  const [isActive, setIsActive] = useState(number.isActive);
  const [makeDefault, setMakeDefault] = useState(false);
  // Turning off a number with campaigns needs a second, explicit click.
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const running = number.activeCampaigns ?? 0;
  const deactivating = number.isActive && !isActive;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim()) { setError("The name can't be empty."); return; }
    if (deactivating && running > 0 && !confirmDeactivate) {
      setConfirmDeactivate(true);
      return;
    }

    // Only what changed: a token change makes the server re-check with Meta,
    // which there's no reason to do when the token is untouched.
    const changes: Parameters<typeof apiUpdateNumber>[1] = {};
    if (label.trim() !== number.label) changes.label = label.trim();
    if (speed !== number.sendConcurrency) changes.sendConcurrency = speed;
    if (tokenKey !== number.tokenEnvKey) changes.tokenEnvKey = tokenKey;
    if (isActive !== number.isActive) changes.isActive = isActive;
    if (makeDefault && isActive) changes.isDefault = true;
    if (Object.keys(changes).length === 0) { onClose(); return; }

    setSubmitting(true);
    setError(null);
    try {
      await apiUpdateNumber(number.id, changes);
      toast.success(`${label.trim()} saved`);
      onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err, "Failed to update number"));
      setConfirmDeactivate(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className={labelCls}>Name <span className="text-red-500">*</span></label>
        <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Medical Center" className={inputCls} />
      </div>

      <div>
        <label className={labelCls}>Send speed</label>
        <div className="flex items-center gap-3">
          <SpeedSelect value={speed} onChange={setSpeed} />
          <span className="text-[13px] text-gray-500">messages at once</span>
        </div>
        <p className="text-[12px] text-gray-400 mt-1.5">Higher is faster. Lower it if Meta starts throttling this number.</p>
      </div>

      <div>
        <label className={labelCls}>Access token</label>
        <TokenKeySelect value={tokenKey} onChange={setTokenKey} tokenKeys={tokenKeys} />
        <p className="text-[12px] text-gray-400 mt-1.5">
          The name of a token on the server — the token itself never leaves the server. Changing it is checked with Meta.
        </p>
      </div>

      <div className="flex items-start justify-between gap-4 border border-gray-200 rounded-xl px-4 py-3">
        <div>
          <p className="text-[13px] font-semibold text-gray-700">Active</p>
          <p className="text-[12px] text-gray-400 mt-0.5">
            {number.isDefault
              ? "The default number can't be turned off. Make another number the default first."
              : "An inactive number is hidden from the inbox and can't send campaigns."}
          </p>
        </div>
        <Toggle
          checked={isActive}
          onChange={(v) => { setIsActive(v); setConfirmDeactivate(false); }}
          disabled={number.isDefault}
          label="Active"
        />
      </div>

      {!number.isDefault && (
        <div className="flex items-start justify-between gap-4 border border-gray-200 rounded-xl px-4 py-3">
          <div>
            <p className="text-[13px] font-semibold text-gray-700">Make default</p>
            <p className="text-[12px] text-gray-400 mt-0.5">
              {isActive ? "The number the app opens on and uses when none is chosen." : "Only an active number can be the default."}
            </p>
          </div>
          <Toggle checked={makeDefault && isActive} onChange={setMakeDefault} disabled={!isActive} label="Make default" />
        </div>
      )}

      {deactivating && running > 0 && (
        <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-[13px] text-amber-700">
            This number has {running} active campaign{running !== 1 ? "s" : ""}. Turning it off pauses them until it&apos;s active again.
          </p>
        </div>
      )}

      {error && <p className="text-[13px] text-red-500 font-medium">{error}</p>}

      <div className="flex gap-3 pt-1">
        <button type="button" onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 text-[13px] font-semibold text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer">
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className={`flex-1 py-3 rounded-xl disabled:opacity-60 disabled:cursor-not-allowed text-[13px] font-semibold text-white transition-colors cursor-pointer ${
            confirmDeactivate ? "bg-amber-600 hover:bg-amber-700" : "bg-brand hover:bg-[#2f5840]"
          }`}
        >
          {submitting ? "Saving…" : confirmDeactivate ? "Turn off and pause" : "Save changes"}
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Add number drawer
// ---------------------------------------------------------------------------

interface AddNumberDrawerProps {
  open: boolean;
  /** Bumped by the parent on every open, so the form starts empty each time. */
  formKey: number;
  tokenKeys: string[];
  onClose: () => void;
  onCreated: () => void;
}

function AddNumberDrawer({ open, formKey, tokenKeys, onClose, onCreated }: AddNumberDrawerProps) {
  return (
    <DrawerShell open={open} onClose={onClose} title="Add number">
      <AddNumberForm key={formKey} tokenKeys={tokenKeys} onClose={onClose} onCreated={onCreated} />
    </DrawerShell>
  );
}

function AddNumberForm({ tokenKeys, onClose, onCreated }: Omit<AddNumberDrawerProps, "open" | "formKey">) {
  const toast = useToast();
  const [label, setLabel] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [wabaId, setWabaId] = useState("");
  // With a single token on the server there is nothing to choose.
  const [tokenKey, setTokenKey] = useState(tokenKeys.length === 1 ? tokenKeys[0] : "");
  const [speed, setSpeed] = useState(5);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const labelRef = useRef<HTMLInputElement>(null);

  // Focus once the drawer has slid in.
  useEffect(() => {
    const t = setTimeout(() => labelRef.current?.focus(), 150);
    return () => clearTimeout(t);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim() || !phoneNumberId.trim() || !wabaId.trim() || !tokenKey) {
      setError("Name, phone number ID, business account ID and token are all required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiCreateNumber({
        label: label.trim(),
        phoneNumberId: phoneNumberId.trim(),
        wabaId: wabaId.trim(),
        tokenEnvKey: tokenKey,
        sendConcurrency: speed,
      });
      toast.success(`${res.data.label}${res.data.displayPhoneNumber ? ` (${res.data.displayPhoneNumber})` : ""} added`);
      onCreated();
      onClose();
    } catch (err) {
      setError(errorMessage(err, "Failed to add number"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[12px] text-gray-500">
        The number must already be registered and connected in WhatsApp Manager — registering a brand-new number
        (with its PIN) is still done by a developer. We check the details with Meta and fill in the phone number for you.
      </div>

      <div>
        <label className={labelCls}>Name <span className="text-red-500">*</span></label>
        <input ref={labelRef} type="text" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Medical Center" className={inputCls} />
      </div>

      <div>
        <label className={labelCls}>Phone number ID <span className="text-red-500">*</span></label>
        <input type="text" inputMode="numeric" value={phoneNumberId} onChange={(e) => setPhoneNumberId(e.target.value)} placeholder="e.g. 123456789012345" className={`${inputCls} font-mono`} autoComplete="off" />
      </div>

      <div>
        <label className={labelCls}>WhatsApp Business Account ID <span className="text-red-500">*</span></label>
        <input type="text" inputMode="numeric" value={wabaId} onChange={(e) => setWabaId(e.target.value)} placeholder="e.g. 102345678901234" className={`${inputCls} font-mono`} autoComplete="off" />
      </div>

      <div>
        <label className={labelCls}>Access token <span className="text-red-500">*</span></label>
        {tokenKeys.length === 0 ? (
          <p className="text-[13px] text-amber-600">No WhatsApp tokens are set on the server yet. Ask a developer to add one.</p>
        ) : (
          <TokenKeySelect value={tokenKey} onChange={setTokenKey} tokenKeys={tokenKeys} />
        )}
      </div>

      <div>
        <label className={labelCls}>Send speed</label>
        <div className="flex items-center gap-3">
          <SpeedSelect value={speed} onChange={setSpeed} />
          <span className="text-[13px] text-gray-500">messages at once</span>
        </div>
      </div>

      {error && <p className="text-[13px] text-red-500 font-medium">{error}</p>}

      <div className="flex gap-3 pt-1">
        <button type="button" onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 text-[13px] font-semibold text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer">
          Cancel
        </button>
        <button type="submit" disabled={submitting || tokenKeys.length === 0} className="flex-1 py-3 rounded-xl bg-brand hover:bg-[#2f5840] disabled:opacity-60 disabled:cursor-not-allowed text-[13px] font-semibold text-white transition-colors cursor-pointer">
          {submitting ? "Checking with Meta…" : "Add number"}
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Number card
// ---------------------------------------------------------------------------

function NumberCard({ n, onEdit }: { n: AdminWhatsAppNumber; onEdit: () => void }) {
  const running = n.activeCampaigns ?? 0;
  return (
    <div className={`px-5 py-4 ${n.isActive ? "" : "bg-gray-50/60"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${n.isActive ? "bg-brand-100" : "bg-gray-100"}`}>
            <Phone className={`w-4 h-4 ${n.isActive ? "text-brand-fg" : "text-gray-400"}`} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-[14px] font-semibold text-gray-900 truncate">{n.label}</p>
              {n.isDefault && (
                <span className="text-[10px] font-semibold text-brand-fg bg-brand-100 px-1.5 py-0.5 rounded-full uppercase tracking-wide shrink-0">
                  Default
                </span>
              )}
              <span
                className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full uppercase tracking-wide shrink-0 ${
                  n.isActive ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"
                }`}
              >
                {n.isActive ? "Active" : "Inactive"}
              </span>
            </div>
            <p className="text-[13px] text-gray-500">{n.displayPhoneNumber || "Phone number not known yet"}</p>
          </div>
        </div>
        <button type="button" onClick={onEdit} className={secondaryBtnCls}>
          <Pencil className="w-3.5 h-3.5" />
          Edit
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3 mt-4">
        <Detail label="Phone number ID" value={n.phoneNumberId} mono />
        <Detail label="Business account ID" value={n.wabaId} mono />
        <Detail
          label="Token"
          mono
          value={
            <span className="inline-flex items-center gap-1.5">
              {n.tokenEnvKey}
              {!n.hasToken && (
                <span className="inline-flex items-center gap-1 font-sans text-[11px] font-semibold text-red-600" title="This token isn't set on the server — the number can't send.">
                  <AlertTriangle className="w-3.5 h-3.5" /> not set
                </span>
              )}
            </span>
          }
        />
        <Detail label="Send speed" value={`${n.sendConcurrency} message${n.sendConcurrency !== 1 ? "s" : ""} at once`} />
        <Detail
          label="Quality"
          value={
            <span className="inline-flex items-center gap-2 flex-wrap">
              <QualityChip rating={n.qualityRating} />
              {n.metaStatus && <span className="text-[12px] text-gray-500">{n.metaStatus}</span>}
              <span className="text-[12px] text-gray-400">· {formatAgo(n.qualityCheckedAt)}</span>
            </span>
          }
        />
        <Detail label="Active campaigns" value={running === 0 ? "None" : String(running)} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export function WhatsAppNumbersPanel() {
  const toast = useToast();
  const [numbers, setNumbers] = useState<AdminWhatsAppNumber[]>([]);
  const [tokenKeys, setTokenKeys] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<AdminWhatsAppNumber | null>(null);
  const [showEdit, setShowEdit] = useState(false);
  const [formKey, setFormKey] = useState(0);

  // Plain promise callbacks, so nothing is set synchronously inside the effect.
  const load = useCallback(() => {
    return apiGetAdminNumbers()
      .then((res) => {
        setNumbers(res.data);
        setTokenKeys(res.tokenKeys);
        setLoadError(null);
      })
      .catch((err) => setLoadError(errorMessage(err, "Couldn't load WhatsApp numbers.")))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function checkQuality() {
    setChecking(true);
    try {
      const res = await apiCheckNumberQuality();
      const failed = res.data.filter((r) => r.error).length;
      const paused = res.data.reduce((sum, r) => sum + (r.campaignsPaused ?? 0), 0);
      if (failed > 0) toast.error(`Couldn't check ${failed} number${failed !== 1 ? "s" : ""} with Meta.`);
      else toast.success("Quality checked with Meta.");
      if (paused > 0) toast.info(`${paused} campaign${paused !== 1 ? "s were" : " was"} paused because quality dropped.`);
      await load();
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't check quality."));
    } finally {
      setChecking(false);
    }
  }

  if (loading) return <PageSpinner label="Loading numbers" />;
  if (loadError) return <div className="px-6 py-6"><LoadError message={loadError} onRetry={() => { setLoading(true); load(); }} /></div>;

  return (
    <div className="px-6 py-6 space-y-4">
      <EditNumberDrawer
        open={showEdit}
        number={editing}
        formKey={formKey}
        tokenKeys={tokenKeys}
        onClose={() => setShowEdit(false)}
        onSaved={load}
      />
      <AddNumberDrawer open={showAdd} formKey={formKey} tokenKeys={tokenKeys} onClose={() => setShowAdd(false)} onCreated={load} />

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4">
        <p className="text-[13px] text-gray-400">
          {numbers.length} number{numbers.length !== 1 ? "s" : ""} · quality is checked with Meta every 30 minutes
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <button type="button" onClick={checkQuality} disabled={checking} className={secondaryBtnCls}>
            <RefreshCw className={`w-4 h-4 ${checking ? "animate-spin" : ""}`} />
            Check quality now
          </button>
          <button type="button" onClick={() => { setFormKey((k) => k + 1); setShowAdd(true); }} className={primaryBtnCls}>
            <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
            Add number
          </button>
        </div>
      </div>

      {/* List */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        {numbers.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <p className="text-[14px] font-semibold text-gray-700">No numbers yet</p>
            <p className="text-[13px] text-gray-400 mt-1">Add the first WhatsApp number to start sending.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {numbers.map((n) => (
              <NumberCard
                key={n.id}
                n={n}
                onEdit={() => { setEditing(n); setFormKey((k) => k + 1); setShowEdit(true); }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
