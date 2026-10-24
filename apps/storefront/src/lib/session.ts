// A random ID for this browser session, used only to group anonymous
// WhatsApp clicks (system-design.md §9). Not linked to any person.
export function anonymousSessionId(): string {
  try {
    const existing = sessionStorage.getItem("sp:session");
    if (existing) return existing;
    const id = crypto.randomUUID();
    sessionStorage.setItem("sp:session", id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}
