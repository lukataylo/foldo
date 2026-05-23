// Side-effect import: loads repo-root .env into process.env BEFORE any other
// module (e.g. ./db.ts) reads it. Must stay at the very top of this file.
import './load-env.ts';

import { randomBytes } from 'node:crypto';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { closePool, initSchema, pool } from './db.ts';
import { seed } from './seed.ts';
import { registerAuth } from './auth.ts';
import { registerBoardRoutes } from './routes/boards.ts';
import { registerFrameRoutes } from './routes/frames.ts';
import { registerCommentRoutes } from './routes/comments.ts';
import { registerDispatchRoutes } from './routes/dispatches.ts';
import { registerSourceRoutes } from './routes/sources.ts';
import { registerCaptureRoutes } from './routes/captures.ts';
import { registerAuthRoutes } from './routes/auth.ts';
import { registerMeRoutes } from './routes/me.ts';
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
import { hubInitFallback, registerMetrics } from './metrics.ts';
import { inMemoryHub, setActiveHub } from './ws/hub.ts';
import { RedisHub } from './ws/redisHub.ts';

const PORT = Number(process.env.PORT ?? 4000);

/**
 * Pick the WS hub backend based on env. Returns the active hub
 * description for the boot log. If REDIS_URL is set we try RedisHub,
 * but fall back to the in-memory hub on connect failure rather than
 * crashing the server — a stuck Redis blip shouldn't take the API
 * down. The fallback bumps {@link hubInitFallback} so prod alerts fire.
 */
