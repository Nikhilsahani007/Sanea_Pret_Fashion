// Account set-up from an invite or reset link (D-069 to D-071, U8-3). The link
// is the credential: its single-use token is in the URL fragment, so it never
// reaches a server log; it is read once and removed from the address bar.
// Steps: details and password → authenticator (QR code and secret, generated
// by the API for this link only) → confirm a code → recovery codes, shown once.
// The 2FA secret lives only in this component's memory: never in storage,
// logs or any other request.
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router";

import { ApiError, api, localError, toApiError } from "../api/client.ts";
import { Button, Checkbox, TextField } from "../ui/controls.tsx";
import { ErrorSummary, Loading, Notice, Stack } from "../ui/feedback.tsx";
import { AuthLayout } from "./SignIn.tsx";
import { QrCode } from "./QrCode.tsx";
import s from "./auth.module.css";

export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;

type Invite = {
  email: string;
  role: string;
  kind: "invite" | "reset";
  expiresAt: string;
};
type Enrolment = { otpauthUri: string; secret: string };

const ROLE_NAMES: Record<string, string> = {
  OWNER: "Owner",
  MANAGER: "Manager",
  CATALOGUE_EDITOR: "Catalogue editor",
  FULFILMENT: "Fulfilment",
};

/** Reads `#token=…` from the fragment. */
export function tokenFromHash(hash: string): string | null {
  const value = new URLSearchParams(hash.replace(/^#/, "")).get("token");
  return value && /^[A-Za-z0-9_-]{20,100}$/.test(value) ? value : null;
}

export function passwordProblem(password: string): string | null {
  const length = [...password].length;
  if (length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (length > PASSWORD_MAX) return `Use at most ${PASSWORD_MAX} characters.`;
  return null;
}

/** "ABCD EFGH …": the secret in groups of four, for typing by hand. */
export const groupSecret = (secret: string) =>
  secret.replace(/(.{4})/g, "$1 ").trim();

export function AcceptInvite() {
  const [token] = useState(() => tokenFromHash(window.location.hash));
  const [invite, setInvite] = useState<Invite | null>(null);
  const [loadError, setLoadError] = useState<ApiError | null>(null);
  const [step, setStep] = useState<"details" | "authenticator" | "codes">(
    "details",
  );
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [enrolment, setEnrolment] = useState<Enrolment | null>(null);
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Remove the token from the address bar and history.
  useEffect(() => {
    if (window.location.hash)
      window.history.replaceState(null, "", window.location.pathname);
    document.title = "Set up your account · Sanéa Pret Admin";
  }, []);

  useEffect(() => {
    if (!token) return;
    api
      .post<Invite>("/admin/auth/invites/inspect", { token })
      .then(setInvite, (e: unknown) => setLoadError(toApiError(e)));
  }, [token]);

  useEffect(() => {
    headingRef.current?.focus();
  }, [step, invite]);

  // Forget the secret once set-up is finished or the page closes.
  useEffect(() => () => setEnrolment(null), []);

  if (!token)
    return (
      <AuthLayout>
        <h1>Set up your account</h1>
        <Notice tone="error" title="This link is incomplete">
          <p>
            Open the full link you were sent, or ask the Owner for a new one.
          </p>
        </Notice>
        <Link to="/sign-in">Go to sign-in</Link>
      </AuthLayout>
    );
  if (loadError)
    return (
      <AuthLayout>
        <h1>Set up your account</h1>
        <Notice tone="error" title={loadError.message}>
          <p>
            {loadError.code === "INVITE_INVALID"
              ? "Links work once and expire after 48 hours. Ask the Owner for a new one."
              : "Try again in a moment."}
          </p>
        </Notice>
        <Link to="/sign-in">Go to sign-in</Link>
      </AuthLayout>
    );
  if (!invite)
    return (
      <AuthLayout>
        <Loading label="Checking your link…" />
      </AuthLayout>
    );

  const isReset = invite.kind === "reset";

  async function toAuthenticator(e: FormEvent) {
    e.preventDefault();
    const problems: Record<string, string> = {};
    if (!isReset && !name.trim()) problems.name = "Enter your name.";
    const p = passwordProblem(password);
    if (p) problems.password = p;
    else if (password !== confirm)
      problems.confirm = "The two passwords do not match.";
    setFields(problems);
    if (Object.keys(problems).length) {
      setError(localError("Check the highlighted fields."));
      return;
    }
    setError(null);
    setBusy(true);
    try {
      setEnrolment(
        await api.post<Enrolment>("/admin/auth/invites/enrol", { token }),
      );
      setStep("authenticator");
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(false);
    }
  }

  async function finish(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFields({});
    try {
      const r = await api.post<{ recoveryCodes: string[] }>(
        "/admin/auth/invites/accept",
        {
          token,
          ...(isReset ? {} : { name: name.trim() }),
          password,
          code,
        },
      );
      setRecoveryCodes(r.recoveryCodes);
      setEnrolment(null);
      setPassword("");
      setConfirm("");
      setStep("codes");
    } catch (err) {
      const apiError = toApiError(err);
      const f = apiError.fieldErrors;
      if (apiError.code === "PASSWORD_REJECTED" || f.password || f.name) {
        // Back to the details step with the field error.
        setFields(f.password ? { password: f.password } : f);
        setStep("details");
      } else {
        setFields(f);
      }
      setError(apiError);
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  function download() {
    if (!recoveryCodes) return;
    const text = `Sanéa Pret Admin recovery codes for ${invite!.email}\nEach code works once.\n\n${recoveryCodes.join("\n")}\n`;
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "sanea-pret-admin-recovery-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AuthLayout>
      <Stack gap="2">
        <h1 ref={headingRef} tabIndex={-1}>
          {step === "codes"
            ? "Save your recovery codes"
            : isReset
              ? "Reset your password and two-factor sign-in"
              : "Set up your account"}
        </h1>
        <p className={s.steps}>
          Step {step === "details" ? 1 : step === "authenticator" ? 2 : 3} of 3
        </p>
        <p>
          {invite.email} · {ROLE_NAMES[invite.role] ?? invite.role}
        </p>
      </Stack>

      <ErrorSummary
        error={error}
        fields={fields}
        labels={{
          name: "Name",
          password: "Password",
          confirm: "Confirm password",
          code: "Code",
        }}
      />

      {step === "details" ? (
        <form onSubmit={toAuthenticator} noValidate>
          <Stack>
            {isReset ? null : (
              <TextField
                id="name"
                label="Your name"
                autoComplete="name"
                maxLength={120}
                value={name}
                onChange={(e) => setName(e.target.value)}
                error={fields.name}
              />
            )}
            <input
              type="hidden"
              name="username"
              autoComplete="username"
              value={invite.email}
            />
            <TextField
              id="password"
              label="New password"
              hint={`At least ${PASSWORD_MIN} characters. A passphrase of several words works well. Common passwords are refused.`}
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={fields.password}
            />
            <TextField
              id="confirm"
              label="Confirm password"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              error={fields.confirm}
            />
            <Button type="submit" busy={busy} busyLabel="Preparing…">
              Continue to two-factor set-up
            </Button>
            <Link to="/sign-in">Cancel</Link>
          </Stack>
        </form>
      ) : null}

      {step === "authenticator" && enrolment ? (
        <form onSubmit={finish} noValidate>
          <Stack>
            <p>
              Scan this code with an authenticator app (for example Google
              Authenticator, Microsoft Authenticator or 1Password), then enter
              the 6-digit code it shows.
            </p>
            <QrCode
              value={enrolment.otpauthUri}
              label={`QR code to add Sanéa Pret Admin for ${invite.email} to an authenticator app`}
            />
            <Stack gap="2">
              <p>Cannot scan? Enter this key in the app instead:</p>
              <p className={s.secret} data-testid="totp-secret">
                {groupSecret(enrolment.secret)}
              </p>
              <a href={enrolment.otpauthUri}>
                Open in an authenticator app on this device
              </a>
            </Stack>
            <TextField
              id="code"
              label="6-digit code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              error={fields.code}
            />
            <Button
              type="submit"
              busy={busy}
              busyLabel="Checking…"
              disabled={code.length !== 6}
            >
              Confirm and finish
            </Button>
            <Button
              variant="quiet"
              onClick={() => {
                setEnrolment(null);
                setCode("");
                setError(null);
                setStep("details");
              }}
            >
              Back
            </Button>
          </Stack>
        </form>
      ) : null}

      {step === "codes" && recoveryCodes ? (
        <Stack>
          <Notice tone="success" title="Your account is ready">
            <p>
              Save these recovery codes somewhere safe, such as a password
              manager. Each works once if you lose your phone. They are shown
              only now.
            </p>
          </Notice>
          <ul className={s.codes} aria-label="Recovery codes">
            {recoveryCodes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <Button variant="secondary" onClick={download}>
            Download as a text file
          </Button>
          <Checkbox
            label="I have saved my recovery codes"
            checked={saved}
            onChange={(e) => setSaved(e.target.checked)}
          />
          {saved ? (
            <Link to="/sign-in" replace onClick={() => setRecoveryCodes(null)}>
              Continue to sign-in
            </Link>
          ) : (
            <p className={s.steps}>Confirm you have saved them to continue.</p>
          )}
        </Stack>
      ) : null}
    </AuthLayout>
  );
}
