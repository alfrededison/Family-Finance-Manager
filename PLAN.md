# Finance Manager — Cloudflare Pages Implementation Plan

> App text language: Vietnamese | Plan language: English

---

## Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Frontend | Vanilla JS + Vite | No framework overhead — same HTML/CSS/JS already written |
| Hosting | Cloudflare Pages | Free tier, global CDN, git-push deploy |
| Database | Cloudflare D1 | SQLite-compatible, serverless, zero cold start |
| API layer | Pages Functions | `/functions/*.js` — runs at edge, bound to D1 |
| Future: price sync | Cloudflare Workers | Cron trigger → fetch prices → write to D1 |
| Auth (optional) | Cloudflare Access | Zero-config SSO gate — no code changes needed |

---

## File Structure

```
finance-manager/
├── src/
│   ├── index.html
│   ├── main.js              # app entry, router
│   ├── api.js               # fetch wrapper (replaces google.script.run)
│   └── pages/
│       ├── dashboard.js
│       ├── assets.js
│       ├── transactions.js
│       ├── members.js
│       └── groups.js
│
├── functions/
│   └── api/
│       ├── assets.js        # GET (list), POST (create)
│       ├── assets/
│       │   └── [id].js      # PUT (update), DELETE (soft delete)
│       ├── transactions.js
│       ├── members.js
│       ├── groups.js
│       ├── dashboard.js     # aggregated KPIs + breakdowns
│       └── seed.js          # POST — idempotent data init
│
├── workers/
│   └── price-sync.js        # [FUTURE] cron-triggered price updater
│
├── schema.sql               # D1 table definitions
├── seed.sql                 # sample data
├── wrangler.toml            # Cloudflare config
├── vite.config.js
└── package.json
```

---

## Phase 1 — D1 Database Schema

**Estimated effort: ~1h**

### Tables

| Table | Key Columns | Notes |
|---|---|---|
| `members` | id, name, color | Simple lookup |
| `asset_groups` | id, name, icon, type (Asset/Liability), active | Customisable |
| `assets` | id, name, group_id, subtype, member_id, qty, unit, cost_price, current_price, start_date, end_date, rate, notes, status | Core table |
| `transactions` | id, date, type, asset_id, member_id, qty, unit_price, total, notes | Append-only log |
| `price_history` | asset_id, price, recorded_at, source | For future Worker + sparklines |

> **Note:** `value`, `p&l`, and `p&l_pct` are **computed at query time** (`qty × current_price`) — not stored as columns. This keeps them always accurate without needing triggers or update cascades.

### Commands

```bash
npx wrangler d1 create finance-db
npx wrangler d1 execute finance-db --file=schema.sql
npx wrangler d1 execute finance-db --file=seed.sql   # optional sample data
```

---

## Phase 2 — Pages Functions API Endpoints

**Estimated effort: ~2h**

All functions export an `onRequest(context)` handler. D1 is accessed via `context.env.DB`. CORS headers set for same-origin only.

### Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/dashboard` | Single query joining all tables — returns KPIs, group breakdown, member breakdown. Replaces `getAllData()` with one round-trip instead of four. |
| GET | `/api/assets` | Filtered asset list with computed value/P&L. Supports `?group=`, `?member=`, `?q=` |
| POST | `/api/assets` | Create asset, returns new row |
| PUT | `/api/assets/[id]` | Update price or full row. Used by both manual edit UI and future Worker |
| DELETE | `/api/assets/[id]` | Soft delete — sets `status = 'deleted'` |
| GET | `/api/transactions` | List transactions, supports `?member=`, `?q=` |
| POST | `/api/transactions` | Create transaction |
| GET/POST | `/api/members` | List / create members |
| GET/POST | `/api/groups` | List / create asset groups |
| POST | `/api/seed` | Idempotent — inserts default groups + sample data if DB is empty |

---

## Phase 3 — Frontend Migration (replace `google.script.run`)

**Estimated effort: ~2h**

