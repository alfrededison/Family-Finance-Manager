# Finance Manager

Vietnamese personal finance tracker on Cloudflare Pages + D1.

## Quick start

```bash
npm install

# 1. Create the D1 database
npm run setup

# 2. Apply schema
npm run db:migrate
npm run db:migrate:remote

# 3. (Optional) seed sample data
npm run db:seed
npm run db:seed:remote

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
- `schema.sql` / `init.sql` — D1 setup
- `wrangler.toml` — Cloudflare config
