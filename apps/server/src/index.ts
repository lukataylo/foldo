import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { db } from './db.ts';
import { seed } from './seed.ts';
import { registerAuth } from './auth.ts';
import { registerBoardRoutes } from './routes/boards.ts';
import { registerFrameRoutes } from './routes/frames.ts';
import { registerCommentRoutes } from './routes/comments.ts';
import { registerDispatchRoutes } from './routes/dispatches.ts';
import { registerSourceRoutes } from './routes/sources.ts';
import { registerCaptureRoutes } from './routes/captures.ts';
import { registerAuthRoutes } from './routes/auth.ts';
import { registerWebhookRoutes } from './routes/webhooks.ts';
import { registerBrowserWs } from './ws/browser.ts';
import { registerMcpWs } from './ws/mcp.ts';

const PORT = Number(process.env.PORT ?? 4000);

async function main(): Promise<void> {
  // Seed first so the DB has data before routes go up.
  seed();

  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
    },
  });

  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      const allowed =
        origin === 'http://localhost:5173' ||
        origin === 'http://localhost:5174' ||
        origin.startsWith('chrome-extension://') ||
        origin.startsWith('moz-extension://');
      cb(null, allowed);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });

  await app.register(websocket);

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
  await registerWebhookRoutes(app);

  // WebSocket endpoints
  await registerBrowserWs(app);
  await registerMcpWs(app);

  // Health
  app.get('/health', async () => ({ ok: true, ts: new Date().toISOString() }));

  // Centralised error handler — surface statusCode if attached.
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
          db.close();
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
  app.log.info(`Foldo server listening on http://localhost:${PORT}`);
  app.log.info(`  Browser WS: ws://localhost:${PORT}/ws`);
  app.log.info(`  MCP WS:     ws://localhost:${PORT}/ws/mcp`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal startup error:', err);
  process.exit(1);
});
