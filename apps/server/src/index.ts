// Side-effect import: loads repo-root .env into process.env BEFORE any other
// module (e.g. ./db.ts) reads it. Must stay at the very top of this file.
import './load-env.ts';

import Fastify from 'fastify';
import cors from '@fastify/cors';
import compress from '@fastify/compress';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import { closePool, initSchema, maybeResetSchema } from './db.ts';
import { seed } from './seed.ts';
import { registerAuth, extractBearerToken, resolveUserFromToken } from './auth.ts';
import { registerBoardRoutes } from './routes/boards.ts';
import { registerFrameRoutes } from './routes/frames.ts';
import { registerCommentRoutes } from './routes/comments.ts';
import { registerDispatchRoutes } from './routes/dispatches.ts';
import { registerSourceRoutes } from './routes/sources.ts';
import { registerCaptureRoutes } from './routes/captures.ts';
import { registerAuthRoutes } from './routes/auth.ts';
import { registerDemoRequestRoutes } from './routes/demoRequests.ts';
import { registerHomeRoutes } from './routes/home.ts';
import { registerWebhookRoutes } from './routes/webhooks.ts';
import { registerShareRoutes } from './routes/shares.ts';
import { registerTestRoutes } from './routes/tests.ts';
import { registerTestSessionRoutes } from './routes/testSessions.ts';
import { registerRecordingRoutes } from './routes/recordings.ts';
import { registerUploadRoutes } from './routes/uploads.ts';
import { registerBrowserWs } from './ws/browser.ts';
import { registerMcpWs } from './ws/mcp.ts';
import { startSessionGc } from './gc.ts';

const PORT = Number(process.env.PORT ?? 4000);

/**
 * Run a boot-critical DB step with exponential backoff. A transient Postgres
 * blip at boot would otherwise throw, exit the process, and put Railway into
 * a restart loop. Retries a few times (≈0.5s, 1s, 2s, 4s) before giving up.
 */
async function withBootRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const maxAttempts = 5;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === maxAttempts) break;
      const delayMs = 250 * 2 ** attempt;
      // eslint-disable-next-line no-console
      console.warn(
        `boot step "${label}" failed (attempt ${attempt}/${maxAttempts}), retrying in ${delayMs}ms`,
        err instanceof Error ? err.message : err,
      );
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}

