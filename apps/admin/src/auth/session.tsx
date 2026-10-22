// The signed-in admin (phase-8-ui-plan.md §3.3). GET /admin/auth/me on load;
// a 401 on any later request means the session ended (idle 30 min, absolute
// 8 h, D-067), which sends the user to sign-in with a notice. Roles here only
// decide what is shown; the API decides what is allowed (D-075).
import { can, type Permission } from "@sanea/shared";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  ApiError,
  api,
  setSessionCsrfToken,
  setUnauthenticatedHandler,
  toApiError,
} from "../api/client.ts";
import type { Admin } from "../api/types.ts";

export type SessionState =
  | { status: "loading" }
  | { status: "signed-out"; expired: boolean }
  | { status: "signed-in"; admin: Admin }
  | { status: "error"; error: ApiError };

type SessionValue = {
  state: SessionState;
  reload: () => void;
  signedIn: (admin: Admin, csrfToken: string) => void;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: "loading" });

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const me = await api.get<{ admin: Admin; csrfToken: string }>(
        "/admin/auth/me",
      );
      setSessionCsrfToken(me.csrfToken);
      setState({ status: "signed-in", admin: me.admin });
    } catch (error) {
      setSessionCsrfToken(null);
      if (error instanceof ApiError && error.status === 401)
        setState({ status: "signed-out", expired: false });
      else setState({ status: "error", error: toApiError(error) });
    }
  }, []);

  useEffect(() => {
    setUnauthenticatedHandler(() => {
      setSessionCsrfToken(null);
      setState((s) =>
        s.status === "signed-in" ? { status: "signed-out", expired: true } : s,
      );
    });
    void load();
    return () => setUnauthenticatedHandler(null);
  }, [load]);

  const signedIn = useCallback((admin: Admin, csrfToken: string) => {
    setSessionCsrfToken(csrfToken);
    setState({ status: "signed-in", admin });
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api.post("/admin/auth/sign-out");
    } catch (error) {
      // Already gone is fine; anything else keeps the session and is shown.
      if (!(error instanceof ApiError && error.status === 401)) throw error;
    }
    setSessionCsrfToken(null);
    setState({ status: "signed-out", expired: false });
  }, []);

  const value = useMemo(
    () => ({ state, reload: () => void load(), signedIn, signOut }),
    [state, load, signedIn, signOut],
  );
  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession outside SessionProvider");
  return value;
}

/** The signed-in admin; only inside the signed-in shell. */
export function useAdmin(): Admin {
  const { state } = useSession();
  if (state.status !== "signed-in") throw new Error("not signed in");
  return state.admin;
}

/** Whether the signed-in admin's role has a permission (display only). */
export function useCan(): (permission: Permission) => boolean {
  const admin = useAdmin();
  return useCallback((p: Permission) => can(admin.role, p), [admin.role]);
}
