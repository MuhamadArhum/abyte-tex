import { create } from "zustand";
import type { LoginResponseUser, Session } from "@abytetex/types";
import { hasPermission, type Action, type Resource } from "@abytetex/types";

export type AuthStatus = "idle" | "loading" | "authenticated" | "unauthenticated";

interface AuthState {
  status: AuthStatus;
  accessToken: string | null;
  session: Session | null;
  /** Set right after login, before the fuller /auth/session call resolves. */
  loginUser: LoginResponseUser | null;

  setLoading: () => void;
  setAccessToken: (token: string) => void;
  setSession: (accessToken: string, session: Session, loginUser?: LoginResponseUser) => void;
  clear: () => void;
  can: (resource: Resource, action: Action) => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  status: "idle",
  accessToken: null,
  session: null,
  loginUser: null,

  setLoading: () => set({ status: "loading" }),

  setAccessToken: (token) => set({ accessToken: token }),

  setSession: (accessToken, session, loginUser) =>
    set({
      status: "authenticated",
      accessToken,
      session,
      loginUser: loginUser ?? get().loginUser,
    }),

  clear: () => set({ status: "unauthenticated", accessToken: null, session: null, loginUser: null }),

  can: (resource, action) => {
    // Mirrors the API's PermissionsGuard exactly (see its docstring): platform
    // admins get NO bypass on tenant-resource permissions, so this store
    // doesn't grant one either — showing a control the API would then 403 on
    // would be worse than just not showing it.
    const session = get().session;
    if (!session) return false;
    return hasPermission(session.allow, session.deny, resource, action);
  },
}));
