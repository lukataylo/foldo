// Background-job logger. Request handlers get a per-request logger from
// Fastify with reqId + userId already attached; jobs that run outside a
// request (gc sweep, dispatch simulator) call
// `jobLogger(name)` to get a logger with the same shape so log filtering
// works uniformly.
//
// Pino is used directly rather than reusing the Fastify app's logger so
// the import graph doesn't depend on the running server instance.

import pino from 'pino';

const root = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: {
    service: 'foldo-server',
    env: process.env.NODE_ENV ?? 'development',
  },
});

/**
 * Get a child logger tagged with a job name. Use one per background job:
 *
 *   const log = jobLogger('gc');
 *   log.info({ swept: n }, 'session sweep complete');
 *
 * The child logger inherits level + base fields and adds `job: <name>`.
 */
export function jobLogger(name: string): pino.Logger {
  return root.child({ job: name });
}

export type Logger = pino.Logger;
