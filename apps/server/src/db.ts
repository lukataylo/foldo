import pg from 'pg';

const { Pool } = pg;

// pg returns TIMESTAMPTZ as a JS Date by default, which would force every
// rowTo*() in the repo layer to do `r.created_at.toISOString()` after we
// migrate TEXT timestamps to TIMESTAMPTZ. Override the parser to leave it
// as the raw ISO-ish string Postgres already produces (`2026-05-23 16:42:11.012+00`)
// and normalise that to a real ISO 8601 string. Net effect: repo code stays
// untouched, wire format stays identical, callers can still pass either a
// Date or a string back in (pg coerces both for TIMESTAMPTZ params).
pg.types.setTypeParser(1184, (raw: string) => {
  // 1184 = TIMESTAMPTZ. Convert Postgres' "2026-05-23 16:42:11.012+00" to
  // canonical "2026-05-23T16:42:11.012Z" so JS Date parsing is unambiguous
  // and the wire shape matches the existing TEXT-stored values.
  return new Date(raw).toISOString();
});

// Lazy pool. Initialised on first use rather than at module load so importing
// db.ts (or any repo file) in a unit-test context doesn't require a live
// DATABASE_URL — only code paths that actually issue SQL do. The proxy
// preserves the `pool.query(...)` / `pool.connect()` call sites everywhere.
function buildPool(): pg.Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is required (e.g. postgres://user:pass@host:5432/foldo)',
    );
  }
  const needsSsl = /sslmode=require|render\.com|railway\.app|neon\.tech|supabase\.co/.test(
    connectionString,
  );
  const p = new Pool({
    connectionString,
    ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
  });
  p.on('error', (err) => {
    // eslint-disable-next-line no-console
    console.error('pg pool error:', err);
  });
  return p;
}

let _pool: pg.Pool | null = null;
function getPool(): pg.Pool {
  if (!_pool) _pool = buildPool();
  return _pool;
}

/**
 * Public pool handle. Wrapped in a Proxy so accessing `.query` / `.connect` /
 * `.idleCount` etc. triggers lazy initialisation; existing call-sites that
 * just do `pool.query(sql, params)` are unchanged.
 */
export const pool = new Proxy({} as pg.Pool, {
  get(_t, prop) {
    const real = getPool() as unknown as Record<string | symbol, unknown>;
    const value = real[prop];
    return typeof value === 'function' ? (value as Function).bind(real) : value;
  },
});

/**
 * Either the shared pool or a transactional client. Repo functions accept this
 * as an optional argument so a route handler can do several writes inside a
 * single `withTransaction(...)` block — pass the client through and they all
 * run on the same connection.
 */
export type SqlRunner = pg.Pool | pg.PoolClient;

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  sql: string,
  params?: unknown[],
  runner: SqlRunner = pool,
): Promise<T[]> {
  const res = await runner.query<T>(sql, params as never);
  return res.rows;
}

export async function queryOne<T extends pg.QueryResultRow = pg.QueryResultRow>(
  sql: string,
  params?: unknown[],
  runner: SqlRunner = pool,
): Promise<T | null> {
  const rows = await query<T>(sql, params, runner);
  return rows[0] ?? null;
}

