import "server-only";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), ".data");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  mode TEXT NOT NULL,
  display_name TEXT NOT NULL,
  handle TEXT,
  avatar_url TEXT,
  credentials_enc TEXT,
  status TEXT NOT NULL DEFAULT 'ok',
  error TEXT,
  last_synced_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS accounts_user ON accounts(user_id);

CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  external_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  author_handle TEXT,
  author_avatar TEXT,
  title TEXT,
  text TEXT NOT NULL,
  url TEXT,
  media_json TEXT NOT NULL,
  category_hint TEXT,
  created_at TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  seq INTEGER NOT NULL,
  topic TEXT,
  category TEXT,
  alignment REAL,
  scored_for TEXT
);
CREATE INDEX IF NOT EXISTS items_account_seq ON items(account_id, seq);

CREATE TABLE IF NOT EXISTS feed_cursors (
  account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  next_cursor TEXT,
  exhausted INTEGER NOT NULL DEFAULT 0,
  batch_base INTEGER NOT NULL,
  next_idx INTEGER NOT NULL DEFAULT 0,
  refreshed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  goal_text TEXT NOT NULL,
  goal_profile TEXT NOT NULL,
  reduce_habits TEXT NOT NULL,
  build_habits TEXT NOT NULL,
  from_accounts TEXT NOT NULL,
  to_accounts TEXT NOT NULL,
  start_ratio REAL NOT NULL,
  end_ratio REAL NOT NULL,
  duration_days INTEGER NOT NULL,
  daily_budget INTEGER NOT NULL,
  adaptive INTEGER NOT NULL,
  page_size INTEGER NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS plans_user ON plans(user_id, status);

CREATE TABLE IF NOT EXISTS plan_days (
  plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  level INTEGER NOT NULL,
  ratio REAL NOT NULL,
  held INTEGER NOT NULL DEFAULT 0,
  shown_from INTEGER NOT NULL DEFAULT 0,
  shown_to INTEGER NOT NULL DEFAULT 0,
  engaged_from INTEGER NOT NULL DEFAULT 0,
  engaged_to INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (plan_id, day)
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  plan_id TEXT,
  bucket TEXT NOT NULL,
  type TEXT NOT NULL,
  dwell_ms INTEGER NOT NULL DEFAULT 0,
  day TEXT NOT NULL,
  ts TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS events_user_day ON events(user_id, day);
CREATE UNIQUE INDEX IF NOT EXISTS events_view_once ON events(user_id, item_id, type) WHERE type IN ('view', 'engage', 'skip');

CREATE TABLE IF NOT EXISTS saved_items (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  saved_at TEXT NOT NULL,
  PRIMARY KEY (user_id, item_id)
);

CREATE TABLE IF NOT EXISTS mix_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id TEXT,
  snapshot TEXT NOT NULL,
  page INTEGER NOT NULL DEFAULT 0,
  served TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);

-- Sign in with ChatGPT. One row per Mindclean user. The issued client_id (the
-- user's registration) is kept after sign-out so later sign-ins reuse it.
CREATE TABLE IF NOT EXISTS chatgpt_connections (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL,
  subject TEXT NOT NULL,
  email TEXT,
  name TEXT,
  picture TEXT,
  scopes TEXT NOT NULL DEFAULT '',
  model TEXT,
  credentials_enc TEXT,
  status TEXT NOT NULL DEFAULT 'ok',
  error TEXT,
  limited_until TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS chatgpt_subject ON chatgpt_connections(subject);

CREATE TABLE IF NOT EXISTS chatgpt_auth_states (
  state TEXT PRIMARY KEY,
  user_id TEXT,
  mode TEXT NOT NULL,
  client_id TEXT NOT NULL,
  verifier TEXT NOT NULL,
  nonce TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  return_origin TEXT NOT NULL,
  next TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- One-time hand-off from the 127.0.0.1 OAuth callback back to the app's own origin.
CREATE TABLE IF NOT EXISTS login_tickets (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  next TEXT NOT NULL,
  client_id TEXT,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS oauth_states (
  state TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  next TEXT NOT NULL DEFAULT '/app/sources',
  created_at TEXT NOT NULL
);
`;

/** v1 plans used a fixed daily step; keep them for reference and start fresh plans. */
function migrate(db: DatabaseSync) {
  const columns = db.prepare("PRAGMA table_info(plans)").all() as { name: string }[];
  if (columns.some((c) => c.name === "pace")) {
    db.exec("ALTER TABLE plans RENAME TO plans_v1; DROP TABLE IF EXISTS plan_days; DELETE FROM mix_sessions;");
  }
  // The browser extension was replaced by the mobile app.
  db.exec("DROP TABLE IF EXISTS extension_tokens");
  const accountCols = db.prepare("PRAGMA table_info(accounts)").all() as { name: string }[];
  if (accountCols.length > 0) db.exec("UPDATE accounts SET mode = 'device' WHERE mode = 'extension'");
  const oauthCols = db.prepare("PRAGMA table_info(oauth_states)").all() as { name: string }[];
  if (oauthCols.length > 0 && !oauthCols.some((c) => c.name === "next")) {
    db.exec("ALTER TABLE oauth_states ADD COLUMN next TEXT NOT NULL DEFAULT '/app/sources'");
  }
}

const globalForDb = globalThis as unknown as { __mindcleanDb?: DatabaseSync };

function open(): DatabaseSync {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new DatabaseSync(process.env.DATABASE_PATH ?? path.join(DATA_DIR, "mindclean.db"));
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  migrate(db);
  db.exec(SCHEMA);
  return db;
}

export function db(): DatabaseSync {
  globalForDb.__mindcleanDb ??= open();
  return globalForDb.__mindcleanDb;
}

type Row = Record<string, SQLInputValue>;

export function get<T = Row>(sql: string, ...params: SQLInputValue[]): T | undefined {
  return db().prepare(sql).get(...params) as T | undefined;
}

export function all<T = Row>(sql: string, ...params: SQLInputValue[]): T[] {
  return db().prepare(sql).all(...params) as T[];
}

export function run(sql: string, ...params: SQLInputValue[]) {
  return db().prepare(sql).run(...params);
}

export function transaction<T>(fn: () => T): T {
  const conn = db();
  conn.exec("BEGIN");
  try {
    const result = fn();
    conn.exec("COMMIT");
    return result;
  } catch (err) {
    conn.exec("ROLLBACK");
    throw err;
  }
}

export function dataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  return DATA_DIR;
}