This is a mechanical find-and-replace across ~12 call sites. All existing UI components, modals, and CSS stay exactly as-is — zero redesign.

### Create `src/api.js`

A thin fetch wrapper with uniform error handling:

```js
const BASE = '/api';

async function request(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export const api = {
  get:  (path)        => request('GET',    path),
  post: (path, body)  => request('POST',   path, body),
  put:  (path, body)  => request('PUT',    path, body),
  del:  (path)        => request('DELETE', path),
};
```

### Migration Pattern

```js
// Before (Google Apps Script)
google.script.run
  .withSuccessHandler(function(data) { ... })
  .withFailureHandler(function(err) { ... })
  .getAllData();

// After (Cloudflare)
try {
  const data = await api.get('/dashboard');
  // same handler logic
} catch (err) {
  toast('❌ Lỗi: ' + err.message);
}
```

### Init Flow Change

```js
// Before: check isSetup() → then getAllData()
// After: GET /dashboard directly — if DB is empty, /api/seed auto-runs on first request
window.onload = async function() {
  const data = await api.get('/dashboard');
  renderAll(data);
};
```

---

## Phase 4 — Cloudflare Deploy Config

**Estimated effort: ~30min**

### `wrangler.toml`

```toml
name = "finance-manager"
compatibility_date = "2024-01-01"
pages_build_output_dir = "dist"

[[d1_databases]]
binding = "DB"
database_name = "finance-db"
database_id = "<your-d1-database-id>"
```

### Deploy Commands

```bash
# Build
npm run build

# Deploy to Cloudflare Pages
npx wrangler pages deploy dist

# Or connect GitHub repo in Cloudflare dashboard for auto-deploy on push
```

### Optional: Cloudflare Access (Authentication)

Enable in the Cloudflare dashboard under **Access → Applications → Add an application → Self-hosted**. Point it at your Pages URL. Supports Google SSO, one-time email PIN, and GitHub OAuth. **No code changes required.**

---

## Phase 5 — Future: Cloudflare Worker Price Sync

**No frontend changes required.** The Worker reuses the `PUT /api/assets/[id]` endpoint from Phase 2.

### `workers/price-sync.js`

```js
export default {
  async scheduled(event, env, ctx) {
    const assets = await env.DB
      .prepare("SELECT id, subtype, notes FROM assets WHERE status = 'active'")
      .all();

    for (const asset of assets.results) {
      const price = await fetchPrice(asset);  // see sources below
      if (!price) continue;

      await env.DB
        .prepare("UPDATE assets SET current_price = ? WHERE id = ?")
        .bind(price, asset.id)
        .run();

      await env.DB
        .prepare("INSERT INTO price_history (asset_id, price, recorded_at, source) VALUES (?, ?, ?, ?)")
        .bind(asset.id, price, new Date().toISOString(), 'auto')
        .run();
    }
  }
};
```

### Price Sources (Vietnamese market)

| Asset type | Source |
|---|---|
| VN stocks (HOSE/HNX) | SSI iBoard API or VNDIRECT API |
| Crypto (BTC, ETH…) | CoinGecko public API |
| USD/VND rate | State Bank of Vietnam (SBV) XML feed |
| Gold (SJC) | SJC website scrape or Bảo Tín Minh Châu API |

### `wrangler.toml` addition for Worker

```toml
[triggers]
crons = ["*/15 2-8 * * 1-5"]  # every 15min, 9:00–15:00 ICT, weekdays
```

---

## Implementation Order

```
Phase 1 (schema)  →  Phase 2 (API)  →  Phase 3 (frontend)  →  Phase 4 (deploy)
                                                                       ↓
                                                             Phase 5 (future sprint)
```

## Estimated Total Effort

- **Phase 1:** ~1h — write `schema.sql`, run D1 migrations
- **Phase 2:** ~2h — write 7 Function files
- **Phase 3:** ~2h — create `api.js`, replace ~12 call sites
- **Phase 4:** ~30min — `wrangler.toml` + first deploy
- **Phase 5:** future sprint — Worker + price source integrations