export async function exec(
  sql: string,
  params?: unknown[],
  runner: SqlRunner = pool,
): Promise<number> {
  const res = await runner.query(sql, params as never);
  return res.rowCount ?? 0;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  initial TEXT NOT NULL,
  color TEXT NOT NULL,
  email TEXT,
  password_hash TEXT,
  email_verified_at TIMESTAMPTZ,
  kind TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_users_email_lower
  ON users (lower(email)) WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days'),
  user_agent TEXT,
  kind TEXT NOT NULL DEFAULT 'browser' CHECK (kind IN ('browser','api')),
  label TEXT
);
-- Additive migrations for pre-existing dev databases. Each block is idempotent.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sessions' AND column_name = 'kind'
  ) THEN
    ALTER TABLE sessions ADD COLUMN kind TEXT NOT NULL DEFAULT 'browser';
    ALTER TABLE sessions ADD CONSTRAINT sessions_kind_check CHECK (kind IN ('browser','api'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sessions' AND column_name = 'label'
  ) THEN
    ALTER TABLE sessions ADD COLUMN label TEXT;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sessions' AND column_name = 'expires_at'
  ) THEN
    -- 30-day sliding-window expiry. Backfill existing rows to last_seen + 30d
    -- so already-active sessions get a sensible expiry rather than immediately
    -- becoming invalid.
    ALTER TABLE sessions ADD COLUMN expires_at TIMESTAMPTZ;
    UPDATE sessions SET expires_at = last_seen_at + interval '30 days' WHERE expires_at IS NULL;
    ALTER TABLE sessions ALTER COLUMN expires_at SET NOT NULL;
    ALTER TABLE sessions ALTER COLUMN expires_at SET DEFAULT (now() + interval '30 days');
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
-- Lets the GC sweep find expired sessions cheaply.
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS boards (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  repo_slug TEXT NOT NULL,
  dev_url TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS branches (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL,
  name TEXT NOT NULL,
  authored_by TEXT NOT NULL,
  author_user_id TEXT NOT NULL,
  agent_name TEXT,
  color TEXT NOT NULL,
  head_sha TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS commits (
  sha TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL,
  message TEXT NOT NULL,
  author_user_id TEXT NOT NULL,
  parent_sha TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS frames (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  commit_sha TEXT NOT NULL,
  commit_message TEXT NOT NULL,
  age TEXT NOT NULL,
  position_x DOUBLE PRECISION NOT NULL,
  position_y DOUBLE PRECISION NOT NULL,
  width DOUBLE PRECISION NOT NULL,
  height DOUBLE PRECISION NOT NULL,
  content_json TEXT NOT NULL,
  parent_frame_id TEXT,
  generated_by_dispatch_id TEXT,
  captured_from_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL,
  frame_id TEXT NOT NULL,
  author_user_id TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_by_user_id TEXT,
  resolved_at TEXT,
  pin_x DOUBLE PRECISION,
  pin_y DOUBLE PRECISION,
  anchor_section TEXT,
  anchor_line_start INTEGER,
  anchor_line_end INTEGER,
  target_json TEXT,
  replies_json TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS dispatches (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL,
  frame_id TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  initiator_user_id TEXT NOT NULL,
  target_json TEXT NOT NULL,
  base_commit_sha TEXT NOT NULL,
  intent TEXT NOT NULL,
  status TEXT NOT NULL,
  events_json TEXT NOT NULL DEFAULT '[]',
  result_frame_id TEXT,
  result_commit_sha TEXT,
  created_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  error_message TEXT
);

CREATE TABLE IF NOT EXISTS sources (
  repo_slug TEXT NOT NULL,
  commit_sha TEXT NOT NULL,
  path TEXT NOT NULL,
  body TEXT NOT NULL,
  content_type TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (repo_slug, commit_sha, path)
);

CREATE TABLE IF NOT EXISTS board_shares (
  token TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  created_by_user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_board_shares_board ON board_shares(board_id);

CREATE TABLE IF NOT EXISTS board_members (
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  user_id  TEXT NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  role     TEXT NOT NULL CHECK (role IN ('owner','editor','viewer')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (board_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_board_members_user ON board_members(user_id);

CREATE TABLE IF NOT EXISTS demo_requests (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  company TEXT,
  team_size TEXT,
  agents TEXT,
  message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unmoderated UX tests. A test publishes a short foldo.dev/t/:token link;
-- testers run it, recordings + answers land back on the board as frames.
CREATE TABLE IF NOT EXISTS tests (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  target_url TEXT,
  target_mode TEXT NOT NULL DEFAULT 'auto',
  frameable BOOLEAN,
  dom_snapshot_key TEXT,
  intro TEXT NOT NULL DEFAULT '',
  recording_modes_json TEXT NOT NULL DEFAULT '["screen_voice","voice_only"]',
  questionnaire_json TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','live','closed')),
  share_token TEXT NOT NULL UNIQUE,
  response_limit INTEGER,
  summary_frame_id TEXT,
  created_by_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tests_board ON tests(board_id);

CREATE TABLE IF NOT EXISTS test_tasks (
  id TEXT PRIMARY KEY,
  test_id TEXT NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL,
  title TEXT NOT NULL,
  instruction TEXT NOT NULL,
  success_hint TEXT,
  start_url TEXT,
  start_recipe_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_test_tasks_test ON test_tasks(test_id);

CREATE TABLE IF NOT EXISTS test_sessions (
  id TEXT PRIMARY KEY,
  test_id TEXT NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  session_token TEXT,
  status TEXT NOT NULL DEFAULT 'started'
    CHECK (status IN ('started','recording','completed','abandoned')),
  recording_mode TEXT NOT NULL,
  tester_label TEXT NOT NULL,
  tester_meta_json TEXT,
  consent_at TEXT,
  recording_key TEXT,
  recording_duration_ms INTEGER,
  transcript_json TEXT,
  transcript_status TEXT NOT NULL DEFAULT 'pending',
  responses_json TEXT,
  synthesis_json TEXT,
  result_frame_id TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT
);
-- Additive migrations for dev databases created before these columns existed.
ALTER TABLE test_sessions ADD COLUMN IF NOT EXISTS session_token TEXT;
ALTER TABLE test_sessions ADD COLUMN IF NOT EXISTS synthesis_json TEXT;
CREATE INDEX IF NOT EXISTS idx_test_sessions_test ON test_sessions(test_id);

CREATE TABLE IF NOT EXISTS test_task_results (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES test_sessions(id) ON DELETE CASCADE,
  task_id TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('completed','skipped','gave_up')),
  duration_ms INTEGER NOT NULL DEFAULT 0,
  recording_offset_ms INTEGER NOT NULL DEFAULT 0,
  events_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_test_task_results_session ON test_task_results(session_id);

CREATE INDEX IF NOT EXISTS idx_frames_board ON frames(board_id);
CREATE INDEX IF NOT EXISTS idx_comments_frame ON comments(frame_id);
CREATE INDEX IF NOT EXISTS idx_dispatches_board ON dispatches(board_id);

-- ============================================================================
-- Indexes for queries that were running unindexed (Phase 0 audit findings).
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_branches_board ON branches(board_id);
CREATE INDEX IF NOT EXISTS idx_commits_branch ON commits(branch_id);
CREATE INDEX IF NOT EXISTS idx_frames_parent ON frames(parent_frame_id);
CREATE INDEX IF NOT EXISTS idx_frames_board_kind ON frames(board_id, kind);
CREATE INDEX IF NOT EXISTS idx_test_sessions_status ON test_sessions(status);

-- ============================================================================
-- Foreign-key constraints. Until now frames / comments / dispatches were
-- referenced by id without a constraint, so deleting a board / frame left
-- silent orphans the app code had to guard around. Each block cleans existing
-- orphans first (cheap on a healthy DB, defensive on a drifted one) then adds
-- the constraint. Guarded by pg_constraint lookups so it's idempotent across
-- restarts.
-- ============================================================================
DO $$ BEGIN
  -- branches.board_id → boards
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'branches_board_id_fkey') THEN
    DELETE FROM branches WHERE board_id NOT IN (SELECT id FROM boards);
    ALTER TABLE branches
      ADD CONSTRAINT branches_board_id_fkey
      FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE;
  END IF;

  -- commits.branch_id → branches
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'commits_branch_id_fkey') THEN
    DELETE FROM commits WHERE branch_id NOT IN (SELECT id FROM branches);
    ALTER TABLE commits
      ADD CONSTRAINT commits_branch_id_fkey
      FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE;
  END IF;

  -- frames.board_id → boards
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'frames_board_id_fkey') THEN
    DELETE FROM frames WHERE board_id NOT IN (SELECT id FROM boards);
    ALTER TABLE frames
      ADD CONSTRAINT frames_board_id_fkey
      FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE;
  END IF;

  -- frames.parent_frame_id → frames(id). SET NULL not CASCADE: deleting a
  -- parent shouldn't transitively delete children — the children just become
  -- root frames again.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'frames_parent_frame_id_fkey') THEN
    UPDATE frames SET parent_frame_id = NULL
      WHERE parent_frame_id IS NOT NULL
        AND parent_frame_id NOT IN (SELECT id FROM frames);
    ALTER TABLE frames
      ADD CONSTRAINT frames_parent_frame_id_fkey
      FOREIGN KEY (parent_frame_id) REFERENCES frames(id) ON DELETE SET NULL;
  END IF;

  -- comments.board_id → boards
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'comments_board_id_fkey') THEN
    DELETE FROM comments WHERE board_id NOT IN (SELECT id FROM boards);
    ALTER TABLE comments
      ADD CONSTRAINT comments_board_id_fkey
      FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE;
  END IF;

  -- comments.frame_id → frames
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'comments_frame_id_fkey') THEN
    DELETE FROM comments WHERE frame_id NOT IN (SELECT id FROM frames);
    ALTER TABLE comments
      ADD CONSTRAINT comments_frame_id_fkey
      FOREIGN KEY (frame_id) REFERENCES frames(id) ON DELETE CASCADE;
  END IF;

  -- dispatches.board_id → boards
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dispatches_board_id_fkey') THEN
    DELETE FROM dispatches WHERE board_id NOT IN (SELECT id FROM boards);
    ALTER TABLE dispatches
      ADD CONSTRAINT dispatches_board_id_fkey
      FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE;
  END IF;

  -- dispatches.frame_id → frames
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dispatches_frame_id_fkey') THEN
    DELETE FROM dispatches WHERE frame_id NOT IN (SELECT id FROM frames);
    ALTER TABLE dispatches
      ADD CONSTRAINT dispatches_frame_id_fkey
      FOREIGN KEY (frame_id) REFERENCES frames(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ============================================================================
-- Semantic CHECK constraints + composite uniques. Each block is idempotent so
-- replays at boot are safe. Each constraint is named so we can detect prior
-- application via pg_constraint and skip the ADD.
-- ============================================================================
DO $$ BEGIN
  -- A branch with an empty head_sha is meaningless; refuse it at the DB.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'branches_head_sha_not_empty') THEN
    UPDATE branches SET head_sha = 'unknown' WHERE head_sha = '';
    ALTER TABLE branches
      ADD CONSTRAINT branches_head_sha_not_empty CHECK (head_sha <> '');
  END IF;

  -- Comment pin coords are relative-to-frame fractions, so they must be in
  -- [0,1]. Catches misplaced absolute pixel values that would render off-frame.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'comments_pin_x_range') THEN
    UPDATE comments SET pin_x = LEAST(GREATEST(pin_x, 0), 1) WHERE pin_x IS NOT NULL;
    ALTER TABLE comments
      ADD CONSTRAINT comments_pin_x_range
      CHECK (pin_x IS NULL OR (pin_x >= 0 AND pin_x <= 1));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'comments_pin_y_range') THEN
    UPDATE comments SET pin_y = LEAST(GREATEST(pin_y, 0), 1) WHERE pin_y IS NOT NULL;
    ALTER TABLE comments
      ADD CONSTRAINT comments_pin_y_range
      CHECK (pin_y IS NULL OR (pin_y >= 0 AND pin_y <= 1));
  END IF;

  -- Recording durations are physical: a negative one is a bug.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'test_sessions_recording_duration_nonneg') THEN
    UPDATE test_sessions SET recording_duration_ms = 0
      WHERE recording_duration_ms IS NOT NULL AND recording_duration_ms < 0;
    ALTER TABLE test_sessions
      ADD CONSTRAINT test_sessions_recording_duration_nonneg
      CHECK (recording_duration_ms IS NULL OR recording_duration_ms >= 0);
  END IF;

  -- DOUBLE PRECISION can hold NaN, which breaks layout math and renders
  -- frames at unreachable positions. x = x is the canonical NaN check
  -- (NaN is the only value not equal to itself).
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'frames_position_finite') THEN
    UPDATE frames SET position_x = 0 WHERE NOT (position_x = position_x);
    UPDATE frames SET position_y = 0 WHERE NOT (position_y = position_y);
    ALTER TABLE frames
      ADD CONSTRAINT frames_position_finite
      CHECK (position_x = position_x AND position_y = position_y);
  END IF;

  -- Two branches called "main" on the same board would render as duplicate
  -- rows on the canvas and break the lookup-by-name code paths.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'branches_board_name_unique') THEN
    -- Clean up any pre-existing duplicate (board_id, name) pairs by suffixing
    -- the older rows with a short of their id, so the constraint can be added.
    UPDATE branches b SET name = name || '-' || substring(id from 1 for 6)
     WHERE EXISTS (
       SELECT 1 FROM branches b2
        WHERE b2.board_id = b.board_id AND b2.name = b.name AND b2.id <> b.id
     );
    ALTER TABLE branches
      ADD CONSTRAINT branches_board_name_unique UNIQUE (board_id, name);
  END IF;

  -- One task per (test, order_index) — the order is meant to be a sortable
  -- key for the tester UI, duplicates produce a non-deterministic order.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'test_tasks_test_order_unique') THEN
    -- Re-pack duplicates: any (test_id, order_index) collisions get their
    -- order_index bumped to the next free slot.
    WITH dups AS (
      SELECT id, test_id, order_index,
             ROW_NUMBER() OVER (PARTITION BY test_id, order_index ORDER BY id) AS rn
        FROM test_tasks
    )
    UPDATE test_tasks t
       SET order_index = t.order_index + d.rn - 1
      FROM dups d
     WHERE d.id = t.id AND d.rn > 1;
    ALTER TABLE test_tasks
      ADD CONSTRAINT test_tasks_test_order_unique UNIQUE (test_id, order_index);
  END IF;
