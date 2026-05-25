---
name: project-structure
description: "Cấu trúc tổng thể dự án appscript — tech stack, file layout, routing, backend, PWA, cron worker"
metadata: 
  node_type: memory
  type: project
  originSessionId: 44e7504a-f794-47fe-8136-8b4714978526
---

## Tech Stack

- **Frontend**: Vanilla JavaScript + Vite (không dùng React/Vue)
- **Backend**: Cloudflare Pages Functions (`functions/api/*`)
- **Cron Worker**: Cloudflare Worker riêng (`worker/index.js`) — chạy weekly snapshot (cron `0 17 * * 0`)
- **Database**: Cloudflare D1 (SQLite), binding `DB`, db `finance-db`
- **Build**: Vite, root `src/`, output `dist/`
- **Deploy**: Cloudflare Pages (`wrangler pages deploy dist`) + Worker (`wrangler deploy --config worker/wrangler.toml`)
- **PWA**: Service worker (`public/sw.js`), cache key `finance-shell-<git-sha>` (placeholder `__CACHE_VERSION__` được Vite build plugin thay bằng git short SHA, thêm `-dirty` nếu working tree bẩn)
- **UI language**: Tiếng Việt

## File Layout

```
appscript/
├── src/                          # Frontend source
│   ├── index.html                # HTML entry point
│   ├── main.js                   # Router, SW registration, shared utils exports
│   ├── api.js                    # Fetch wrapper (api.get/post/del)
│   ├── style.css                 # All styles
│   ├── pages/
│   │   ├── dashboard.js
│   │   ├── assets.js
│   │   ├── price-history.js
│   │   ├── snapshots.js          # Weekly asset snapshots view
│   │   └── settings.js
│   ├── components/
│   │   ├── bank-select.js
│   │   └── platform-select.js
│   └── data/
│       ├── banks.js
│       └── groups.js
├── functions/                    # Cloudflare Pages Functions (API)
│   ├── _utils.js
│   ├── _snapshot.js              # Shared snapshot logic (used by API + cron worker)
│   └── api/
│       ├── _providers.js         # Shared market-data provider logic
│       ├── price-history.js
│       ├── assets.js
│       ├── assets/[id].js
│       ├── members.js
│       ├── platforms.js
│       ├── settings.js
│       ├── providers.js
│       ├── dashboard.js
│       ├── export.js
│       ├── import.js
│       ├── sync.js
│       ├── snapshots.js          # List/query snapshots
│       ├── snapshots/run.js      # Manual snapshot trigger (POST)
│       └── market-data/fetch.js
├── worker/                       # Standalone Cloudflare Worker for cron
│   ├── index.js                  # scheduled() → refresh providers + run snapshot
│   └── wrangler.toml             # Weekly cron trigger
├── public/
│   ├── manifest.webmanifest      # PWA manifest
│   ├── sw.js                     # Service worker
│   ├── favicon.ico, favicon-32.png
│   ├── apple-touch-icon.png
│   └── icon-{192,512,maskable}.png
├── migrations/
│   └── 0001_asset_snapshots.sql
├── scripts/
│   ├── db.sh                     # migrate / migrate:remote / seed / seed:remote
│   ├── setup.sh                  # Initial setup
│   └── generate-icons.sh         # Build PWA icons from base_logo.png
├── schema.sql                    # Full reset schema (members, platforms, assets, price_history, settings, asset_snapshots)
├── demo.sql, init.sql            # Seed / initial data
├── wrangler.toml                 # Pages config (DB binding, build output dir)
├── vite.config.js                # Dev proxy /api/ → :8788; injects git info + SW cache version
└── package.json                  # v0.1.0
```

## Routing

Hash-based client-side routing trong `main.js`. Routes: `dashboard`, `assets`, `price-history`, `snapshots`, `settings`. Default: `dashboard`. Sidebar và bottom-nav active state đồng bộ với route.

## Shared Utils (export từ main.js)

`toast(msg, action?)`, `escapeHtml()`, `fmtVND()`, `fmtNum(n, digits=0)`, `fmtPct()`, `openModal()`, `closeModal()`, `rerender()`, `formatMoney()`, `parseMoney()`, `bindMoneyInputs()`, `parseMoneyPayload(payload, keys)`

## Build-Time Defines (vite.config.js)

`__GIT_SHA__`, `__GIT_MESSAGE__`, `__GIT_TIMESTAMP__` được inject từ `git log`. Plugin `swCacheVersion` thay `__CACHE_VERSION__` trong `dist/sw.js` bằng SHA sau khi bundle.

## Service Worker Update Flow

`main.js` đăng ký SW, lắng nghe `updatefound`. Khi có SW mới → toast "Có phiên bản mới" + nút "Tải lại" → `SKIP_WAITING` message → `controllerchange` → `window.location.reload()`.

Settings page có nút **"↺ Tải phiên bản mới nhất"**: gọi `reg.update()` → nếu có `reg.waiting` thì SKIP_WAITING, ngược lại xóa toàn bộ caches rồi reload.

## Settings Page Sections

1. 👥 Thành viên (CRUD members)
2. Nền tảng tiền gửi (CRUD platforms)
3. Giá thị trường (price providers: vàng, USD)
4. 🔗 Tích hợp dịch vụ (integrations)
5. Sao lưu & phục hồi (JSON export/import)
6. Ứng dụng (force reload phiên bản mới nhất)

## NPM Scripts

- `dev` → concurrently chạy `vite` (frontend :5173) + `wrangler pages dev public --port=8788`
- `build`, `deploy` → Vite build + Pages deploy
- `worker:dev`, `worker:deploy` → cron worker (test bằng `--test-scheduled`)
- `db:migrate[:remote]`, `db:seed[:remote]` → wrapper `scripts/db.sh`
- `icons`, `setup`

## Asset Snapshots

Bảng `asset_snapshots` lưu tổng giá trị theo `(snapshot_date, group_id, subtype)` — UNIQUE bucket. Cron worker chạy weekly (Chủ nhật 17:00 UTC): `fetchAllProviders(env)` → `runSnapshot(env)`. Có thể trigger thủ công qua `POST /api/snapshots/run` hoặc `POST http://localhost:8787/` khi chạy `worker:dev`.
