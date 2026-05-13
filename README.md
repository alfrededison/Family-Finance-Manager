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

# 4. Run locally (frontend HMR + backend live reload)
npm run dev                  # vite on :5173 (HMR) + wrangler on :8788 (functions)

# Or run them separately:
npm run dev:frontend         # vite on :5173, proxies /api to :8788
npm run dev:backend          # wrangler on :8788
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
