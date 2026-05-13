# Finance Manager

Vietnamese personal finance tracker on Cloudflare Pages + D1.

## Quick start

```bash
npm install

# 1. Create the D1 database
npx wrangler d1 create finance-db
# Copy the printed `database_id` into wrangler.toml

# 2. Apply schema (remote)
npm run db:migrate

# 3. (Optional) seed sample data
npm run db:seed

# 4. Run locally
# Terminal A: build the frontend so wrangler can serve it
npm run build
# Terminal B: start Pages dev server (functions + static)
npx wrangler pages dev dist --d1=DB=finance-db

# Or, for fast frontend HMR:
npm run dev                  # vite on :5173, proxies /api to :8788
npm run dev:functions        # wrangler on :8788
```

## Deploy

```bash
npm run deploy
```

## Layout

- `src/` — vanilla JS frontend (Vite)
- `functions/api/` — Cloudflare Pages Functions (API)
- `schema.sql` / `seed.sql` — D1 setup
- `wrangler.toml` — Cloudflare config