async function main(): Promise<void> {
  // One-shot guarded DB reset (recover a DB created by an incompatible server
  // version). Runs at most once per unique FOLDO_RESET_DB token; safe to leave
  // the env var set afterward.
  const resetToken = process.env.FOLDO_RESET_DB;
  if (resetToken && resetToken !== '0') {
    await withBootRetry('maybeResetSchema', () => maybeResetSchema(resetToken));
  }
  // Bootstrap schema + seed first so the DB has data before routes go up.
  // Retried with backoff so a transient DB blip at boot doesn't restart-loop.
  await withBootRetry('initSchema', () => initSchema());
  await withBootRetry('seed', () => seed());

  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
    },
    // Behind Railway/any proxy, derive req.ip + req.protocol from
    // X-Forwarded-* so rate limiting and logging see the real client.
    trustProxy: true,
  });

  // Extra origins from env (comma-separated). Lets production deploys add
  // their canvas/web hostnames without a code change. Localhost is always
  // allowed so `npm run dev` keeps working.
  const extraOrigins = (process.env.FOLDO_WEB_ORIGIN ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      const allowed =
        origin === 'http://localhost:5173' ||
        origin === 'http://localhost:5174' ||
        extraOrigins.includes(origin) ||
        origin.startsWith('chrome-extension://') ||
        origin.startsWith('moz-extension://');
      cb(null, allowed);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });

  // Security headers. Loose CSP because the canvas iframes third-party app
  // origins (sample.foldo.dev, customer dev URLs) — a strict default-src
  // 'self' would break the demo. Tighten per-route later when we have a
  // proper allowlist of iframe sources.
  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginEmbedderPolicy: false,
  });

  // Brotli + gzip for all responses big enough to matter. Saves ~70% on the
  // JSON board snapshot which carries every frame's content.
  await app.register(compress, {
    global: true,
    encodings: ['br', 'gzip'],
    threshold: 1024,
  });

  // Global rate limit as a baseline. Write-path routes (uploads, dispatches)
  // get tighter caps via per-route config inside their handlers.
  await app.register(rateLimit, {
    max: 600,
    timeWindow: '1 minute',
    allowList: (req) => req.url === '/health' || req.url === '/readyz',
    // Key on the resolved userId for authenticated callers, otherwise on the
    // client IP. Keying on the raw Authorization header let an attacker mint
    // a fresh random bearer per request: unbounded buckets (memory DoS) and
    // a full quota every time (rate-limit bypass). An unverified bearer now
    // shares its IP's bucket.
    keyGenerator: async (req) => {
      const token = extractBearerToken(req);
      if (token) {
        const user = await resolveUserFromToken(token);
        if (user) return `u:${user.id}`;
      }
      return `ip:${req.ip}`;
    },
  });

  await app.register(websocket);

  // Binary uploads (test-session recordings) are handled as a raw stream:
  // the parser hands the route the unbuffered request stream so a large webm
  // is piped straight to blob storage and never sits whole in memory. The
  // recording route enforces the size cap as bytes flow.
  app.addContentTypeParser(
    'application/octet-stream',
    (_req, payload, done) => done(null, payload),
  );

  // Auth hook
  await registerAuth(app);

  // REST routes
  await registerBoardRoutes(app);
  await registerFrameRoutes(app);
  await registerCommentRoutes(app);
  await registerDispatchRoutes(app);
  await registerSourceRoutes(app);
  await registerCaptureRoutes(app);
  await registerAuthRoutes(app);
  await registerDemoRequestRoutes(app);
  await registerHomeRoutes(app);
  await registerWebhookRoutes(app);
  await registerShareRoutes(app);
  await registerTestRoutes(app);
  await registerTestSessionRoutes(app);
  await registerRecordingRoutes(app);
  await registerUploadRoutes(app);

  // WebSocket endpoints
  await registerBrowserWs(app);
  await registerMcpWs(app);

  // Health
  app.get('/health', async () => ({ ok: true, ts: new Date().toISOString() }));

  // Readiness: deep probe with per-component breakdown. Railway can gate
  // deploys + alerts can fire on 503 without false positives from a slow
  // request handler.
  app.get('/readyz', async (_req, reply) => {
    const components: Record<string, { ok: boolean; latencyMs?: number; error?: string }> = {};
    let allOk = true;
    const t0 = Date.now();
    try {
      const { query } = await import('./db.ts');
      await query('SELECT 1');
      components.postgres = { ok: true, latencyMs: Date.now() - t0 };
    } catch (err) {
      allOk = false;
      components.postgres = {
        ok: false,
        latencyMs: Date.now() - t0,
        error: err instanceof Error ? err.message : String(err),
      };
    }
    const body = { ok: allOk, ts: new Date().toISOString(), components };
    return reply.code(allOk ? 200 : 503).send(body);
  });

  // Centralised error handler, surface statusCode if attached. 5xx errors
  // are logged in full server-side but return a generic message so we never
  // leak pg/SQL internals (table names, constraint text) to the client.
  // 4xx messages are intentional and safe to surface.
  app.setErrorHandler((err, req, reply) => {
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    if (status >= 500) {
      req.log.error({ err }, 'request failed');
    }
    const message =
      status >= 500
        ? 'Internal server error'
        : err instanceof Error
          ? err.message
          : 'Request error';
    reply.code(status).send({
      error: message,
      code: status === 401 ? 'UNAUTHORIZED' : 'INTERNAL',
    });
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
          await closePool();
        } catch {
          /* ignore */
        }
        process.exit(0);
      }
    };
  })();
  process.on('SIGINT', () => void closeOnce('SIGINT'));
  process.on('SIGTERM', () => void closeOnce('SIGTERM'));

  // Background sweep: mark dangling test sessions as abandoned.
  startSessionGc();

  await app.listen({ port: PORT, host: '0.0.0.0' });
  app.log.info(`Foldo server listening on http://localhost:${PORT}`);
  app.log.info(`  Browser WS: ws://localhost:${PORT}/ws`);
  app.log.info(`  MCP WS:     ws://localhost:${PORT}/ws/mcp`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal startup error:', err);
  process.exit(1);
});
