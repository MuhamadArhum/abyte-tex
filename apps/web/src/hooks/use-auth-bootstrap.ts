"use client";

import { useEffect, useRef } from "react";
import { api, ApiError } from "@/lib/api-client";
import { useAuthStore } from "@/store/auth-store";
import type { Session } from "@abytetex/types";

/**
 * Runs once when the app first loads in the browser: tries to silently trade
 * the API's httpOnly refresh cookie for a new access token, then fetches the
 * full session/permission set. This is the only way to establish a session on
 * page load in this architecture — the API lives on a different origin, so
 * Next.js's own server-side cookie APIs can't see its cookie at all (see
 * IMPLEMENTATION_DECISIONS.md for why auth here is entirely client-driven).
 */
export function useAuthBootstrap() {
  const ranOnce = useRef(false);

  useEffect(() => {
    if (ranOnce.current) return;
    ranOnce.current = true;

    const store = useAuthStore.getState();
    store.setLoading();

    (async () => {
      try {
        const refreshRes = await api.post<{ accessToken: string }>("/auth/refresh");
        useAuthStore.getState().setAccessToken(refreshRes.data.accessToken);

        const sessionRes = await api.get<Session>("/auth/session");
        useAuthStore.getState().setSession(refreshRes.data.accessToken, sessionRes.data);
      } catch (err) {
        if (!(err instanceof ApiError)) console.error("Auth bootstrap failed", err);
        useAuthStore.getState().clear();
      }
    })();
  }, []);
}
