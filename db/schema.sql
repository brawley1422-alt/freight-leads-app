-- Resolve Lead Factory — SQLite schema
-- Migrations are applied in order by db/client.ts

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS agents (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  slug           TEXT NOT NULL UNIQUE,
  name           TEXT NOT NULL,
  email          TEXT NOT NULL UNIQUE,
  icp_text       TEXT NOT NULL,
  verticals_json TEXT NOT NULL,      -- JSON array of strings
  delivery_hour  INTEGER NOT NULL DEFAULT 7,
  active         INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS runs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id    INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  date        TEXT NOT NULL,         -- YYYY-MM-DD
  vertical    TEXT NOT NULL,
  report_md   TEXT,
  pdf_path    TEXT,
  status      TEXT NOT NULL DEFAULT 'pending',  -- pending|running|ok|error
  error       TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(agent_id, date)
);

CREATE TABLE IF NOT EXISTS leads (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id         INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  rank           INTEGER NOT NULL,
  company        TEXT NOT NULL,
  company_lower  TEXT NOT NULL,
  website        TEXT,
  hq             TEXT,
  est_revenue    TEXT,
  in_band        TEXT,
  details_md     TEXT,
  dm1_name       TEXT,
  dm1_linkedin   TEXT,
  status         TEXT NOT NULL DEFAULT 'pending',  -- pending|contacted|bad_fit|won
  notes          TEXT,
  qual_score     INTEGER,                          -- 0-100 from Ollama qualify pass; NULL if skipped
  qual_flag      TEXT,                             -- short phrase from Ollama
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS leads_run_idx ON leads(run_id);
CREATE INDEX IF NOT EXISTS leads_status_idx ON leads(status);

-- Per-agent dedup: never recommend the same company to the same agent twice
CREATE TABLE IF NOT EXISTS seen (
  agent_id         INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  company_lower    TEXT NOT NULL,
  first_seen_date  TEXT NOT NULL,
  PRIMARY KEY (agent_id, company_lower)
);

-- Shared claim list: first agent to receive a company owns it for a soft window
CREATE TABLE IF NOT EXISTS claims (
  company_lower  TEXT PRIMARY KEY,
  agent_id       INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  claimed_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS magic_tokens (
  token       TEXT PRIMARY KEY,
  email       TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  used        INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token       TEXT PRIMARY KEY,
  email       TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
