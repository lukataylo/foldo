import type { FunnelEventName } from '@foldo/protocol';
import { query, queryOne, exec } from '../db.ts';
import { newId } from '../util.ts';

// Server-side funnel instrumentation. Six events cover the whole journey:
// signup → first_board → first_walkthrough → first_comment → first_dispatch
// → conversion. Every emit is fire-and-forget from the caller's perspective
// and idempotent per user (partial unique index on (name, user_id)), so
// route code can call this on the hot path without checking "was this their
// first?".

export interface TrackOptions {
  userId?: string;
  boardId?: string;
  metadata?: Record<string, unknown>;
}

export async function trackFunnelEvent(
  name: FunnelEventName,
  opts: TrackOptions = {},
): Promise<void> {
  let userId = opts.userId ?? null;
  if (!userId && opts.boardId) {
    // Board-scoped events (first_walkthrough) attribute to the board owner.
    const owner = await queryOne<{ user_id: string }>(
      `SELECT user_id FROM board_members WHERE board_id = $1 AND role = 'owner' LIMIT 1`,
      [opts.boardId],
    );
    userId = owner?.user_id ?? null;
  }
  await exec(
    `INSERT INTO analytics_events (id, name, user_id, board_id, metadata_json)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (name, user_id) WHERE user_id IS NOT NULL DO NOTHING`,
    [
      newId('evt'),
      name,
      userId,
      opts.boardId ?? null,
      opts.metadata ? JSON.stringify(opts.metadata) : null,
    ],
  );
}

export async function funnelSnapshot(): Promise<Record<string, number>> {
  const rows = await query<{ name: string; count: string }>(
    `SELECT name, COUNT(*)::text AS count FROM analytics_events GROUP BY name`,
  );
  const counts: Record<string, number> = {
    signup: 0,
    first_board: 0,
    first_walkthrough: 0,
    first_comment: 0,
    first_dispatch: 0,
    conversion: 0,
  };
  for (const r of rows) counts[r.name] = Number(r.count);
  return counts;
}
