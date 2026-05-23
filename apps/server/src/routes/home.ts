import type { FastifyInstance } from 'fastify';
import { query } from '../db.ts';
import { requireUser } from '../auth.ts';

interface HomeBoardRow {
  id: string;
  name: string;
  repo_slug: string;
  dev_url: string | null;
  created_at: string;
  role: 'owner' | 'editor' | 'viewer';
  branch_count: string;
  frame_count: string;
  comment_count: string;
  last_activity: string | null;
  branch_colors: string[] | null;
}

export interface HomeBoardSummary {
  id: string;
  name: string;
  repoSlug: string;
  devUrl?: string;
  createdAt: string;
  role: 'owner' | 'editor' | 'viewer';
  branchCount: number;
  frameCount: number;
  commentCount: number;
  lastActivity: string | null;
  branchColors: string[];
}

export async function registerHomeRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/home', async (req, reply) => {
    const me = requireUser(req);
    // A+ W1 perf rewrite: the previous shape issued 5 correlated subqueries
    // per board row (branch count, frame count, comment count, max updated_at
    // across 3 tables, ARRAY_AGG of branch colors). On a board list of N this
    // was O(5N) random-IO heavy index scans. We now collect the per-board
    // aggregates from each child table in its own GROUP BY subquery and
    // LEFT JOIN them onto boards — one scan per child table, O(1) joins,
    // and the per-board branch counts / colors come out of the same
    // branches-aggregation pass. Response shape is byte-identical to the
    // previous version (verified field-by-field: id/name/repo_slug/dev_url/
    // created_at/role/branch_count/frame_count/comment_count/last_activity/
    // branch_colors).
    //
    // NB: COUNT(*) returns 0 (not NULL) for a missing LEFT JOIN row only when
    // applied to the joined-out subquery row — so we COALESCE explicitly to
    // preserve the "0 instead of null" client contract. branch_colors stays
    // null-able to match prior NULL-when-no-branches behaviour, which the
    // mapper coerces to []. last_activity is GREATEST of three timestamps;
    // GREATEST(NULL, NULL, NULL) = NULL which preserves the previous shape.
    const rows = await query<HomeBoardRow>(
      `SELECT
         b.id,
         b.name,
         b.repo_slug,
         b.dev_url,
         b.created_at,
         m.role,
         COALESCE(bra.branch_count, 0)  AS branch_count,
         COALESCE(fr.frame_count, 0)    AS frame_count,
         COALESCE(cm.comment_count, 0)  AS comment_count,
         GREATEST(fr.last_frame_updated, cm.last_comment_updated, bra.last_branch_updated)
           AS last_activity,
         bra.branch_colors
       FROM boards b
       JOIN board_members m ON m.board_id = b.id AND m.user_id = $1
       LEFT JOIN (
         SELECT board_id,
                COUNT(*) AS branch_count,
                MAX(updated_at) AS last_branch_updated,
                ARRAY_AGG(color ORDER BY created_at) AS branch_colors
           FROM branches
          GROUP BY board_id
       ) bra ON bra.board_id = b.id
       LEFT JOIN (
         SELECT board_id,
                COUNT(*) AS frame_count,
                MAX(updated_at) AS last_frame_updated
           FROM frames
          GROUP BY board_id
       ) fr ON fr.board_id = b.id
       LEFT JOIN (
         SELECT board_id,
                COUNT(*) AS comment_count,
                MAX(updated_at) AS last_comment_updated
           FROM comments
          GROUP BY board_id
       ) cm ON cm.board_id = b.id
       ORDER BY b.created_at DESC`,
      [me.id],
    );

    const summaries: HomeBoardSummary[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      repoSlug: r.repo_slug,
      devUrl: r.dev_url ?? undefined,
      createdAt: r.created_at,
      role: r.role,
      branchCount: Number(r.branch_count),
      frameCount: Number(r.frame_count),
      commentCount: Number(r.comment_count),
      // pg returns TIMESTAMPTZ as an ISO string per our parser override
      // (db.ts setTypeParser). NULL when the board has zero frames /
      // comments / branches activity yet.
      lastActivity: r.last_activity ?? null,
      branchColors: r.branch_colors ?? [],
    }));
    return reply.send({ boards: summaries });
  });
}
