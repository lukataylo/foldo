import type { FastifyReply, FastifyRequest } from 'fastify';

/**
 * Tiny dependency-free in-memory rate limiter for the public test endpoints.
 *
 * Fixed-window counters keyed by `bucket:ip`. This is intentionally simple —
 * it runs per-process (good enough for a single-instance deploy and the
 * abuse it's guarding against is crude scripted spam, not a distributed
 * attack). Graduate to a Redis-backed limiter alongside the queue work on the
 * roadmap if Foldo ever runs multi-instance.
 */
interface WindowEntry {
  count: number;
  /** Epoch ms at which this window resets. */
  resetAt: number;
}

const windows = new Map<string, WindowEntry>();

// Opportunistic sweep so the map can't grow unbounded under churn.
let lastSweep = 0;
function sweep(now: number): void {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, entry] of windows) {
    if (entry.resetAt <= now) windows.delete(key);
  }
}

export interface RateLimitResult {
  ok: boolean;
  /** Seconds until the window resets — useful for a `Retry-After` header. */
  retryAfterSeconds: number;
}

/**
 * Loopback traffic is the dev box, CI, e2e runs, and the server talking to
 * itself — never a real abusive client — so it's exempt. Real clients always
 * arrive with a routable IP (provided Fastify's `trustProxy` is on behind a
 * proxy, which it is).
 */
function isLoopback(ip: string): boolean {
  return (
    ip === '::1' ||
    ip === '::ffff:127.0.0.1' ||
    ip.startsWith('127.') ||
    ip === 'unknown'
  );
}

/**
 * Record a hit for `bucket` from `clientIp` and report whether it's allowed.
 * `limit` requests are permitted per `windowMs`.
 */
export function rateLimit(
  bucket: string,
  clientIp: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  sweep(now);
  const key = `${bucket}:${clientIp}`;
  let entry = windows.get(key);
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + windowMs };
    windows.set(key, entry);
  }
  entry.count += 1;
  if (entry.count > limit) {
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
    };
  }
  return { ok: true, retryAfterSeconds: 0 };
}

/**
 * Build a Fastify `preHandler` that enforces a fixed-window limit keyed by
 * `req.ip`. On breach it sends a `429` with the standard `{ error, code }`
 * shape and a `Retry-After` header, and the route handler never runs.
 *
 * Usage: `app.post(path, { preHandler: rateLimitPreHandler('sessions', 10, 60_000) }, handler)`
 */
export function rateLimitPreHandler(
  bucket: string,
  limit: number,
  windowMs: number,
): (req: FastifyRequest, reply: FastifyReply) => Promise<void> {
  return async (req, reply) => {
    const ip = req.ip || 'unknown';
    if (isLoopback(ip)) return; // dev / CI / same-box — not a real client
    const result = rateLimit(bucket, ip, limit, windowMs);
    if (!result.ok) {
      reply
        .code(429)
        .header('Retry-After', String(result.retryAfterSeconds))
        .send({
          error: 'Too many requests, please slow down',
          code: 'RATE_LIMITED',
        });
    }
  };
}