END $$;

-- ============================================================================
-- Migrate the 13 TEXT-storing-JSON columns to JSONB. JSONB gives us native
-- containment / indexability, SQL-level validation (a malformed write fails
-- at the DB instead of being silently accepted), and removes the per-row
-- JSON.parse cost on read. The pg driver returns JSONB columns as parsed
-- objects, so repo readers drop their parseJson() shim — writers keep
-- JSON.stringify() (pg accepts a string for a JSONB param and parses
-- server-side).
--
-- Each ALTER is guarded by an information_schema check so reboots and CI are
-- safe. Uses USING (col::jsonb) so existing TEXT data is parsed in place;
-- if any row is invalid JSON, the migration fails loudly rather than
-- silently dropping data.
-- ============================================================================
-- ============================================================================
-- Standardize 19 TEXT-storing-ISO-timestamp columns to TIMESTAMPTZ. Without
-- this we mix two timestamp types across the same DB — SQL date math fails,
-- timezone bugs are latent, and indexes on (date, ...) sort lexicographically
-- not chronologically. The pg driver's TIMESTAMPTZ parser is overridden at
-- the top of this module to return an ISO string, so repo readers don't
-- have to change.
--
-- Idempotent: only ALTER columns currently typed text (information_schema
-- check). Existing TEXT values are cast with USING (col::timestamptz) which
-- accepts the ISO strings the app has been writing.
-- ============================================================================
DO $$
DECLARE
  cols TEXT[][] := ARRAY[
    ARRAY['users',         'created_at'],
    ARRAY['boards',        'created_at'],
    ARRAY['branches',      'created_at'],
    ARRAY['branches',      'updated_at'],
    ARRAY['commits',       'created_at'],
    ARRAY['frames',        'created_at'],
    ARRAY['frames',        'updated_at'],
    ARRAY['comments',      'created_at'],
    ARRAY['comments',      'updated_at'],
    ARRAY['comments',      'resolved_at'],
    ARRAY['dispatches',    'created_at'],
    ARRAY['dispatches',    'started_at'],
    ARRAY['dispatches',    'finished_at'],
    ARRAY['sources',       'updated_at'],
    ARRAY['tests',         'created_at'],
    ARRAY['tests',         'updated_at'],
    ARRAY['test_sessions', 'started_at'],
    ARRAY['test_sessions', 'completed_at'],
    ARRAY['test_sessions', 'consent_at']
  ];
  tname TEXT;
  cname TEXT;
  i INT;
