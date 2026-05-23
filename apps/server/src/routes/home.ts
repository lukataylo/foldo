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
    const rows = await query<HomeBoardRow>(
      `SELECT
         b.id,
         b.name,
         b.repo_slug,
         b.dev_url,
         b.created_at,
         m.role,
         (SELECT COUNT(*) FROM branches WHERE board_id = b.id) AS branch_count,
         (SELECT COUNT(*) FROM frames   WHERE board_id = b.id) AS frame_count,
         (SELECT COUNT(*) FROM comments WHERE board_id = b.id) AS comment_count,
         -- updated_at columns are now TIMESTAMPTZ (Phase 2); we can't
         -- COALESCE with '' anymore (TIMESTAMPTZ rejects empty strings).
         -- GREATEST ignores NULL inputs in Postgres 14+, so leaving them
         -- as NULL is correct: an empty board yields NULL last_activity.
         GREATEST(
           (SELECT MAX(updated_at) FROM frames   WHERE board_id = b.id),
           (SELECT MAX(updated_at) FROM comments WHERE board_id = b.id),
           (SELECT MAX(updated_at) FROM branches WHERE board_id = b.id)
         ) AS last_activity,
         (
           SELECT ARRAY_AGG(color ORDER BY created_at)
           FROM branches WHERE board_id = b.id
         ) AS branch_colors
       FROM boards b
       JOIN board_members m ON m.board_id = b.id AND m.user_id = $1
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
