-- Finance Manager — D1 Schema
-- Vietnamese finance tracking app

PRAGMA foreign_keys = ON;

DROP TABLE IF EXISTS price_history;
DROP TABLE IF EXISTS transactions;
DROP TABLE IF EXISTS assets;
DROP TABLE IF EXISTS asset_groups;
DROP TABLE IF EXISTS members;

CREATE TABLE members (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  name      TEXT    NOT NULL,
  color     TEXT    NOT NULL DEFAULT '#3b82f6',
  created_at TEXT   NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE asset_groups (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  name   TEXT    NOT NULL,
  icon   TEXT    NOT NULL DEFAULT '📦',
  type   TEXT    NOT NULL CHECK (type IN ('Asset', 'Liability')),
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE assets (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT    NOT NULL,
  group_id       INTEGER NOT NULL REFERENCES asset_groups(id),
  subtype        TEXT,
  member_id      INTEGER REFERENCES members(id),
  qty            REAL    NOT NULL DEFAULT 0,
  unit           TEXT,
  cost_price     REAL    NOT NULL DEFAULT 0,
  current_price  REAL    NOT NULL DEFAULT 0,
  start_date     TEXT,
  end_date       TEXT,
  rate           REAL,
  notes          TEXT,
  status         TEXT    NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed', 'deleted')),
  created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_assets_group   ON assets(group_id);
CREATE INDEX idx_assets_member  ON assets(member_id);
CREATE INDEX idx_assets_status  ON assets(status);

CREATE TABLE transactions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  date       TEXT    NOT NULL,
  type       TEXT    NOT NULL CHECK (type IN ('buy', 'sell', 'dividend', 'adjust', 'transfer')),
  asset_id   INTEGER NOT NULL REFERENCES assets(id),
  member_id  INTEGER REFERENCES members(id),
  qty        REAL    NOT NULL DEFAULT 0,
  unit_price REAL    NOT NULL DEFAULT 0,
  total      REAL    NOT NULL DEFAULT 0,
  notes      TEXT,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_tx_asset  ON transactions(asset_id);
CREATE INDEX idx_tx_member ON transactions(member_id);
CREATE INDEX idx_tx_date   ON transactions(date);

CREATE TABLE price_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id    INTEGER NOT NULL REFERENCES assets(id),
  price       REAL    NOT NULL,
  recorded_at TEXT    NOT NULL DEFAULT (datetime('now')),
  source      TEXT    NOT NULL DEFAULT 'manual'
);

CREATE INDEX idx_price_asset ON price_history(asset_id, recorded_at);
