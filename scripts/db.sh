#!/usr/bin/env bash
set -e

if [ ! -f wrangler.toml ]; then
  echo "Error: wrangler.toml not found. Run 'npm run setup' first."
  exit 1
fi

DB_NAME=$(grep 'database_name' wrangler.toml | sed 's/.*= *"\(.*\)"/\1/')

if [ -z "$DB_NAME" ]; then
  echo "Error: Could not read database_name from wrangler.toml."
  exit 1
fi

case "$1" in
  migrate)       wrangler d1 execute "$DB_NAME" --remote --file=schema.sql ;;
  migrate:local) wrangler d1 execute "$DB_NAME" --file=schema.sql ;;
  seed)          wrangler d1 execute "$DB_NAME" --remote --file=seed.sql ;;
  seed:local)    wrangler d1 execute "$DB_NAME" --file=seed.sql ;;
  *)
    echo "Usage: $0 {migrate|migrate:local|seed|seed:local}"
    exit 1
    ;;
esac
