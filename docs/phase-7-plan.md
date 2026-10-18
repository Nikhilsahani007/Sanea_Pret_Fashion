# Phase 7 Plan — Admin Authentication, Roles and Audit (API only)

Status: **Approved (D-062 to D-075); migration approved; implemented and verified locally.** Branch `phase-7-admin-auth` from `cb72b6b`, committed for draft PR #5 into `main`. Gate pending. · Date: 2026-10-19

## Scope
Admin sign-in with mandatory 2FA, server-side sessions, session-bound CSRF, staff invites and resets, role middleware with the `security-design.md` §4 matrix, and the audit log. API only; the admin shell is Phase 8. No new packages: Argon2id and TOTP use Node's built-in `crypto` (D-062, D-064).

Endpoints:
- `/api/v1/admin/auth/*`: sign-in, the 2FA step, sign-out, current admin;
- `/api/v1/admin/staff`: Owner only;
- `/api/v1/admin/audit-log`: Owner only;
- the invite-acceptance endpoints.

## Decisions
D-062 Argon2id built in · D-063 bundled breached-password list · D-064 TOTP built in · D-065 AES-256-GCM 2FA secrets · D-066 two-step sign-in and lockout · D-067 session cookie · D-068 session-bound CSRF for admin · D-069 first-Owner CLI · D-070 invites · D-071 recovery codes and reset invites · D-072 staff safety rules · D-073 audit contents and IP hashing · D-074 rate limits · D-075 permission matrix in code. Full text: `DECISION-LOG.md`.

## Migration `20261018202335_admin_auth` (written, not approved)
- **Generated** by `prisma migrate diff --from-schema <Phase 6 schema> --to-schema prisma/schema.prisma` (no database touched):
  - `admin_user` gains `mfa_key_version`, `mfa_enabled_at` and `mfa_last_used_step`;
  - new tables `admin_invite` and `admin_recovery_code`, with their indexes;
  - three foreign keys: an admin's reset invites and recovery codes are deleted with the admin; the inviter link uses `RESTRICT`.
- **Handwritten CHECKs (8):**
  - an active admin must have 2FA (D-032);
  - the 2FA secret and its key version are set together;
  - the last-used TOTP step is not negative;
  - the invite token hash is 32 bytes, the invite expires after it is created, and it cannot be both accepted and revoked;
  - the invite's pending secret and its key version are set together;
  - the recovery-code hash is 32 bytes.

## Validation on disposable databases (2026-10-19)
Target: Compose project `sanea-p7-validation`, `postgres:18.6-alpine` on `127.0.0.1:55434`, database `sanea_test`, random password never printed; removed afterwards with its volume and network.

| Check | Result |
|-------|--------|
| `npm run test:integration` (template migrated with both migrations, then drift-checked) | 8 files, 149 tests passed, including the new `admin-auth.db-test.ts` (Phase 7 rules and cascades) |
| Upgrade path: Phase 6 migration, then seed, then Phase 7 migration | Applied cleanly; seeded data kept (3 products, 14 movements) |
| `prisma migrate status` | Up to date |
| Drift: schema vs database, and migrations folder (shadow) vs database | No difference (exit 0) |
| Live catalogue | 22 tables, 34 CHECKs, 25 foreign keys |
| Unit suite | 21 files, 391 tests passed |

Note: the new 2FA CHECK would stop the upgrade if a database held an active admin without 2FA. No such database exists; the seed creates no admins.

## Also in this change
`.gitattributes` now pins LF line endings (`* text=auto eol=lf`). With `core.autocrlf=true` on Windows, checkouts were CRLF, and `npm run format:check` failed locally on every file even though Git normalises them on commit. No file content changed.

## Implementation (2026-10-19)
- **`modules/auth`:**
  - `password` (Argon2id, policy, bundled list), `totp`, `secrets` (AES-256-GCM, tokens, recovery codes, IP hashing), `challenge`, `sessions`;
  - `sign-in` (two steps, lockout, atomic code claim), `invites` (invite, enrol, accept, reset);
  - `middleware` (session loading, `requireAdmin`, `requirePermission`), `permissions` (the §4 matrix), `router`, `create-owner` (CLI).
- **`modules/staff`:** list, invite, PATCH role or active flag, reset; enforces the D-072 rules.
- **`modules/audit`:** `recordAudit`, and `GET /admin/audit-log` with keyset pagination.
- **Platform:**
  - config requires `DATABASE_URL`, `MFA_ENCRYPTION_KEY` and `IP_HASH_KEY`;
  - the API connects at start-up (`SELECT 1`) and shuts down server first, then the database;
  - the CSRF check binds to the admin session;
  - log redaction adds challenge, code, recovery codes, secret, otpauth URI and invite URL;
  - new error codes `SIGN_IN_FAILED`, `UNAUTHENTICATED`, `FORBIDDEN`, `INVITE_INVALID`, `PASSWORD_REJECTED` and `CONFLICT`, added to `api-specification.md` first.

## Results (local, 2026-10-19)
| Check | Result |
|-------|--------|
| Format, lint, typecheck | Pass |
| Unit suite | 22 files, 429 tests passed (incl. RFC 6238 and 4226 test values, and the permission matrix compared with the §4 table) |
| Database and API suite (disposable PostgreSQL 18.6) | 11 files, 267 tests passed |
| Role matrix | 15 permissions × 4 roles = 60 cases plus 15 unauthenticated cases; real staff and audit routes for each role |
| Sign-in | Generic failures identical; lockout after 5 wrong passwords or codes, unlock after 15 minutes; code reuse refused, including two concurrent uses of one code; challenges expire and stop after a sign-in |
| Sessions | `__Host-sp_admin; Max-Age=28800; Path=/; HttpOnly; Secure; SameSite=Strict`; only the hash stored; 30-minute idle and 8-hour absolute limits; rotation at sign-in; sign-out deletes |
| CSRF | A double-submit token or another session's token is refused when a session exists; a foreign Origin is refused |
| Invites and resets | Single use, 48 hours, older link revoked, password policy, wrong code, existing email (409), reset ends sessions and replaces recovery codes, recovery codes single use |
| Staff rules | Last Owner cannot be demoted or deactivated; no self-deactivation; changes end the target's sessions and are audited |
| Logs and audit | No password, code, challenge, session token or email in logs; no email or password in audit rows |
| Rate limit | 11th sign-in attempt in 15 minutes: 429 |
| Real processes | API refuses to start without a database (exit 1, no password printed); `admin:create-owner` prints a link, then refuses; full invite, enrol, sign-in, staff and sign-out flow over HTTP; no secrets in the server log |
| Linux shutdown with a database | SIGTERM and SIGINT: exit 0 in 12 and 14 ms, stderr empty |
| `npm audit` | 0 vulnerabilities |

## Limitations
- **Common-password list:** only 483 entries are 12 or more characters, so it catches few passwords on its own; the 12-character minimum does most of the work. A larger list or the HIBP range check can be evaluated later.
- **Rate limits:** in memory, single instance (D-047).
- **Key rotation:** the key version is stored, but rotation tooling does not exist yet. A secret under another version cannot be decrypted and sign-in fails, with an error logged.
- **Invite links:** passed on by hand until an email provider exists (Phase 16).

## Next
1. CI on draft PR #5, then your review of the Phase 7 gate.
