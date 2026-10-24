// Published content cache (system-design.md §7): 60 seconds, cleared on
// every publish. In memory, so valid for one API instance (like D-047).
const TTL_MS = 60_000;
const entries = new Map<string, { value: unknown; expires: number }>();

export async function cached<T>(
  key: string,
  load: () => Promise<T>,
  now = Date.now(),
): Promise<T> {
  const hit = entries.get(key);
  if (hit && hit.expires > now) return hit.value as T;
  const value = await load();
  entries.set(key, { value, expires: now + TTL_MS });
  return value;
}

export function invalidateContent(): void {
  entries.clear();
}
