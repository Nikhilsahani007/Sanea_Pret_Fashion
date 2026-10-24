import type { AdminRole, Permission } from "@sanea/shared";
import { can as roleCan } from "@sanea/shared";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { ApiError, get, send, setSessionCsrf } from "./api.ts";

export type Admin = {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
};

type AuthState =
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "signedIn"; admin: Admin };

type AuthApi = {
  state: AuthState;
  /** Step 1: password. Returns the challenge for step 2. */
  passwordStep(email: string, password: string): Promise<string>;
  /** Step 2: authenticator or recovery code. */
  codeStep(challenge: string, code: string, recovery: boolean): Promise<void>;
  signOut(): Promise<void>;
  can(permission: Permission): boolean;
};

const AuthContext = createContext<AuthApi | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  useEffect(() => {
    get<{ admin: Admin; csrfToken: string }>("/admin/auth/me").then(
      (me) => {
        setSessionCsrf(me.csrfToken);
        setState({ status: "signedIn", admin: me.admin });
      },
      () => setState({ status: "signedOut" }),
    );
  }, []);

  // Any 401 later (expired or revoked session) returns to the sign-in screen.
  useEffect(() => {
    const onRejection = (event: PromiseRejectionEvent) => {
      if (event.reason instanceof ApiError && event.reason.status === 401) {
        setSessionCsrf(null);
        setState({ status: "signedOut" });
      }
    };
    window.addEventListener("unhandledrejection", onRejection);
    return () => window.removeEventListener("unhandledrejection", onRejection);
  }, []);

  const passwordStep = useCallback(async (email: string, password: string) => {
    const res = await send<{ challenge: string }>(
      "POST",
      "/admin/auth/sign-in",
      { email, password },
    );
    return res.challenge;
  }, []);

  const codeStep = useCallback(
    async (challenge: string, code: string, recovery: boolean) => {
      const res = await send<{ admin: Admin; csrfToken: string }>(
        "POST",
        "/admin/auth/mfa",
        recovery ? { challenge, recoveryCode: code } : { challenge, code },
      );
      setSessionCsrf(res.csrfToken);
      setState({ status: "signedIn", admin: res.admin });
    },
    [],
  );

  const signOut = useCallback(async () => {
    await send("POST", "/admin/auth/sign-out").catch(() => undefined);
    setSessionCsrf(null);
    setState({ status: "signedOut" });
  }, []);

  const value = useMemo<AuthApi>(
    () => ({
      state,
      passwordStep,
      codeStep,
      signOut,
      can: (p) => state.status === "signedIn" && roleCan(state.admin.role, p),
    }),
    [state, passwordStep, codeStep, signOut],
  );
  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthApi {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}

export const ROLE_LABELS: Record<AdminRole, string> = {
  OWNER: "Owner",
  MANAGER: "Manager",
  CATALOGUE_EDITOR: "Catalogue editor",
  FULFILMENT: "Fulfilment",
};
