/**
 * Crude per-IP throttle for the hosted demo.
 *
 * The demo is public and it spends the client's OpenRouter credit, so the writing
 * endpoint cannot be an open LLM proxy. This is intentionally simple: an in-memory
 * counter per instance, which is leaky across serverless instances but cuts the
 * cost of casual abuse from unbounded to a few dollars. A real deployment would put
 * this behind auth; a demo does not need to.
 */

const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 12;

const hits = new Map<string, number[]>();

export function allow(ip: string): { ok: boolean; retryAfterMinutes: number } {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);

  if (recent.length >= MAX_PER_WINDOW) {
    const oldest = Math.min(...recent);
    return { ok: false, retryAfterMinutes: Math.ceil((WINDOW_MS - (now - oldest)) / 60000) };
  }

  recent.push(now);
  hits.set(ip, recent);

  // Keep the map from growing without bound across a long-lived instance.
  if (hits.size > 5000) {
    for (const [key, times] of hits) {
      if (times.every((t) => now - t >= WINDOW_MS)) hits.delete(key);
    }
  }
  return { ok: true, retryAfterMinutes: 0 };
}

export function clientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}
