"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter, usePathname } from "next/navigation";
import { apiGetMyWhatsAppNumbers, setActiveNumber } from "@/lib/api";
import { setSocketNumber } from "@/lib/socket";
import type { ConfiguredWhatsAppNumber } from "@/types";

const STORAGE_KEY = "activeWhatsAppNumberId";

// A guard may veto a switch by returning a message explaining what would be
// lost. Used by flows that hold unsaved work spanning a number — the campaign
// wizard especially, which resolves an audience on one number and would
// otherwise pair it with another number's template.
type SwitchGuard = () => string | null;

interface ActiveNumberApi {
  numbers: ConfiguredWhatsAppNumber[];
  activeNumberId: string | null;
  activeNumber: ConfiguredWhatsAppNumber | null;
  /** Bootstrap finished. Children are not mounted until this is true. */
  ready: boolean;
  switching: boolean;
  switchNumber: (id: string | number) => void;
  refreshNumbers: () => Promise<void>;
  registerSwitchGuard: (key: string, guard: SwitchGuard) => () => void;
}

const WhatsAppNumberContext = createContext<ActiveNumberApi | null>(null);

export function useActiveNumber(): ActiveNumberApi {
  const ctx = useContext(WhatsAppNumberContext);
  // Throws rather than returning a safe default. A silently-empty switcher would
  // mean silently-unscoped requests, which is the one failure this whole feature
  // exists to prevent.
  if (!ctx) throw new Error("useActiveNumber must be used inside WhatsAppNumberProvider");
  return ctx;
}

export function WhatsAppNumberProvider({ children }: { children: ReactNode }) {
  const [numbers, setNumbers] = useState<ConfiguredWhatsAppNumber[]>([]);
  const [activeNumberId, setActiveNumberId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [switching, setSwitching] = useState(false);

  const router = useRouter();
  const pathname = usePathname();

  // Guards live in a ref: registering one must not re-render the whole dashboard.
  const guardsRef = useRef(new Map<string, SwitchGuard>());

  // Phase A — synchronous, no network. Reading storage in an effect rather than
  // during render is what avoids a hydration mismatch; it is the same one-tick
  // pattern every page in this app already uses.
  //
  // Children stay unmounted until this completes. If they mounted first, their
  // ~30 effects would fire with no X-WhatsApp-Number-Id header at all, the server
  // would pick its own default, and the result is exactly the cross-number flash
  // the feature is meant to make impossible.
  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch {
      // Private mode / blocked storage — fall through to the server default.
    }
    if (stored) {
      setActiveNumber(stored);
      setSocketNumber(stored);
      setActiveNumberId(stored);
    }
    setReady(true);
  }, []);

  const applyNumber = useCallback((id: string) => {
    // Order matters and is the single most important detail here. These are plain
    // module mutations, so by the time React commits the state update below,
    // apiFetch is already stamping the new number and the socket is already
    // re-rooming. Doing this in an effect keyed on activeNumberId instead would
    // let the remounted children fetch under the OLD number first.
    setActiveNumber(id);   // aborts in-flight requests, bumps the epoch
    setSocketNumber(id);   // reconnects the same socket into the new room
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // Non-fatal: the selection just won't survive a reload.
    }
    setActiveNumberId(id);
  }, []);

  // Phase B — background. Populates the dropdown and validates the stored id.
  const refreshNumbers = useCallback(async () => {
    try {
      const res = await apiGetMyWhatsAppNumbers();
      const active = res.data.filter((n) => n.isActive);
      setNumbers(active);

      // The stored number may have been deactivated or removed since last visit.
      // Falling back beats sending a dead id on every request.
      const stored = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
      const stillValid = stored && active.some((n) => String(n.id) === stored);
      if (!stillValid) {
        const fallback = active.find((n) => n.isDefault) ?? active[0];
        if (fallback) applyNumber(String(fallback.id));
      }
    } catch {
      // Leave the switcher empty rather than blocking the app; every request
      // still works, falling back to the server's default number.
    }
  }, [applyNumber]);

  useEffect(() => {
    if (ready) void refreshNumbers();
  }, [ready, refreshNumbers]);

  const registerSwitchGuard = useCallback((key: string, guard: SwitchGuard) => {
    guardsRef.current.set(key, guard);
    return () => {
      guardsRef.current.delete(key);
    };
  }, []);

  const switchNumber = useCallback(
    (rawId: string | number) => {
      const id = String(rawId);
      if (id === activeNumberId) return;

      for (const guard of guardsRef.current.values()) {
        const message = guard();
        if (message && !window.confirm(`${message}\n\nSwitch anyway?`)) return;
      }

      setSwitching(true);
      applyNumber(id);

      // Conversation and campaign ids are global integers, so a deep-linked route
      // would happily render another number's record. Drop back to the list.
      if (/^\/(chats|campaigns|templates)\/[^/]+$/.test(pathname)) {
        router.push(pathname.split("/").slice(0, 2).join("/"));
      }

      // The key remount is driven by activeNumberId, so by the next paint every
      // child has re-fetched under the new number.
      setTimeout(() => setSwitching(false), 400);
    },
    [activeNumberId, applyNumber, pathname, router],
  );

  const activeNumber = useMemo(
    () => numbers.find((n) => String(n.id) === activeNumberId) ?? null,
    [numbers, activeNumberId],
  );

  const api = useMemo<ActiveNumberApi>(
    () => ({
      numbers,
      activeNumberId,
      activeNumber,
      ready,
      switching,
      switchNumber,
      refreshNumbers,
      registerSwitchGuard,
    }),
    [numbers, activeNumberId, activeNumber, ready, switching, switchNumber, refreshNumbers, registerSwitchGuard],
  );

  if (!ready) return null;

  return (
    <WhatsAppNumberContext.Provider value={api}>{children}</WhatsAppNumberContext.Provider>
  );
}
