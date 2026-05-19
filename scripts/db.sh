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
  migrate)        wrangler d1 execute "$DB_NAME" --file=schema.sql ;;
  migrate:remote) wrangler d1 execute "$DB_NAME" --remote --file=schema.sql ;;
  seed)           wrangler d1 execute "$DB_NAME" --file=demo.sql ;;
  seed:remote)    wrangler d1 execute "$DB_NAME" --remote --file=init.sql ;;
  *)
    echo "Usage: $0 {migrate|migrate:remote|seed|seed:remote}"
    exit 1
    ;;
esac
