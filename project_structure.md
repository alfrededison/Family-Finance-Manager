---
name: project-structure
description: "Cấu trúc tổng thể dự án appscript — tech stack, file layout, routing, backend, PWA, cron worker, multi-user auth"
metadata: 
  node_type: memory
  type: project
  originSessionId: 44e7504a-f794-47fe-8136-8b4714978526
---

## Tech Stack

- **Frontend**: Vanilla JavaScript + Vite (không dùng React/Vue)
- **Backend**: Cloudflare Pages Functions (`functions/api/*`) — gated bởi `functions/_middleware.js`
- **Cron Worker**: Cloudflare Worker riêng (`worker/index.js`) — 2 schedules: weekly snapshot (`0 17 * * 0`) + daily push notification (`0 1 * * *`), dispatched theo `event.cron`
- **Database**: Cloudflare D1 (SQLite), binding `DB`, db `finance-db`
- **Auth**: Self-hosted email + password. PBKDF2-SHA256 (600k iter) qua Web Crypto. Session cookie `sid` (HttpOnly, Secure, SameSite=Lax, 30 ngày sliding refresh) lưu trong bảng `sessions`.
- **Push Notifications**: Self-hosted Web Push API. VAPID JWT (RFC 8292, ES256) + `aes128gcm` payload encryption (RFC 8291) implement trực tiếp trên Web Crypto trong `functions/_push.js` — không phụ thuộc npm `web-push`. Secrets: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` set trên cả Worker và Pages.
- **Build**: Vite, root `src/`, output `dist/`
- **Deploy**: Cloudflare Pages (`wrangler pages deploy dist`) + Worker (`wrangler deploy --config worker/wrangler.toml`)
- **PWA**: Service worker (`public/sw.js`), cache key `finance-shell-<git-sha>`. Chỉ cache shell + static — **không cache `/api/*`** (per-user, auth-gated). Có thêm `push` + `notificationclick` handlers (read payload trực tiếp, navigate đến `data.url`). Logout xoá toàn bộ caches.
- **UI language**: Tiếng Việt

## Tenancy Model

Mỗi user có dữ liệu riêng. Các bảng per-user (`members`, `assets`, `asset_snapshots`, `user_settings`, `push_subscriptions`) đều có cột `user_id`. Các bảng global (`platforms`, `settings` cho market provider config + VAPID public key) shared giữa users. `asset_deltas` inherit tenancy qua `assets.user_id` (không có cột riêng). `push_subscriptions` dùng composite `UNIQUE(user_id, endpoint)` — cùng device có thể subscribe dưới nhiều user khác nhau.

## File Layout

```
appscript/
├── src/                          # Frontend source
│   ├── index.html                # Có #sidebar-user cho user chip + logout button
│   ├── main.js                   # bootstrap() → /api/auth/me → router(); user chip; logout helper
│   ├── api.js                    # Fetch wrapper — credentials:'include', 401 → redirect login
│   ├── style.css                 # All styles + .auth-card / .auth-tabs / body.auth-only gate
│   ├── pages/
│   │   ├── dashboard.js
│   │   ├── assets.js             # List + form modal; form show "lãi/lỗ dự kiến" live qua computeAssetMetrics()
│   │   ├── asset-deltas.js
│   │   ├── snapshots.js          # Weekly asset snapshots view
│   │   ├── settings.js           # Có "Tài khoản" section (đổi mật khẩu + logout)
│   │   └── login.js              # Tabbed login/signup form
│   ├── components/
│   │   ├── bank-select.js
│   │   └── platform-select.js
│   └── data/
│       ├── banks.js
│       └── groups.js
├── functions/                    # Cloudflare Pages Functions (API)
│   ├── _utils.js                 # computeAssetMetrics() — frontend cũng import (src/pages/assets.js) để preview lãi/lỗ
│   ├── _auth.js                  # hashPassword, verifyPassword, createSession, getSessionUser, cookie helpers
│   ├── _middleware.js            # Session gate cho /api/* (skip /api/auth/login, signup gated bởi env.ALLOW_SIGNUP)
│   ├── _snapshot.js              # runSnapshot(env, { userId }) — yêu cầu userId
│   ├── _notify.js                # buildNotificationSummary(env, userId) + nextInterestPaymentDate(asset)
│   ├── _push.js                  # VAPID JWT + aes128gcm encryption + sendUserNotification / sendDailyNotificationForUser
│   └── api/
│       ├── _providers.js         # fetchAllProviders(env, userId?) — userId optional (UI scoped, cron global)
│       ├── auth/
│       │   ├── signup.js         # POST — env.ALLOW_SIGNUP='true' mới enable
│       │   ├── login.js          # POST — verify password (timing-safe), set sid cookie
│       │   ├── logout.js         # POST — destroy session, clear cookie
│       │   ├── me.js             # GET — current user (401 nếu chưa login)
│       │   └── password.js       # POST — đổi mật khẩu, invalidate other sessions
│       ├── push/
│       │   ├── subscribe.js      # POST upsert / DELETE per (user_id, endpoint)
│       │   └── test.js           # POST — gửi thử notification cho current user
│       ├── user-settings.js      # GET/POST per-user K/V (integrations + notify prefs sống ở đây)
│       ├── asset-deltas.js       # GET — lịch sử thay đổi tài sản (changes JSON), filter asset/type + phân trang
│       ├── asset-deltas/[id]/undo.js  # POST — hoàn tác 1 bản ghi lịch sử (create→xoá, edit→revert, delete→tạo lại)
│       ├── assets.js
│       ├── assets/[id].js
│       ├── members.js
│       ├── platforms.js          # Global
│       ├── settings.js           # Global (chỉ market.* — reject integration.*)
│       ├── providers.js
│       ├── dashboard.js
│       ├── export.js             # Per-user dump (members, assets, asset_deltas, asset_snapshots, user_settings) + global platforms
│       ├── import.js             # Replace wipe per-user, inject user_id vào mọi row
│       ├── sync.js               # TCBS/Topi sync — đọc instances từ user_settings, ghi lại `last_sync` mỗi instance sau khi sync xong
│       ├── snapshots.js          # List/query snapshots (per-user)
│       ├── snapshots/run.js      # Manual snapshot trigger (POST, per-user)
│       └── market-data/fetch.js  # UI fetch (scoped tới caller); cron không dùng route này
├── worker/                       # Standalone Cloudflare Worker for cron
│   ├── index.js                  # scheduled() dispatch theo event.cron: weekly snapshot + daily push notify
│   └── wrangler.toml             # 2 cron triggers (weekly + daily)
├── public/
│   ├── manifest.webmanifest      # PWA manifest
│   ├── sw.js                     # Service worker — KHÔNG cache /api/*; có push + notificationclick handlers
│   ├── favicon.ico, favicon-32.png
│   ├── apple-touch-icon.png
│   └── icon-{192,512,maskable}.png
├── scripts/
│   ├── db.sh                     # migrate / migrate:remote / seed
│   ├── gen-demo.js               # Sinh demo.sql từ demo.template.sql (điền ngày tương đối theo ngày chạy)
│   ├── setup.sh                  # Initial setup
│   ├── generate-vapid.sh         # Sinh VAPID keypair (ECDH P-256 → base64url) cho Web Push
│   └── generate-icons.sh         # Build PWA icons from base_logo.png
├── schema.sql                    # Full reset schema (users, sessions, user_settings, members, platforms, assets, asset_deltas, settings, asset_snapshots)
├── demo.template.sql             # Template seed — placeholder ngày tương đối ({{D+n}}, {{EOM-n}}, {{DOM+n}})
├── demo.sql                      # GENERATED bởi scripts/gen-demo.js — demo có 1 user (demo@example.com / demo1234)
├── wrangler.toml                 # Pages config (DB binding, build output dir, ALLOW_SIGNUP nếu mở signup)
├── vite.config.js                # Dev proxy /api/ → :8788; injects git info + SW cache version
└── package.json                  # v0.1.0
```

## Routing

Hash-based client-side routing trong `main.js`. Khi load, `bootstrap()` gọi `GET /api/auth/me`:
- **200** → set `currentUser`, gắn user chip vào sidebar, gọi `router()` để render route hiện tại.
- **401** → set `body.auth-only` (ẩn sidebar/bottom-nav/nav-toggle), render `renderLogin(view)`.

Routes: `dashboard`, `assets`, `asset-deltas`, `snapshots`, `settings`. Default: `dashboard`. Sidebar và bottom-nav active state đồng bộ với route.

## Shared Utils (export từ main.js)

`toast(msg, action?)`, `escapeHtml()`, `fmtVND()`, `fmtNum(n, digits=0)`, `fmtPct()`, `openModal()`, `closeModal()`, `rerender()`, `formatMoney()`, `parseMoney()`, `bindMoneyInputs()`, `parseMoneyPayload(payload, keys)`, `getCurrentUser()`, `logout()`.

## Auth Flow

- **Signup** chỉ enable khi `env.ALLOW_SIGNUP === 'true'` (default closed). Bật tạm thời trong `wrangler.toml [vars]` để tạo user đầu, sau đó tắt.
- **Login** verify password với constant-time compare; cả miss case cũng verify dummy hash để equalize timing. Set cookie `sid=...; HttpOnly; Secure; SameSite=Lax; Max-Age=30d`.
- **Session sliding refresh** trong `getSessionUser`: bump `expires_at` khi session > 24h tuổi.
- **Logout** xoá session row + clear cookie + xoá toàn bộ caches của browser (SW + Cache Storage) để dữ liệu user cũ không leak sang user mới.

## Build-Time Defines (vite.config.js)

`__GIT_SHA__`, `__GIT_MESSAGE__`, `__GIT_TIMESTAMP__` được inject từ `git log`. Plugin `swCacheVersion` thay `__CACHE_VERSION__` trong `dist/sw.js` bằng SHA sau khi bundle.

Plugin `devEnvFlag` (`apply: 'serve'`) gắn `data-env="dev"` vào `<html>` chỉ khi chạy dev server; `style.css` override `--bg` / `--primary` và thêm nhãn `DEV` cạnh `.brand` để phân biệt với production.

## Service Worker Update Flow

`main.js` đăng ký SW, lắng nghe `updatefound`. Khi có SW mới → toast "Có phiên bản mới" + nút "Tải lại" → `SKIP_WAITING` message → `controllerchange` → `window.location.reload()`.

Settings page có nút **"↺ Tải phiên bản mới nhất"**: gọi `reg.update()` → nếu có `reg.waiting` thì SKIP_WAITING, ngược lại xóa toàn bộ caches rồi reload.

## Settings Page Sections

1. 👤 Tài khoản (current user info + đổi mật khẩu + logout)
2. 👥 Thành viên (CRUD members — per-user)
3. Nền tảng tiền gửi (CRUD platforms — global)
4. Giá thị trường (market provider config — global, dùng `/api/settings`)
5. 🔗 Tích hợp dịch vụ (TCBS/Topi instances — per-user, dùng `/api/user-settings`)
6. Sao lưu & phục hồi (JSON export/import per-user)
7. 🔔 Thông báo nhắc nhở (subscribe push, ngưỡng nhắc trước N ngày, gửi thử — per-user)
8. Ứng dụng (force reload phiên bản mới nhất)

## NPM Scripts

- `dev` → concurrently chạy `vite` (frontend :5173) + `wrangler pages dev public --port=8788`
- `build`, `deploy` → Vite build + Pages deploy
- `worker:dev`, `worker:deploy` → cron worker (test bằng `--test-scheduled`)
- `db:migrate[:remote]` → wrapper `scripts/db.sh`; `db:seed` → gen-demo.js (sinh demo.sql với ngày tương đối) rồi `scripts/db.sh seed`
- `icons`, `setup`

## Asset Snapshots

Bảng `asset_snapshots` lưu tổng giá trị theo `(user_id, snapshot_date, group_id, subtype)` — UNIQUE bucket per user. Cron worker chạy weekly (Chủ nhật 17:00 UTC): `fetchAllProviders(env)` (gọi 1 lần, update tất cả users' assets trong bulk SQL) → loop users `runSnapshot(env, { userId })`. Có thể trigger thủ công per-user qua `POST /api/snapshots/run` hoặc trigger global qua `POST http://localhost:8787/` khi chạy `worker:dev`.

## Asset History Undo

Mỗi dòng trong 📋 Lịch sử tài sản có nút **↩ Hoàn tác** → `POST /api/asset-deltas/:id/undo` (body `{notes}` optional). Hành vi theo `type` của bản ghi:

- `create` → soft delete tài sản (`status='deleted'`), giống hành động xoá tài sản.
- `edit` → set lại các field trong `changes` về giá trị `old` (có confirmation, modal preview `hiện tại → sẽ khôi phục`).
- `delete` → `status='active'` + apply snapshot đã lưu lúc xoá (thuộc tính tại thời điểm xoá).

Mọi undo đều ghi một delta mới với note `Hoàn tác <loại> (#<id>) — <ghi chú người dùng>`, source `manual`. Field names chỉ được apply nếu nằm trong whitelist `DELTA_FIELDS`. Server trả 409 nếu state không hợp lệ (undo `create` khi tài sản đã xoá, undo `delete` khi tài sản đang hoạt động); UI disable nút sẵn cho 2 case này dựa trên `asset_status` trả về từ `GET /api/asset-deltas`.

## Push Notifications

Cron daily (`0 1 * * *` = 08:00 Vietnam) loop từng user → `sendDailyNotificationForUser(env, userId)`:

1. `buildNotificationSummary(env, userId)` đọc ngưỡng `notify.maturity_days_ahead` (per-user, default 3) → query 2 nhóm:
   - Assets có `maturity_date` rơi trong cửa sổ `[today, today+N]`.
   - Loans (`cho-vay`/`di-vay`) có `interest_payment_day` set, compute `nextInterestPaymentDate()` (anchor `start_date`, walk forward theo cycle `monthly`/`quarterly`), include nếu daysOut ≤ N.
2. Nếu summary có item → encrypt payload `{title, body, url}` với aes128gcm cho từng row trong `push_subscriptions` của user, POST tới `endpoint` kèm VAPID JWT.
3. Endpoint trả 404/410 → row tự xoá. 200/201/202 → bump `last_used_at`.

VAPID public key đọc trực tiếp từ `env.VAPID_PUBLIC_KEY` trong `/api/settings` (Pages secret) — không lưu DB để khỏi bị wipe khi reset schema. Private key chỉ tồn tại dưới dạng worker/Pages secret.

Test thủ công: `POST /api/push/test` (per-user, qua middleware) hoặc `POST http://localhost:8787/notify` (tất cả users, qua worker dev).
