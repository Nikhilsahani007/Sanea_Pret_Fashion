import { pino, type DestinationStream, type Logger } from "pino";

/** Paths redacted from every log line (security-design.md §7). */
export const REDACT_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  'req.headers["x-csrf-token"]',
  'res.headers["set-cookie"]',
  "*.password",
  "*.token",
  "*.otp",
  "*.phone",
  "*.email",
  "*.csrfToken",
];

/** JSON logger with redaction. Pass a stream in tests to capture output. */
export function createLogger(
  level: string,
  destination?: DestinationStream,
): Logger {
  const options = {
    level,
    redact: { paths: REDACT_PATHS, censor: "[REDACTED]" },
    base: { service: "sanea-api" },
  };
  return destination ? pino(options, destination) : pino(options);
}
