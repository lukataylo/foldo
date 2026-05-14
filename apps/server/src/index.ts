// Side-effect import: loads repo-root .env into process.env BEFORE any other
// module (e.g. ./db.ts) reads it. Must stay at the very top of this file.
import './load-env.ts';

import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { closePool, initSchema } from './db.ts';
import { seed } from './seed.ts';
import { registerAuth } from './auth.ts';
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
import { registerBrowserWs } from './ws/browser.ts';
import { registerMcpWs } from './ws/mcp.ts';
import { startSessionGc } from './gc.ts';

const PORT = Number(process.env.PORT ?? 4000);

async function main(): Promise<void> {
  // Bootstrap schema + seed first so the DB has data before routes go up.
  await initSchema();
  await seed();

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
  await registerDemoRequestRoutes(app);
  await registerHomeRoutes(app);
  await registerWebhookRoutes(app);
  await registerShareRoutes(app);
  await registerTestRoutes(app);
  await registerTestSessionRoutes(app);
  await registerRecordingRoutes(app);

  // WebSocket endpoints
  await registerBrowserWs(app);
  await registerMcpWs(app);

  // Health
  app.get('/health', async () => ({ ok: true, ts: new Date().toISOString() }));

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
