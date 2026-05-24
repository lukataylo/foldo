// Authorisation gates exposed as Fastify decorators.
//
// Before this plugin, every route file that needed to gate on board
// membership / edit-permission rolled its own `requireEditor` /
// `requireMember` helper. The bodies were copy-pasted (~8 sites between
// comments.ts, frames.ts, dispatches.ts, shares.ts, captures.ts,
// boards.ts, tests.ts), which meant any tweak to the error shape / status
// code / log shape had to happen N times. We centralise the gate here so
// every route reaches for `req.server.requireEditor(req, boardId)` and
// gets the same 403 / message / log line for free.
//
// Why a plugin + decorator (not a free function):
//   1. It's discoverable from the request — every handler already has
//      `req.server`, so callers don't need an import.
//   2. The decorators are bound to the FastifyInstance, which means
//      future variants (e.g. an org-scoped requireOwner) compose with
//      the same plugin without changing every call site.
//   3. fp() registers the plugin in the root encapsulation context so
//      the decorators are visible from every route.

import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { canEditBoard, isMember } from '../repo/members.ts';

/**
 * 403 with a stable shape — mirrors what the inline helpers used to throw
 * (`new Error('Not a member of this board')` with `statusCode = 403`), which
 * is what the global error handler in index.ts surfaces as
 * `{ error, code: 'INTERNAL' }`. We tag a `code` here so the public response
 * carries `FORBIDDEN` instead of `INTERNAL`, matching the rest of the
 * `{ error, code: 'FORBIDDEN' }` 403s elsewhere in the API.
 */
export class ForbiddenError extends Error {
  readonly statusCode = 403;
  readonly code = 'FORBIDDEN';
  constructor(message = 'Not a member of this board') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    /**
     * Throw 403 unless the request user can edit (owner or editor) on `boardId`.
     * Use on any mutate-the-board path: create/update/delete frames, dispatches,
     * branches, etc.
     */
    requireEditor: (req: FastifyRequest, boardId: string) => Promise<void>;
    /**
     * Throw 403 unless the request user is a member of `boardId` (owner /
     * editor / viewer). Use on read paths that should still 403 (not 404 leak)
     * for non-members — and on commenting, where viewers may participate.
     */
    requireMember: (req: FastifyRequest, boardId: string) => Promise<void>;
  }
}

export const authGate = fp(
  async (app: FastifyInstance) => {
    app.decorate(
      'requireEditor',
      async (req: FastifyRequest, boardId: string): Promise<void> => {
        const userId = req.user?.id;
        if (!userId) {
          // Mirrors requireUser() — the gate is meaningless without an auth'd
          // user. We still throw 403 (not 401) here because routes that reach
          // requireEditor have always called requireUser() first; this branch
          // is a defence-in-depth fallback rather than the normal "not logged
          // in" path.
          throw new ForbiddenError('Not authenticated');
        }
        if (!(await canEditBoard(boardId, userId))) {
          throw new ForbiddenError('Not a member of this board');
        }
      },
    );

    app.decorate(
      'requireMember',
      async (req: FastifyRequest, boardId: string): Promise<void> => {
        const userId = req.user?.id;
        if (!userId) {
          throw new ForbiddenError('Not authenticated');
        }
        if (!(await isMember(boardId, userId))) {
          throw new ForbiddenError('Not a member of this board');
        }
      },
    );
  },
  { name: 'auth-gate' },
);
