import pg from 'pg';

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required (e.g. postgres://user:pass@host:5432/foldo)');
}

const needsSsl = /sslmode=require|render\.com|railway\.app|neon\.tech|supabase\.co/.test(connectionString);

export const pool = new Pool({
  connectionString,
  ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
  max: Number(process.env.DATABASE_POOL_MAX ?? 10),
});

pool.on('error', (err) => {
  // eslint-disable-next-line no-console
  console.error('pg pool error:', err);
});

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  sql: string,
  params?: unknown[],
): Promise<T[]> {
  const res = await pool.query<T>(sql, params as never);
  return res.rows;
}

export async function queryOne<T extends pg.QueryResultRow = pg.QueryResultRow>(
  sql: string,
  params?: unknown[],
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

export async function exec(sql: string, params?: unknown[]): Promise<number> {
  const res = await pool.query(sql, params as never);
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
  user_agent TEXT,
  kind TEXT NOT NULL DEFAULT 'browser' CHECK (kind IN ('browser','api')),
  label TEXT
);
-- Additive migration for pre-existing dev databases.
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
END $$;
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

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
`;

export async function initSchema(): Promise<void> {
  await pool.query(SCHEMA);
}

export async function closePool(): Promise<void> {
  await pool.end();
}
