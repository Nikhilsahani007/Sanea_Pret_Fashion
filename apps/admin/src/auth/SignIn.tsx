// Sign-in (D-066, D-067): email and password, then the 6-digit code from the
// authenticator app or a recovery code. The API answers every failure with one
// generic message; this screen shows that message and nothing more specific.
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";

import { ApiError, api, toApiError } from "../api/client.ts";
import type { Admin } from "../api/types.ts";
import { Button, TextField } from "../ui/controls.tsx";
import { Notice, Stack } from "../ui/feedback.tsx";
import s from "./auth.module.css";
import { useSession } from "./session.tsx";

type From = { from?: string; expired?: boolean } | null;

export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className={s.page} id="main">
      <div className={s.card}>
        <Stack gap="6">
          <div>
            <p className={s.brand}>Sanéa Pret</p>
            <p className={s.brandSub}>Admin</p>
          </div>
          {children}
        </Stack>
      </div>
    </main>
  );
}

export function SignIn() {
  const { state, signedIn } = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  // Without a page asked for, staff start at the dashboard (Phase 16).
  const from = (location.state as From)?.from ?? "/";
  const expired =
    (location.state as From)?.expired ||
    (state.status === "signed-out" && state.expired);

  const [step, setStep] = useState<"password" | "code">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [challenge, setChallenge] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    document.title = "Sign in · Sanéa Pret Admin";
    headingRef.current?.focus();
  }, []);
  useEffect(() => {
    if (step === "code") codeRef.current?.focus();
  }, [step, useRecovery]);

  if (state.status === "signed-in") return <Navigate to={from} replace />;

  async function submitPassword(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<{ challenge: string }>("/admin/auth/sign-in", {
        email,
        password,
      });
      setChallenge(r.challenge);
      setPassword("");
      setStep("code");
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<{ admin: Admin; csrfToken: string }>(
        "/admin/auth/mfa",
        useRecovery
          ? { challenge, recoveryCode: code.trim() }
          : { challenge, code: code.trim() },
      );
      signedIn(r.admin, r.csrfToken);
      navigate(from, { replace: true });
    } catch (err) {
      setError(toApiError(err));
      setCode("");
      codeRef.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  function startAgain() {
    setStep("password");
    setChallenge("");
    setCode("");
    setError(null);
  }

  return (
    <AuthLayout>
      <Stack gap="2">
        <h1 ref={headingRef} tabIndex={-1}>
          Sign in
        </h1>
        <p className={s.steps}>
          Step {step === "password" ? 1 : 2} of 2:{" "}
          {step === "password" ? "your details" : "two-factor code"}
        </p>
      </Stack>
      {expired && step === "password" ? (
        <Notice title="Your session has ended">
          <p>
            For security, sessions end after 30 minutes without activity. Sign
            in again to continue.
          </p>
        </Notice>
      ) : null}
      {error ? <Notice tone="error" title={error.message} /> : null}

      {step === "password" ? (
        <form onSubmit={submitPassword} noValidate={false}>
          <Stack>
            <TextField
              label="Email"
              type="email"
              name="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <TextField
              label="Password"
              type="password"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <Button type="submit" busy={busy} busyLabel="Checking…">
              Continue
            </Button>
          </Stack>
        </form>
      ) : (
        <form onSubmit={submitCode}>
          <Stack>
            {useRecovery ? (
              <TextField
                ref={codeRef}
                key="recovery"
                label="Recovery code"
                hint="One of the codes you saved when you set up your account. Each works once."
                name="recoveryCode"
                autoComplete="off"
                spellCheck={false}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
              />
            ) : (
              <TextField
                ref={codeRef}
                key="totp"
                label="6-digit code"
                hint="From your authenticator app."
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                required
              />
            )}
            <Button type="submit" busy={busy} busyLabel="Signing in…">
              Sign in
            </Button>
            <Button
              variant="quiet"
              onClick={() => {
                setUseRecovery((v) => !v);
                setCode("");
              }}
            >
              {useRecovery
                ? "Use the code from your app instead"
                : "Use a recovery code instead"}
            </Button>
            <Button variant="quiet" onClick={startAgain}>
              Start again
            </Button>
          </Stack>
        </form>
      )}
    </AuthLayout>
  );
}
