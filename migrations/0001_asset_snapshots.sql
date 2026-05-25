-- Migration 0001 — add asset_snapshots table for periodic asset totals.
-- Apply to remote: wrangler d1 execute finance-db --remote --file=migrations/0001_asset_snapshots.sql

CREATE TABLE IF NOT EXISTS asset_snapshots (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  recorded_at   TEXT    NOT NULL,
  snapshot_date TEXT    NOT NULL,
  group_id      TEXT    NOT NULL,
  subtype       TEXT,
  value         REAL    NOT NULL,
  cost          REAL    NOT NULL,
  asset_count   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_snapshots_date ON asset_snapshots(snapshot_date);
CREATE UNIQUE INDEX IF NOT EXISTS uq_snapshots_bucket
  ON asset_snapshots(snapshot_date, group_id, COALESCE(subtype, ''));
