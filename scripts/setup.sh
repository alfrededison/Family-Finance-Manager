#!/usr/bin/env bash
set -e

# Check wrangler is available
if ! command -v wrangler &> /dev/null; then
  echo "Error: wrangler not found. Run 'npm install' first."
  exit 1
fi

if [ -f wrangler.toml ] || [ -f worker/wrangler.toml ]; then
  read -r -p "wrangler.toml (root and/or worker/) already exists. Overwrite? [y/N] " confirm
  [[ "$confirm" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 0; }
fi

# Prompt for names
read -r -p "Project name (Cloudflare Pages project) [finance-manager]: " PROJECT_NAME
PROJECT_NAME="${PROJECT_NAME:-finance-manager}"

read -r -p "D1 database name [finance-db]: " DB_NAME
DB_NAME="${DB_NAME:-finance-db}"

echo ""
echo "Creating D1 database '$DB_NAME'..."
CREATE_OUTPUT=$(wrangler d1 create "$DB_NAME" 2>&1) || {
  # If DB already exists, try to fetch its ID instead
  if echo "$CREATE_OUTPUT" | grep -q "already exists"; then
    echo "Database '$DB_NAME' already exists, fetching ID..."
    CREATE_OUTPUT=$(wrangler d1 list 2>&1)
    DB_ID=$(echo "$CREATE_OUTPUT" | grep "$DB_NAME" | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1)
  else
    echo "Error creating database:"
    echo "$CREATE_OUTPUT"
    exit 1
  fi
}

# Extract database_id from create output if not already set
if [ -z "$DB_ID" ]; then
  DB_ID=$(echo "$CREATE_OUTPUT" | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1)
fi

if [ -z "$DB_ID" ]; then
  echo "Error: Could not parse database ID from wrangler output."
  echo "Please create the database manually and add the ID to wrangler.toml."
  exit 1
fi

echo "Database ID: $DB_ID"

# Generate wrangler.toml
cat > wrangler.toml <<EOF
name = "$PROJECT_NAME"
compatibility_date = "2024-01-01"
pages_build_output_dir = "dist"

[[d1_databases]]
binding = "DB"
database_name = "$DB_NAME"
database_id = "$DB_ID"
EOF

echo ""
echo "Created wrangler.toml"

# Generate worker/wrangler.toml (cron worker — weekly asset snapshot).
mkdir -p worker
cat > worker/wrangler.toml <<EOF
name = "${PROJECT_NAME}-cron"
main = "index.js"
compatibility_date = "2024-01-01"

[[d1_databases]]
binding = "DB"
database_name = "$DB_NAME"
database_id = "$DB_ID"

[triggers]
crons = ["0 17 * * 0"]
EOF

echo "Created worker/wrangler.toml"
echo ""
echo "Next steps:"
echo "  npm run db:migrate       # Apply schema to remote DB"
echo "  npm run db:migrate:local # Apply schema to local DB"
echo "  npm run deploy           # Build and deploy to Cloudflare Pages"
echo "  npm run worker:deploy    # Deploy the snapshot cron worker"
