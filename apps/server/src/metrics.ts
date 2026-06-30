// Prometheus metrics surface. Exposes /metrics on the same Fastify
// instance. Anything that wants to bump a custom counter / observe a
// histogram does it through the registry exported here.
//
// Conventions:
//   - HTTP request rate + duration: `foldo_http_*` (collected by a Fastify
//     onResponse hook so every route is covered automatically).
//   - WS connections: gauge updated by the hub.
//   - Background jobs: counters labelled by job + outcome.
//   - DB pool: optional gauges driven by a periodic sampler.

import type { FastifyInstance } from 'fastify';
import {
  Counter,
  Gauge,
  Histogram,
  Registry,
  collectDefaultMetrics,
} from 'prom-client';
import { pool as dbPool } from './db.ts';

export const registry = new Registry();

// node_process_cpu_seconds_total, nodejs_heap_size_total_bytes, etc.
// Useful for "is the server about to OOM" alerting at near-zero implementation
// cost. Pino logs cover behavior; metrics cover health.
collectDefaultMetrics({ register: registry });

export const httpRequests = new Counter({
  name: 'foldo_http_requests_total',
  help: 'Total HTTP requests handled, labelled by method, route, status.',
  labelNames: ['method', 'route', 'status'] as const,
  registers: [registry],
});

export const httpRequestDuration = new Histogram({
  name: 'foldo_http_request_duration_seconds',
  help: 'HTTP request duration in seconds, labelled by method + route.',
  labelNames: ['method', 'route'] as const,
  // 5ms → 5s — covers everything from a hot cache hit to a slow Postgres
  // query without forcing prom-client to allocate 30 buckets we never use.
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registry],
});

export const wsConnections = new Gauge({
  name: 'foldo_ws_connections',
  help: 'Currently-connected browser WebSocket clients, labelled by board.',
  labelNames: ['boardId'] as const,
  registers: [registry],
});

export const wsBroadcastSeq = new Counter({
  name: 'foldo_ws_broadcast_total',
  help: 'Total messages broadcast to each board, labelled by message type.',
  labelNames: ['boardId', 'type'] as const,
  registers: [registry],
});

/**
 * Hub-level WS gauges. The hub mutates a tiny stats object whenever it
 * touches its boards Map; the `.collect()` callbacks below read that
 * object so prom-client always reports the freshest snapshot at scrape
 * time. The hub registers its sampler via {@link setWsHubSampler}; until
 * it does the gauges report 0 (which is the correct value pre-boot).
 */
export interface WsHubSample {
  /** Number of active boards in the hub map. */
  boardCount: number;
  /** Max age (seconds) of the oldest message still in any board's replay buffer. */
  oldestSeqAgeSeconds: number;
  /** Sum of estimated payload bytes across every replay buffer. */
  bufferSizeBytes: number;
}

let wsHubSampler: (() => WsHubSample) | null = null;

/**
 * Wire the hub-stats sampler. Called once at boot by whichever Hub impl
 * (in-memory or Redis-backed) is active. The sampler should be cheap —
 * it runs on every Prometheus scrape (≤ once per 15 s in practice).
 */
export function setWsHubSampler(sampler: () => WsHubSample): void {
  wsHubSampler = sampler;
}

function sampleWsHub(): WsHubSample {
  if (!wsHubSampler) return { boardCount: 0, oldestSeqAgeSeconds: 0, bufferSizeBytes: 0 };
  try {
    return wsHubSampler();
  } catch {
    return { boardCount: 0, oldestSeqAgeSeconds: 0, bufferSizeBytes: 0 };
  }
}

export const wsBoardCount = new Gauge({
  name: 'foldo_ws_board_count',
  help: 'Number of boards currently tracked in the WS hub map.',
  registers: [registry],
  collect() {
    this.set(sampleWsHub().boardCount);
  },
});

export const wsOldestSeqAgeSeconds = new Gauge({
  name: 'foldo_ws_oldest_seq_age_seconds',
  help: 'Age in seconds of the oldest message still in any board replay buffer.',
  registers: [registry],
  collect() {
    this.set(sampleWsHub().oldestSeqAgeSeconds);
  },
});

