-- Finance Manager — D1 Schema (Vietnamese finance tracking, multi-user)

PRAGMA foreign_keys = ON;

DROP TABLE IF EXISTS asset_snapshots;
DROP TABLE IF EXISTS price_history;
DROP TABLE IF EXISTS assets;
DROP TABLE IF EXISTS platforms;
DROP TABLE IF EXISTS members;
DROP TABLE IF EXISTS user_settings;
DROP TABLE IF EXISTS settings;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS users;

CREATE TABLE users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  name          TEXT    NOT NULL,
  password_hash TEXT    NOT NULL,                       -- "v1:<iter>:<saltB64u>:<hashB64u>"
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE sessions (
  id          TEXT    PRIMARY KEY,                      -- 32-byte random, base64url
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  expires_at  TEXT    NOT NULL,
  user_agent  TEXT,
  ip          TEXT
);
CREATE INDEX idx_sessions_user    ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

CREATE TABLE user_settings (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key     TEXT    NOT NULL,
  value   TEXT    NOT NULL,
  PRIMARY KEY (user_id, key)
);

CREATE TABLE members (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT    NOT NULL,
  color      TEXT    NOT NULL DEFAULT '#3b82f6',
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_members_user ON members(user_id);

CREATE TABLE platforms (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT    NOT NULL UNIQUE
);

-- Asset groups + subtypes are hard-coded in src/data/groups.js.
-- Stored values here are slug IDs (e.g. group_id='dau-tu', subtype='co-phieu').
CREATE TABLE assets (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name           TEXT    NOT NULL,
  group_id       TEXT    NOT NULL,
  subtype        TEXT,
  member_id      INTEGER REFERENCES members(id),
  qty            REAL    NOT NULL DEFAULT 0,
  unit           TEXT,
  cost_price     REAL    NOT NULL DEFAULT 0,
  current_price  REAL    NOT NULL DEFAULT 0,
  -- Tiền gửi (savings deposit) fields
  platform       TEXT,
  term           TEXT,
  maturity_date  TEXT,
  -- Bank-group field (stored as abbreviation, e.g. 'TCB')
  bank           TEXT,
  -- Common
  interest_rate     REAL,
  interest_tax_rate REAL,            -- % tax withheld on interest (Tiền gửi: usually 5)
  -- Cho vay / đi vay / tiền gửi: chu kỳ trả lãi (NULL ≡ end_of_term)
  interest_payment_day   INTEGER,    -- 1..31
  interest_payment_cycle TEXT
                         CHECK (interest_payment_cycle IS NULL
                                OR interest_payment_cycle IN ('end_of_term', 'monthly', 'quarterly')),
  start_date     TEXT,
  notes          TEXT,
  ticker         TEXT,
  status         TEXT    NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed', 'deleted')),
  created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_assets_user    ON assets(user_id);
CREATE INDEX idx_assets_group   ON assets(group_id);
CREATE INDEX idx_assets_member  ON assets(member_id);
CREATE INDEX idx_assets_status  ON assets(status);

CREATE TABLE price_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id    INTEGER NOT NULL REFERENCES assets(id),
  price       REAL    NOT NULL,
  old_price   REAL,
  recorded_at TEXT    NOT NULL DEFAULT (datetime('now')),
  source      TEXT    NOT NULL DEFAULT 'manual',
  type        TEXT    NOT NULL DEFAULT 'edit',
  note        TEXT
);

CREATE INDEX idx_price_asset ON price_history(asset_id, recorded_at);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Weekly snapshots of aggregated asset value by (user_id, group_id, subtype).
-- Populated by the cron worker (worker/index.js) and manual triggers
-- (POST /api/snapshots/run). One row per (user_id, snapshot_date, group_id, subtype).
CREATE TABLE asset_snapshots (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recorded_at   TEXT    NOT NULL,
  snapshot_date TEXT    NOT NULL,
  group_id      TEXT    NOT NULL,
  subtype       TEXT,
  value         REAL    NOT NULL,
  cost          REAL    NOT NULL,
  asset_count   INTEGER NOT NULL
);

CREATE INDEX idx_snapshots_user ON asset_snapshots(user_id);
CREATE INDEX idx_snapshots_date ON asset_snapshots(snapshot_date);
CREATE UNIQUE INDEX uq_snapshots_bucket
  ON asset_snapshots(user_id, snapshot_date, group_id, COALESCE(subtype, ''));
