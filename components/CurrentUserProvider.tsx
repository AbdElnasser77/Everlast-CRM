"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiGetMe } from "@/lib/api";
import { can as canFor, type Permission } from "@/lib/permissions";
import type { AgentUser } from "@/types";

interface CurrentUserApi {
  /** The signed-in user, as the SERVER last described them. Null until known. */
  me: AgentUser | null;
  /** True once /users/me has answered, so a denial is real rather than "still loading". */
  ready: boolean;
  /** Does the signed-in user hold every one of these permissions? */
  can: (...required: Permission[]) => boolean;
}

const CurrentUserContext = createContext<CurrentUserApi | null>(null);

/**
 * Who is signed in, and what they may do — fetched once for the whole
 * dashboard, instead of each page reading its own copy out of localStorage and
 * checking the role NAME. Pages ask `can("template:write")`, never
 * `role === "ADMIN"`: the permission list comes straight from the server's
 * config/permissions.js, so a role gaining or losing a capability changes the
 * UI with no frontend edit.
 *
 * Access decisions wait for the server (`ready`). The cached copy from
 * localStorage is used only to show something immediately; it is never what
 * grants access, because it can be stale or edited by hand.
 */
export function CurrentUserProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<AgentUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiGetMe()
      .then((res) => {
        if (cancelled) return;
        setMe(res.data);
        try {
          localStorage.setItem("user", JSON.stringify(res.data));
        } catch {
          // storage unavailable — nothing depends on this copy for access
        }
      })
      .catch(() => {
        // A 401 is handled globally by apiFetch (redirect to login). Anything
        // else leaves `me` null, which fails closed: every can() is false.
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const api = useMemo<CurrentUserApi>(
    () => ({ me, ready, can: (...required) => canFor(me, ...required) }),
    [me, ready],
  );

  return <CurrentUserContext.Provider value={api}>{children}</CurrentUserContext.Provider>;
}

export function useCurrentUser(): CurrentUserApi {
  const ctx = useContext(CurrentUserContext);
  if (!ctx) throw new Error("useCurrentUser must be used inside CurrentUserProvider");
  return ctx;
}