export const wsBufferSizeBytes = new Gauge({
  name: 'foldo_ws_buffer_size_bytes',
  help: 'Estimated total bytes held across every board replay buffer.',
  registers: [registry],
  collect() {
    this.set(sampleWsHub().bufferSizeBytes);
  },
});

/**
 * Incremented every time `getMissedSince` returns null (the requested
 * sinceSeq is older than the oldest cached message). The client has to
 * fall back to a full REST refetch — a useful signal for "is our replay
 * buffer too small?".
 */
export const wsReplayGaps = new Counter({
  name: 'foldo_ws_replay_gaps_total',
  help: 'Replay-buffer gaps: getMissedSince returned null, client must REST refetch.',
  labelNames: ['boardId'] as const,
  registers: [registry],
});

/**
 * Incremented when the Redis hub fails to initialise (e.g. bad
 * REDIS_URL, network blip during boot) and we fall back to the
 * in-memory hub. A single bump per process. In prod this should fire an
 * alert — the deploy is running degraded.
 */
export const hubInitFallback = new Counter({
  name: 'foldo_hub_init_fallback_total',
  help: 'Redis hub init failures that fell back to in-memory hub.',
  registers: [registry],
});

export const jobOutcomes = new Counter({
  name: 'foldo_job_outcomes_total',
  help: 'Background job runs by outcome (ok / failed).',
  labelNames: ['job', 'outcome'] as const,
  registers: [registry],
});

/**
 * Rate-limit hit counter. `bucket` matches the bucket arg passed to
 * `rateLimitPreHandler` / `userMutationLimit` (e.g. `auth-login`,
 * `comments-create`). `outcome` = `allowed` for under-cap requests,
 * `denied` for the 429 path. The ratio `denied / (allowed+denied)` per
 * bucket is the alerting signal — sustained > 1 % on a public endpoint
 * means a script is hammering us; sustained > 0.1 % on a mutation
 * bucket means our cap is too low for legit usage.
 */
export const rateLimitHits = new Counter({
  name: 'foldo_rate_limit_hits_total',
  help: 'Rate-limit decisions per bucket. outcome=allowed|denied.',
  labelNames: ['bucket', 'outcome'] as const,
  registers: [registry],
});

export const dbPoolIdle = new Gauge({
  name: 'foldo_db_pool_idle',
  help: 'Idle connections in the pg pool right now.',
  registers: [registry],
  collect() {
    this.set(dbPool.idleCount);
  },
});

export const dbPoolTotal = new Gauge({
  name: 'foldo_db_pool_total',
  help: 'Total connections in the pg pool right now.',
  registers: [registry],
  collect() {
    this.set(dbPool.totalCount);
  },
});

/**
 * Mount /metrics and an onResponse hook that records every request. Call
 * once from index.ts after the other routes are registered so the
 * metrics route appears in `app.printRoutes()` last.
 *
 * Authentication: /metrics is unauthenticated by default. Real deploys
 * should put it behind a network-level allowlist (Prometheus is usually
 * inside the same VPC as the service). If you want token-gated access,
 * wrap the handler with a preHandler that checks an env-configured
 * scrape token.
 */
export function registerMetrics(app: FastifyInstance): void {
  app.addHook('onResponse', async (req, reply) => {
    // Prefer the route definition over the raw URL so paths with params
    // (`/api/boards/:id`) don't explode the cardinality.
    const route = (req.routeOptions?.url ?? req.url ?? 'unknown').split('?')[0] ?? 'unknown';
    const labels = {
      method: req.method,
      route,
      status: String(reply.statusCode),
    };
    httpRequests.inc(labels);
    // reply.elapsedTime is in ms; histogram wants seconds.
    httpRequestDuration.observe(
      { method: req.method, route },
      reply.elapsedTime / 1000,
    );
  });

  app.get('/metrics', async (_req, reply) => {
    reply.header('Content-Type', registry.contentType);
    return registry.metrics();
  });
}