async function selectHub(): Promise<string> {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    return '[ws] hub=in-memory (set REDIS_URL to enable horizontal scaling)';
  }
  try {
    const redisHub = new RedisHub(redisUrl);
    await redisHub.waitReady();
    setActiveHub(redisHub);
    // Redact credentials from the URL we log.
    const safeUrl = (() => {
      try {
        const u = new URL(redisUrl);
        if (u.password) u.password = '***';
        if (u.username) u.username = '***';
        return u.toString();
      } catch {
        return 'redis://<unparseable>';
      }
    })();
    return `[ws] hub=redis url=${safeUrl}`;
  } catch (err) {
    hubInitFallback.inc();
    // eslint-disable-next-line no-console
    console.warn(
      `[ws] RedisHub init FAILED, falling back to in-memory hub — multi-replica deploys WILL desync. err=${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    setActiveHub(inMemoryHub);
    return '[ws] hub=in-memory (Redis init failed — DEGRADED)';
  }
}

async function main(): Promise<void> {
  // Bootstrap schema + seed first so the DB has data before routes go up.
  await initSchema();
  await seed();

  const hubBootLine = await selectHub();

  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
      // base fields appear on every log line and stay consistent across
      // restarts so log aggregators can group by service.
      base: {
        service: 'foldo-server',
        env: process.env.NODE_ENV ?? 'development',
      },
    },
    // Per-process counter reqIds collide on restart, making log search across
    // a deploy painful. A short random suffix makes them globally unique
    // without inflating every line (8 hex chars = 32 bits of entropy = plenty
    // for trace correlation).
    genReqId: () => `req-${randomBytes(4).toString('hex')}`,
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

  // Locking down the chrome-extension allowlist: before, ANY chrome-extension
  // origin could call the API (lets a malicious extension on a tester's box
  // siphon data with the user's session). Now we require an explicit
  // FOLDO_EXTENSION_ID env (the Web Store id) and only that single origin is
  // accepted. In dev (NODE_ENV !== 'production') we keep the permissive
  // behaviour so unpacked dev builds don't need a config flag, but we log a
  // startup warning so the gap doesn't sneak into prod silently.
  const isProd = process.env.NODE_ENV === 'production';
  const extensionId = (process.env.FOLDO_EXTENSION_ID ?? '').trim();
  const allowedExtensionOrigin = extensionId
    ? `chrome-extension://${extensionId}`
    : null;
  if (isProd && !allowedExtensionOrigin) {
    app.log.warn(
      'FOLDO_EXTENSION_ID is not set in production — the Foldo browser extension will be CORS-rejected. Set it to the Web Store id to enable extension traffic.',
    );
  } else if (!isProd && !allowedExtensionOrigin) {
    app.log.warn(
      'FOLDO_EXTENSION_ID not set; allowing any chrome-extension:// origin (dev only). Set it before deploying to production.',
    );
  }

  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (
        origin === 'http://localhost:5173' ||
        origin === 'http://localhost:5174' ||
        extraOrigins.includes(origin)
      ) {
        return cb(null, true);
      }
      if (origin.startsWith('chrome-extension://')) {
        if (allowedExtensionOrigin) {
          return cb(null, origin === allowedExtensionOrigin);
        }
        // No allowlist configured: permissive in dev, deny in prod.
        return cb(null, !isProd);
      }
      if (origin.startsWith('moz-extension://')) {
        // No Firefox extension shipping yet; mirror the chrome behaviour
        // (permissive in dev, denied in prod) so we don't accidentally
        // whitelist every Firefox extension on a tester's box.
        return cb(null, !isProd);
      }
      cb(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });

  await app.register(websocket);

  // Raw-body parser for binary uploads (test-session recordings). The default
  // Fastify body limit is 1 MB, far too small for a webm; bump it for this
  // content type only so JSON routes keep their tight limit.
  app.addContentTypeParser(
    'application/octet-stream',
    { parseAs: 'buffer', bodyLimit: 256 * 1024 * 1024 },
    (_req, body, done) => done(null, body),
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
  await registerMeRoutes(app);
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

  // Health + Prometheus metrics. Both unauthenticated — keep them behind a
  // network allowlist in prod.
  //
  // /health used to return {ok:true} unconditionally, so a degraded process
  // (DB pool exhausted, Postgres unreachable) still looked healthy to load
  // balancers. Now we run a cheap `SELECT 1` with a 1s timeout AND require
  // the process to be at least 5s old — the latter stops orchestrators
  // routing traffic to a freshly-launched replica before initSchema/seed have
  // settled.
  app.get('/health', async (_req, reply) => {
    if (process.uptime() < 5) {
      reply.code(503).send({
        ok: false,
        reason: 'warmup',
        uptimeSec: process.uptime(),
        ts: new Date().toISOString(),
      });
      return;
    }
    let client;
    try {
      client = await pool.connect();
      // statement_timeout is per-session so it doesn't bleed into other
      // requests. 1000ms is long enough for any healthy primary, short
      // enough that a wedged DB doesn't tie up the health-check connection.
      await client.query("SET LOCAL statement_timeout = '1000ms'");
      await client.query('SELECT 1');
      reply.send({ ok: true, ts: new Date().toISOString() });
    } catch (err) {
      app.log.warn({ err }, '/health DB probe failed');
      reply.code(503).send({
        ok: false,
        db: 'unreachable',
        ts: new Date().toISOString(),
      });
    } finally {
      if (client) client.release();
    }
  });
  registerMetrics(app);

  // Centralised error handler, surface statusCode if attached.
  app.setErrorHandler((err, _req, reply) => {
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    const message =
      err instanceof Error ? err.message : 'Internal error';
    reply.code(status).send({
      error: message,
      code: status === 401 ? 'UNAUTHORIZED' : 'INTERNAL',
    });
  });

  /** Hard cap on how long graceful shutdown is allowed to run. */
  const DRAIN_TIMEOUT_MS = 30_000;
  const closeOnce = (() => {
    let closed = false;
    return async (signal: string) => {
      if (closed) return;
      closed = true;
      app.log.info(`Received ${signal}, draining (up to ${DRAIN_TIMEOUT_MS}ms)…`);
      // Race app.close() against the drain timeout. app.close() waits for
      // in-flight requests to finish; if a slow handler hangs past the
      // budget we force-exit so the orchestrator doesn't have to SIGKILL us.
      const closePromise = app.close().then(() => 'graceful' as const);
      const timeoutPromise = new Promise<'forced'>((resolve) => {
        const t = setTimeout(() => resolve('forced'), DRAIN_TIMEOUT_MS);
        if (typeof t.unref === 'function') t.unref();
      });
      let outcome: 'graceful' | 'forced' = 'forced';
      try {
        outcome = await Promise.race([closePromise, timeoutPromise]);
      } catch (err) {
        app.log.error({ err }, 'error during graceful shutdown');
      }
      app.log.info({ outcome }, `shutdown ${outcome}`);
      try {
        await closePool();
      } catch {
        /* ignore */
      }
      process.exit(outcome === 'graceful' ? 0 : 1);
    };
  })();
  process.on('SIGINT', () => void closeOnce('SIGINT'));
  process.on('SIGTERM', () => void closeOnce('SIGTERM'));

  // Background sweep: mark dangling test sessions as abandoned.
  startSessionGc();

  await app.listen({ port: PORT, host: '0.0.0.0' });
  // keepAliveTimeout slightly longer than the typical LB idle timeout (usually
  // 30s) so the LB closes idle conns rather than us — avoids a class of
  // "ECONNRESET on the next request" errors. 31s is the canonical value.
  app.server.keepAliveTimeout = 31_000;
  // headersTimeout must be > keepAliveTimeout per the Node http docs, else
  // we get spurious 408s on the keepalive boundary.
  app.server.headersTimeout = 32_000;
  app.log.info(`Foldo server listening on http://localhost:${PORT}`);
  app.log.info(`  Browser WS: ws://localhost:${PORT}/ws`);
  app.log.info(`  MCP WS:     ws://localhost:${PORT}/ws/mcp`);
  app.log.info(hubBootLine);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal startup error:', err);
  process.exit(1);
});
