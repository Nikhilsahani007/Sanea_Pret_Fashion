import { useEffect, useState, type FormEvent } from "react";

import { send } from "../api.ts";
import { ROLE_LABELS } from "../auth.tsx";
import { Button, ErrorSummary, TextField } from "../ui/ui.tsx";
import s from "./auth.module.css";

type Invite = {
  email: string;
  role: keyof typeof ROLE_LABELS;
  kind: "invite" | "reset";
  expiresAt: string;
};

/** Invite or reset link (D-070, D-071): the token is in the URL fragment. */
export function AcceptInvite() {
  const [token] = useState(
    () => new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "",
  );
  const [invite, setInvite] = useState<Invite | null>(null);
  const [enrol, setEnrol] = useState<{
    secret: string;
    otpauthUri: string;
  } | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Keep the token out of history and referrers once read.
    history.replaceState(null, "", window.location.pathname);
    if (!token) return;
    send<Invite>("POST", "/admin/auth/invites/inspect", { token }).then(
      setInvite,
      setError,
    );
  }, [token]);

  async function start() {
    setBusy(true);
    try {
      setEnrol(await send("POST", "/admin/auth/invites/enrol", { token }));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function accept(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, string> = {
        token,
        password: String(f.get("password")),
        code: String(f.get("code")).replace(/\s/g, ""),
      };
      if (invite?.kind === "invite") body.name = String(f.get("name"));
      const res = await send<{ recoveryCodes: string[] }>(
        "POST",
        "/admin/auth/invites/accept",
        body,
      );
      setCodes(res.recoveryCodes);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={s.page}>
      <main className={s.card}>
        <h1>
          {invite?.kind === "reset"
            ? "Reset your admin access"
            : "Join Sanéa Pret admin"}
        </h1>
        <ErrorSummary error={error} />
        {!token ? (
          <p>This link is incomplete. Ask the Owner for a new one.</p>
        ) : null}
        {invite && !enrol && !codes ? (
          <>
            <p>
              {invite.email} · {ROLE_LABELS[invite.role]}
            </p>
            <p>
              Two-step sign-in is required. You will need an authenticator app
              on your phone.
            </p>
            <Button onClick={() => void start()} busy={busy}>
              Set up two-step sign-in
            </Button>
          </>
        ) : null}
        {enrol && !codes ? (
          <form
            onSubmit={accept}
            className={s.card}
            style={{ padding: 0, border: 0 }}
            noValidate
          >
            <p>
              Add this key to your authenticator app, then enter the code it
              shows.
            </p>
            <p className={s.secret} aria-label="Setup key">
              {enrol.secret.replace(/(.{4})/g, "$1 ").trim()}
            </p>
            {invite?.kind === "invite" ? (
              <TextField
                label="Your name"
                name="name"
                autoComplete="name"
                required
              />
            ) : null}
            <TextField
              label="New password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={12}
              required
              hint="At least 12 characters. Long passphrases are best."
            />
            <TextField
              label="Authenticator code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
            />
            <Button type="submit" busy={busy}>
              Finish
            </Button>
          </form>
        ) : null}
        {codes ? (
          <>
            <p role="status">
              Done. Save these recovery codes now; they are shown only once and
              each works once.
            </p>
            <ol className={s.codes}>
              {codes.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ol>
            <a href="/">Go to sign in</a>
          </>
        ) : null}
      </main>
    </div>
  );
}
