---
name: project-structure
description: "Cấu trúc tổng thể dự án appscript — tech stack, file layout, routing, backend, PWA"
metadata: 
  node_type: memory
  type: project
  originSessionId: 44e7504a-f794-47fe-8136-8b4714978526
---

## Tech Stack

- **Frontend**: Vanilla JavaScript + Vite (không dùng React/Vue)
- **Backend**: Cloudflare Workers (serverless)
- **Database**: Cloudflare D1 (SQLite)
- **Build**: Vite, root `src/`, output `dist/`
- **Deploy**: Cloudflare Pages
- **PWA**: Service worker (`public/sw.js`), cache key `finance-shell-v2`
- **UI language**: Tiếng Việt

## File Layout

```
appscript/
├── src/                        # Frontend source
│   ├── index.html              # HTML entry point
│   ├── main.js                 # Router, SW registration, shared utils exports
│   ├── api.js                  # Fetch wrapper (api.get/post/del)
│   ├── style.css               # All styles
│   ├── pages/
│   │   ├── dashboard.js
│   │   ├── assets.js
│   │   ├── price-history.js
│   │   ├── members.js
│   │   └── settings.js         # Settings page
│   ├── components/
│   │   ├── bank-select.js
│   │   └── platform-select.js
│   └── data/
│       ├── banks.js
│       └── groups.js
├── functions/                  # Cloudflare Workers API handlers
│   ├── _utils.js
│   └── api/
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
│       └── market-data/fetch.js
├── public/
│   ├── manifest.webmanifest   # PWA manifest
│   ├── sw.js                  # Service worker
│   └── icons/
├── schema.sql
├── seed.sql
├── vite.config.js             # Dev proxy: /api/ → localhost:8788 (Wrangler)
└── package.json               # version 0.1.0
```

## Routing

Hash-based client-side routing trong `main.js`. Routes: `dashboard`, `assets`, `price-history`, `members`, `settings`. Default: `dashboard`.

## Shared Utils (export từ main.js)

`toast(msg, action?)`, `escapeHtml()`, `fmtVND()`, `openModal()`, `rerender()`, `bindMoneyInputs()`

## Service Worker Update Flow

`main.js` đăng ký SW, lắng nghe `updatefound`. Khi có SW mới → toast "Có phiên bản mới" + nút "Tải lại" → `SKIP_WAITING` message → `controllerchange` → `window.location.reload()`.

Settings page có nút **"↺ Tải phiên bản mới nhất"**: gọi `reg.update()` → nếu có `reg.waiting` thì SKIP_WAITING, ngược lại xóa toàn bộ caches rồi reload.

## Settings Page Sections

1. Nền tảng tiền gửi (CRUD platforms)
2. Giá thị trường (price providers: vàng, USD)
3. Sao lưu & phục hồi JSON (export/import)
4. Ứng dụng (force reload để lấy phiên bản mới nhất)
