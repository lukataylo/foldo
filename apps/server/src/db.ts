import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Place the DB at apps/server/data/foldo.db
const dataDir = resolve(__dirname, '..', 'data');
mkdirSync(dataDir, { recursive: true });

const dbPath = resolve(dataDir, 'foldo.db');

export const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  initial TEXT NOT NULL,
  color TEXT NOT NULL,
  email TEXT,
  kind TEXT NOT NULL,
  created_at TEXT NOT NULL
);

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
  position_x REAL NOT NULL,
  position_y REAL NOT NULL,
  width REAL NOT NULL,
  height REAL NOT NULL,
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
  resolved INTEGER NOT NULL DEFAULT 0,
  resolved_by_user_id TEXT,
  resolved_at TEXT,
  pin_x REAL,
  pin_y REAL,
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

CREATE INDEX IF NOT EXISTS idx_frames_board ON frames(board_id);
CREATE INDEX IF NOT EXISTS idx_comments_frame ON comments(frame_id);
CREATE INDEX IF NOT EXISTS idx_dispatches_board ON dispatches(board_id);
`);
