import { useState, type FormEvent } from "react";

import { useAuth } from "../auth.tsx";
import { Button, ErrorSummary, TextField } from "../ui/ui.tsx";
import s from "./auth.module.css";

/** Two steps (D-066): password, then an authenticator or recovery code. */
export function SignIn() {
  const { passwordStep, codeStep } = useAuth();
  const [challenge, setChallenge] = useState<string | null>(null);
  const [recovery, setRecovery] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function submitPassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      setChallenge(
        await passwordStep(
          String(form.get("email")),
          String(form.get("password")),
        ),
      );
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const code = String(new FormData(e.currentTarget).get("code")).replace(
      /\s/g,
      "",
    );
    setBusy(true);
    setError(null);
    try {
      await codeStep(challenge!, code, recovery);
    } catch (err) {
      setError(err);
      setChallenge(null);
      setRecovery(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={s.page}>
      <main className={s.card}>
        <div>
          <div className={s.wordmark} aria-hidden="true">
            SANÉA PRET
          </div>
          <h1>Sign in to admin</h1>
        </div>
        <ErrorSummary error={error} title="Sign-in failed" />
        {challenge === null ? (
          <form
            onSubmit={submitPassword}
            className={s.card}
            style={{ padding: 0, border: 0 }}
            noValidate
          >
            <TextField
              label="Email"
              name="email"
              type="email"
              autoComplete="username"
              required
            />
            <TextField
              label="Password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
            <Button type="submit" busy={busy}>
              Continue
            </Button>
          </form>
        ) : (
          <form
            onSubmit={submitCode}
            className={s.card}
            style={{ padding: 0, border: 0 }}
            noValidate
          >
            {recovery ? (
              <TextField
                key="recovery"
                label="Recovery code"
                name="code"
                autoComplete="off"
                required
                autoFocus
                hint="One of the ten codes you saved when you set up two-step sign-in. Each works once."
              />
            ) : (
              <TextField
                key="totp"
                label="Authenticator code"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9 ]*"
                maxLength={7}
                required
                autoFocus
                hint="The 6-digit code from your authenticator app."
              />
            )}
            <Button type="submit" busy={busy}>
              Sign in
            </Button>
            <Button variant="quiet" onClick={() => setRecovery((r) => !r)}>
              {recovery ? "Use an authenticator code" : "Use a recovery code"}
            </Button>
          </form>
        )}
      </main>
    </div>
  );
}
