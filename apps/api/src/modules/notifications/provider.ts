// Email provider abstraction (system-design.md §11). Release one has only the
// log provider: it writes the subject and a masked recipient to the server
// log and sends nothing. A real provider follows OD-19 (B-08).
import type { Logger } from "pino";

import type { Email } from "./templates.ts";

export interface EmailProvider {
  readonly name: string;
  send(to: string, email: Email): Promise<void>;
}

/** a***@example.com: enough to trace, not enough to read the address. */
export function maskEmail(address: string): string {
  const [user = "", domain = ""] = address.split("@");
  return `${user.slice(0, 1)}***@${domain}`;
}

export function logEmailProvider(logger: Logger): EmailProvider {
  return {
    name: "log",
    async send(to, email) {
      logger.info(
        { to: maskEmail(to), subject: email.subject, chars: email.text.length },
        "email (log provider, not sent)",
      );
    },
  };
}
