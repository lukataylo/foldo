// Foldo screenshot service. Single endpoint:
//
//   GET /shot?url=<encoded-url>&w=1280&h=900&fullpage=0
//
// Returns a PNG. Uses headless Chromium via playwright-core. A pool of one
// browser is kept hot between requests so cold starts are bounded.
//
// Designed to deploy as its own Railway service. Memory: ~250 MB once
// warm. Adds zero coupling to the API server.

import Fastify from 'fastify';
import { chromium, type Browser } from 'playwright-core';

const PORT = Number(process.env.PORT ?? 5180);
const MAX_W = 1920;
const MAX_H = 4096;
const NAV_TIMEOUT_MS = 12_000;
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

const SHARED_SECRET = process.env.FOLDO_SHOT_SECRET; // optional — bearer gate

let browser: Browser | null = null;
async function getBrowser(): Promise<Browser> {
  if (browser && browser.isConnected()) return browser;
  browser = await chromium.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  return browser;
}

const app = Fastify({
  logger: { level: process.env.LOG_LEVEL ?? 'info' },
  bodyLimit: 256 * 1024,
});

app.get('/health', async () => ({ ok: true, ts: new Date().toISOString() }));

app.get<{
  Querystring: { url?: string; w?: string; h?: string; fullpage?: string };
}>('/shot', async (req, reply) => {
  if (SHARED_SECRET) {
    const auth = req.headers.authorization ?? '';
    const match = /^Bearer\s+(.+)$/i.exec(auth);
    if (!match || (match[1] ?? '').trim() !== SHARED_SECRET) {
      return reply.code(401).send({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
    }
  }
  const raw = req.query.url;
  if (!raw) {
    return reply.code(400).send({ error: 'url is required', code: 'BAD_REQUEST' });
  }
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return reply.code(400).send({ error: 'url must be absolute', code: 'BAD_REQUEST' });
  }
  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    return reply.code(400).send({ error: 'only http/https', code: 'BAD_REQUEST' });
  }
  if (isLikelyPrivate(parsed.hostname)) {
    return reply
      .code(400)
      .send({ error: 'private addresses are not allowed', code: 'BAD_REQUEST' });
  }

  const width = clamp(parseInt(req.query.w ?? '1280', 10) || 1280, 320, MAX_W);
  const height = clamp(parseInt(req.query.h ?? '900', 10) || 900, 320, MAX_H);
  const fullPage = req.query.fullpage === '1';

  const b = await getBrowser();
  const ctx = await b.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Foldo/1.0',
  });
  const page = await ctx.newPage();
  try {
    await page.goto(parsed.toString(), {
      waitUntil: 'networkidle',
      timeout: NAV_TIMEOUT_MS,
    });
    const buf = await page.screenshot({ type: 'png', fullPage });
    reply.header('content-type', 'image/png');
    reply.header(
      'cache-control',
      'public, max-age=300, stale-while-revalidate=600',
    );
    return reply.send(buf);
  } catch (err) {
    return reply.code(502).send({
      error: err instanceof Error ? err.message : 'screenshot failed',
      code: 'UPSTREAM',
    });
  } finally {
    await ctx.close().catch(() => undefined);
  }
});

const closeOnce = (() => {
  let closed = false;
  return async (signal: string) => {
    if (closed) return;
    closed = true;
    app.log.info(`Received ${signal}, shutting down…`);
    try {
      await app.close();
    } finally {
      try {
        await browser?.close();
      } catch {
        /* ignore */
      }
      process.exit(0);
    }
  };
})();
process.on('SIGINT', () => void closeOnce('SIGINT'));
process.on('SIGTERM', () => void closeOnce('SIGTERM'));

await app.listen({ port: PORT, host: '0.0.0.0' });
app.log.info(`Foldo shotter listening on http://localhost:${PORT}`);

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Number.isFinite(n) ? n : lo));
}

/**
 * Best-effort SSRF guard. Reject obvious private-network hostnames so a
 * stray request can't enumerate Railway's internal services. Not a complete
 * SSRF fix on its own, but the network layer will also refuse most of these.
 */
function isLikelyPrivate(host: string): boolean {
  const h = host.toLowerCase();
  if (h === 'localhost' || h === '127.0.0.1' || h === '::1') return true;
  if (h.endsWith('.localhost')) return true;
  if (h.endsWith('.local')) return true;
  if (h.endsWith('.railway.internal')) return true;
  if (h.endsWith('.internal')) return true;
  // Numeric IPv4 in private ranges.
  if (/^10\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (/^169\.254\./.test(h)) return true; // link-local
  return false;
}
