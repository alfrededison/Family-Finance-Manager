# Finance Manager

Vietnamese personal finance tracker on Cloudflare Pages + D1, with a companion
Cloudflare Worker that runs on two cron schedules: a **weekly** snapshot of
total assets (plus market-price refresh), and a **daily** maturity/interest
push notification.

## Quick start

```bash
npm install

# 1. Create the D1 database (also generates worker/wrangler.toml)
npm run setup

# 2. Apply schema
npm run db:migrate
npm run db:migrate:remote

# 3. (Optional for local) seed sample data — creates demo user (demo@example.com / demo1234)
npm run db:seed

# 4. Run locally (frontend HMR + backend live reload)
npm run dev                  # vite on :5173 (HMR) + wrangler on :8788 (functions)

# Or run them separately:
npm run dev:frontend         # vite on :5173, proxies /api to :8788
npm run dev:backend          # wrangler on :8788

# 5. (Optional) run the snapshot cron worker locally
npm run worker:dev           # wrangler on :8787
                             #   POST /         → snapshot + price refresh
                             #   POST /notify   → daily push notification
```

### Push notification setup (optional)

To enable maturity / interest-payment push notifications, generate a VAPID
keypair and configure secrets on both the Pages app and the cron worker:

```bash
# Generate keypair (prints VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY)
bash scripts/generate-vapid.sh

# Store on the worker
wrangler secret put VAPID_PUBLIC_KEY  --config worker/wrangler.toml
wrangler secret put VAPID_PRIVATE_KEY --config worker/wrangler.toml
wrangler secret put VAPID_SUBJECT     --config worker/wrangler.toml   # mailto:you@example.com

# Store on Pages (the /api/push/test endpoint reuses the sender)
wrangler pages secret put VAPID_PUBLIC_KEY
wrangler pages secret put VAPID_PRIVATE_KEY
wrangler pages secret put VAPID_SUBJECT
```

`GET /api/settings` reads `VAPID_PUBLIC_KEY` from the Pages env and exposes it
to the frontend — there's no DB row to maintain, so schema resets don't break
push setup.

For local dev, put the same three values in `.dev.vars` (Pages) and
`worker/.dev.vars` (cron worker) — both are gitignored. Users then opt-in via
**Cài đặt → 🔔 Thông báo nhắc nhở**.

## Authentication

The app is multi-user with self-hosted email/password auth (PBKDF2 + cookie
sessions stored in D1). Every API route under `/api/*` requires a session
except `/api/auth/login` and `/api/auth/signup`.

**Signup is closed by default.** To open it temporarily (e.g. to provision your
first user), set `ALLOW_SIGNUP="true"` in `wrangler.toml` `[vars]` or via
`wrangler pages secret put ALLOW_SIGNUP`, then remove it once everyone is in.

If you ran `npm run db:seed`, log in with:

- Email: `demo@example.com`
- Password: `demo1234`

## Deploy

```bash
npm run deploy               # Pages app
npm run worker:deploy        # Snapshot cron worker
```

## Cron worker

The worker in [`worker/`](worker/) handles two scheduled jobs, dispatched by
`event.cron` in `scheduled()`:

### Weekly snapshot (`0 17 * * 0` — Sunday 17:00 UTC = Monday 00:00 Vietnam)

1. Calls every market-data provider (DOJI, TyGiaUSD, Techcombank, VPS)
   **once**, then applies the resulting prices to **all users' assets** in
   single bulk SQL updates — no per-user HTTP traffic, no per-user loop on
   the asset writes. Changes are logged to `price_history`.
2. Loops over every user and aggregates their active assets by
   `(user_id, group_id, subtype)`, upserting one row per bucket into
   `asset_snapshots` for the **📈 Tăng trưởng** page.

The aggregation logic is shared with the Pages API — the worker imports
`runSnapshot` from [`functions/_snapshot.js`](functions/_snapshot.js) and
`fetchAllProviders` from [`functions/api/_providers.js`](functions/api/_providers.js)
directly; Wrangler bundles them at build time. No code duplication.

You can also trigger a snapshot from the UI ("📸 Tạo snapshot ngay" button on
the growth page) — that hits `POST /api/snapshots/run` against the Pages
function, which calls the same `runSnapshot` (but **does not** refresh prices).

### Daily push notification (`0 1 * * *` — 01:00 UTC = 08:00 Vietnam)

For every user, builds a summary of assets approaching `maturity_date` AND
loans with a periodic interest payment due within the user's configurable
window (default 3 days, stored under `user_settings['notify.maturity_days_ahead']`).
If the summary is non-empty, it sends a Web Push to every row in that user's
`push_subscriptions`.

The push pipeline is self-contained — no third-party services. VAPID JWT
signing (RFC 8292) and `aes128gcm` payload encryption (RFC 8291) are
implemented on top of Web Crypto in [`functions/_push.js`](functions/_push.js).
Subscriptions that return 404 or 410 are removed automatically.

Manual trigger: `curl -X POST http://localhost:8787/notify` when running
`npm run worker:dev`.

### `--persist-to` note (Wrangler 4)

Wrangler 4 resolves local D1 / KV / R2 persistence paths relative to the
config file. Since [`worker/wrangler.toml`](worker/wrangler.toml) lives inside
`worker/`, `wrangler dev --config worker/wrangler.toml` would otherwise create
an isolated `worker/.wrangler/state/` and not see the data seeded against the
root config. The `worker:dev` script passes `--persist-to .wrangler/state` to
force both wrangler instances onto the same local D1 file.

## Layout

```
.
├── src/                    # vanilla JS frontend (Vite)
│   ├── pages/              # dashboard, assets, price-history, snapshots, settings, login
│   ├── components/         # bank-select, platform-select
│   ├── api.js              # fetch wrapper — credentials:'include' + 401 → login redirect
│   └── data/groups.js      # hard-coded asset groups + subtypes
├── functions/
│   ├── _auth.js            # PBKDF2 hash + session helpers
│   ├── _middleware.js      # session gate for all /api/* requests
│   ├── _snapshot.js        # runSnapshot(env, { userId }) — shared with worker
│   ├── _notify.js          # buildNotificationSummary + nextInterestPaymentDate
│   ├── _push.js            # VAPID JWT + aes128gcm encryption + sender
│   └── api/
│       ├── auth/           # signup, login, logout, me, password
│       ├── push/           # subscribe (POST/DELETE) + test (POST)
│       ├── user-settings.js # per-user K/V (integrations + notify prefs live here)
│       ├── _providers.js   # fetchAllProviders(env, userId?) — UI scoped, cron global
│       ├── snapshots.js    # GET /api/snapshots
│       └── snapshots/run.js # POST /api/snapshots/run
├── worker/                 # Standalone cron worker (separate deploy)
│   ├── index.js            # weekly snapshot + daily push, dispatched by event.cron
│   └── wrangler.toml       # generated by scripts/setup.sh
├── schema.sql              # full local schema (users, sessions, user_settings + per-user tables)
├── demo.sql                # local seed (1 user + assets + 1 year of snapshots)
└── wrangler.toml           # generated by scripts/setup.sh
```