BEGIN
  FOR i IN 1..array_upper(cols, 1) LOOP
    tname := cols[i][1];
    cname := cols[i][2];
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_name = tname AND column_name = cname AND data_type = 'text'
    ) THEN
      EXECUTE format('UPDATE %I SET %I = NULL WHERE %I = ''''', tname, cname, cname);
      EXECUTE format(
        'ALTER TABLE %I ALTER COLUMN %I TYPE TIMESTAMPTZ USING %I::timestamptz',
        tname, cname, cname
      );
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE
  -- (table, column, default-when-jsonb-or-NULL).
  cols TEXT[][] := ARRAY[
    ARRAY['frames',            'content_json',         NULL],
    ARRAY['comments',          'target_json',          NULL],
    ARRAY['comments',          'replies_json',         '[]'::text],
    ARRAY['dispatches',        'target_json',          NULL],
    ARRAY['dispatches',        'events_json',          '[]'::text],
    ARRAY['tests',             'recording_modes_json', '["screen_voice","voice_only"]'::text],
    ARRAY['tests',             'questionnaire_json',   NULL],
    ARRAY['test_tasks',        'start_recipe_json',    NULL],
    ARRAY['test_sessions',     'tester_meta_json',     NULL],
    ARRAY['test_sessions',     'transcript_json',      NULL],
    ARRAY['test_sessions',     'responses_json',       NULL],
    ARRAY['test_sessions',     'synthesis_json',       NULL],
    ARRAY['test_task_results', 'events_json',          NULL]
  ];
  tname TEXT;
  cname TEXT;
  dval  TEXT;
  i INT;
BEGIN
  FOR i IN 1..array_upper(cols, 1) LOOP
    tname := cols[i][1];
    cname := cols[i][2];
    dval  := cols[i][3];
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_name = tname AND column_name = cname AND data_type = 'text'
    ) THEN
      -- An empty string isn't valid JSON; normalise to NULL or the default
      -- before the cast.
      IF dval IS NULL THEN
        EXECUTE format('UPDATE %I SET %I = NULL WHERE %I = ''''', tname, cname, cname);
      ELSE
        EXECUTE format('UPDATE %I SET %I = $1 WHERE %I = '''' OR %I IS NULL', tname, cname, cname, cname) USING dval;
      END IF;
      -- Drop the TEXT default first — DROP/ADD is the canonical way to swap
      -- a default across an incompatible type. DEFAULT clauses need a SQL
      -- literal expression, not a parameter, so we use format()'s %L.
      EXECUTE format('ALTER TABLE %I ALTER COLUMN %I DROP DEFAULT', tname, cname);
      EXECUTE format(
        'ALTER TABLE %I ALTER COLUMN %I TYPE JSONB USING %I::jsonb',
        tname, cname, cname
      );
      IF dval IS NOT NULL THEN
        EXECUTE format(
          'ALTER TABLE %I ALTER COLUMN %I SET DEFAULT %L::jsonb',
          tname, cname, dval
        );
      END IF;
    END IF;
  END LOOP;
END $$;
`;

export async function initSchema(): Promise<void> {
  await pool.query(SCHEMA);
}

export async function closePool(): Promise<void> {
  await pool.end();
}

/**
 * Run `fn` inside a single SQL transaction. The connection is released back to
 * the pool either way. Use whenever a request handler does two or more writes
 * that should succeed-or-fail as a unit — historically `routes/frames.ts`
 * updated `frames` and `sources` in separate `exec()` calls, and a failure
 * between them left the two tables permanently out of sync.
 *
 * Inside `fn`, use `q.query(sql, params)` to run SQL on the transactional
 * connection. Calling the top-level `query/exec` would grab a *different*
 * connection from the pool and miss the BEGIN.
 */
export async function withTransaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // already-aborted etc.
    }
    throw err;
  } finally {
    client.release();
  }
}
