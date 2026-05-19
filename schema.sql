-- Finance Manager — D1 Schema (Vietnamese finance tracking)

PRAGMA foreign_keys = ON;

DROP TABLE IF EXISTS price_history;
DROP TABLE IF EXISTS assets;
DROP TABLE IF EXISTS platforms;
DROP TABLE IF EXISTS members;
DROP TABLE IF EXISTS settings;

CREATE TABLE members (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  color      TEXT    NOT NULL DEFAULT '#3b82f6',
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE platforms (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT    NOT NULL UNIQUE
);

-- Asset groups + subtypes are hard-coded in src/data/groups.js.
-- Stored values here are slug IDs (e.g. group_id='dau-tu', subtype='co-phieu').
CREATE TABLE assets (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
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
  start_date     TEXT,
  notes          TEXT,
  ticker         TEXT,
  status         TEXT    NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed', 'deleted')),
  created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);

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
