// Fixed, test-only values for the end-to-end stack. Never used outside e2e.
export const API_PORT = 4100;
export const ADMIN_URL = "http://localhost:5174";
export const STOREFRONT_URL = "http://localhost:5173";
export const MFA_KEY_B64 = Buffer.alloc(32, 0x3c).toString("base64");

/** Admin accounts created by the stack, one per role. TOTP secrets are fixed. */
export const ADMINS = {
  OWNER: {
    email: "e2e-owner@example.test",
    name: "TEST Owner",
    secret: "e2e-owner-totp-secret-20b",
  },
  MANAGER: {
    email: "e2e-manager@example.test",
    name: "TEST Manager",
    secret: "e2e-manager-totp-secret",
  },
  CATALOGUE_EDITOR: {
    email: "e2e-editor@example.test",
    name: "TEST Editor",
    secret: "e2e-editor-totp-secret!",
  },
  FULFILMENT: {
    email: "e2e-fulfilment@example.test",
    name: "TEST Fulfilment",
    secret: "e2e-fulfil-totp-secret!",
  },
} as const;
export const PASSWORD = "e2e test passphrase only";

export type Role = keyof typeof ADMINS;
