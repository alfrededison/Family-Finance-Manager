# Finance Manager — Cloudflare Pages Implementation Plan

> App text language: Vietnamese | Plan language: English  
> Last updated: based on actual spreadsheet data analysis

---

## Asset Group Structure (from spreadsheet)

This is the canonical group/subtype mapping derived from the actual data. All groups and subtypes are defaults but can be added/removed by the user.

| Group (Hạng mục) | Subtypes (Bổ sung) | Type | Special fields |
|---|---|---|---|
| **Đầu tư** | Cổ phiếu, Coin, Trái phiếu, CCQ | Asset | — |
| **Tích trữ** | USD, Vàng, BĐS | Asset | — |
| **Cho vay** | Cho vay nóng, Cho vay lâu dài | Asset | Borrower name (ghi chú) |
| **Đi vay** | Trả góp, Vay nóng, Vay lâu dài | Liability | Lender name (ghi chú) |
| **Tiền gửi** | TG cố định, TG linh hoạt | Asset | **Platform selector** (Topi, Sstock, TCB…) + kỳ hạn + ngày đáo hạn |
| **Bank** | TK tự do, TK dài tháng, TK ít tháng | Asset | **Bank selector** (searchable by name or abbreviation) |

> **Key differences from previous version:**
> - **Cho vay** and **Đi vay** are two separate groups — not merged
> - **Cho vay** = money lent out → type `Asset` (you are owed money)
> - **Đi vay** = money borrowed → type `Liability` (you owe money)
> - **CCQ** is an explicit subtype under Đầu tư
> - Total: **6 groups** matching the spreadsheet exactly

---

## Per-Group Form UI

Each asset group has its own dedicated form with group-specific fields. There is **no shared generic modal** — switching the group selector completely swaps the form layout and available fields.

### Design principle

```
User selects group → entire form re-renders for that group's specific fields
```

All groups share these base fields: **Tên tài sản**, **Loại** (subtype dropdown), **Người nắm giữ**, **Số tiền / Giá trị**, **Ghi chú**.  
Each group then adds its own specialised fields below.

---

### 📈 Đầu tư
| Field | Type | Notes |
|---|---|---|
| Loại | select | Cổ phiếu / Coin / Trái phiếu / CCQ |
| Mã / Tên quỹ | text | Ticker symbol or fund code |
| Số lượng | number | Shares, units, coins |
| Giá vốn / đơn vị | number | Cost price per unit |
| Giá hiện tại / đơn vị | number | Current price per unit (manual, later auto via Worker) |

Displays computed: **Giá trị hiện tại**, **Lãi/Lỗ (₫)**, **Lãi/Lỗ (%)**

---

### 🏆 Tích trữ
| Field | Type | Notes |
|---|---|---|
| Loại | select | USD / Vàng / BĐS |
| Số lượng | number | USD amount, gold (lượng/chỉ), land area (m²) |
| Đơn vị | text | Auto-suggested: USD, lượng, chỉ, m² |
| Giá vốn / đơn vị | number | Purchase price |
| Giá hiện tại / đơn vị | number | Market price |

---

### 🤝 Cho vay
| Field | Type | Notes |
|---|---|---|
| Loại | select | Cho vay nóng / Cho vay lâu dài |
| Người vay | text | Borrower name (e.g. "Phước", "a Sơn") |
| Số tiền cho vay | number | Principal |
| Lãi suất (%/tháng hoặc năm) | number | Interest rate |
| Ngày cho vay | date | |
| Ngày thu hồi dự kiến | date | Expected return date |
| Lãi định kỳ | number | Periodic interest received (if any) |

---

### 💳 Đi vay
| Field | Type | Notes |
|---|---|---|
| Loại | select | Trả góp / Vay nóng / Vay lâu dài |
| Chủ nợ / Nguồn vay | text | Lender name or institution |
| Số tiền vay gốc | number | Original principal |
| Dư nợ hiện tại | number | Remaining balance |
| Lãi suất (%/tháng hoặc năm) | number | |
| Ngày vay | date | |
| Ngày đáo hạn / trả hết | date | |
| Số tiền trả hàng tháng | number | Monthly payment (for instalment loans) |

---

### 🏦 Tiền gửi
| Field | Type | Notes |
|---|---|---|
| Loại | select | TG cố định / TG linh hoạt |
| Nền tảng | **custom dropdown** | Topi, Sstock, TCB… — user-managed list (see below) |
| Số tiền gửi | number | Principal deposited |
| Lãi suất (%/năm) | number | |
| Kỳ hạn | select | 1 tháng / 3 tháng / 6 tháng / 1 năm / Linh hoạt / Tuỳ chỉnh |
| Ngày gửi | date | |
| Ngày đáo hạn | date | Auto-calculated from ngày gửi + kỳ hạn, editable |

**Platform selector behaviour:**
- Dropdown list loaded from `platforms` table in D1
- Shows only the name (e.g. "Topi", "Sstock", "Techcombank")
- User can add/remove platforms in Settings → Quản lý nền tảng
- Default list: Topi, Sstock, Techcombank, BIDV, Vietcombank, ACB, MB Bank, VPBank, VIB, TPBank

---

### 🏧 Bank
| Field | Type | Notes |
|---|---|---|
| Loại tài khoản | select | TK tự do / TK dài tháng / TK ít tháng |
| Ngân hàng | **searchable select** | Full name displayed, search by full name / short name / abbreviation |
| Số tài khoản | text | Optional, for reference |
| Số dư hiện tại | number | Current balance |

**Bank selector behaviour:**
- Search input: user types any of → full name, short name, or abbreviation
- Results show: `[Abbreviation] — Full official name`
- Example row: `TCB — Ngân hàng TMCP Kỹ Thương Việt Nam (Techcombank)`
- Stored value: bank abbreviation (e.g. `TCB`) — display resolved from static list
- Unlisted bank: user can type freely and save as custom entry

---

### Vietnamese Bank Reference Data

Stored as a static JS array in `data/banks.js`. Each entry has 3 searchable fields:

```js
// data/banks.js
export const BANKS = [
  { abbr: 'VCB',  short: 'Vietcombank',  full: 'Ngân hàng TMCP Ngoại Thương Việt Nam' },
  { abbr: 'TCB',  short: 'Techcombank',  full: 'Ngân hàng TMCP Kỹ Thương Việt Nam' },
  { abbr: 'BIDV', short: 'BIDV',         full: 'Ngân hàng TMCP Đầu Tư và Phát Triển Việt Nam' },
  { abbr: 'VPB',  short: 'VPBank',       full: 'Ngân hàng TMCP Việt Nam Thịnh Vượng' },
  { abbr: 'MB',   short: 'MB Bank',      full: 'Ngân hàng TMCP Quân Đội' },
  { abbr: 'ACB',  short: 'ACB',          full: 'Ngân hàng TMCP Á Châu' },
  { abbr: 'STB',  short: 'Sacombank',    full: 'Ngân hàng TMCP Sài Gòn Thương Tín' },
  { abbr: 'HDB',  short: 'HDBank',       full: 'Ngân hàng TMCP Phát Triển TP. Hồ Chí Minh' },
  { abbr: 'VIB',  short: 'VIB',          full: 'Ngân hàng TMCP Quốc Tế Việt Nam' },
  { abbr: 'TPB',  short: 'TPBank',       full: 'Ngân hàng TMCP Tiên Phong' },
  { abbr: 'MSB',  short: 'MSB',          full: 'Ngân hàng TMCP Hàng Hải Việt Nam' },
  { abbr: 'SHB',  short: 'SHB',          full: 'Ngân hàng TMCP Sài Gòn - Hà Nội' },
  { abbr: 'OCB',  short: 'OCB',          full: 'Ngân hàng TMCP Phương Đông' },
  { abbr: 'SEA',  short: 'SeABank',      full: 'Ngân hàng TMCP Đông Nam Á' },
  { abbr: 'NAB',  short: 'Nam A Bank',   full: 'Ngân hàng TMCP Nam Á' },
  { abbr: 'CB',   short: 'CB Bank',      full: 'Ngân hàng Thương Mại TNHH MTV Xây Dựng Việt Nam' },
  { abbr: 'PGB',  short: 'PGBank',       full: 'Ngân hàng TMCP Xăng Dầu Petrolimex' },
  { abbr: 'BAB',  short: 'Bac A Bank',   full: 'Ngân hàng TMCP Bắc Á' },
  { abbr: 'KLB',  short: 'Kienlongbank', full: 'Ngân hàng TMCP Kiên Long' },
  { abbr: 'LPB',  short: 'LPBank',       full: 'Ngân hàng TMCP Lộc Phát Việt Nam' },
  { abbr: 'NVB',  short: 'NCB',          full: 'Ngân hàng TMCP Quốc Dân' },
  { abbr: 'VAB',  short: 'VietABank',    full: 'Ngân hàng TMCP Việt Á' },
  { abbr: 'AGRI', short: 'Agribank',     full: 'Ngân hàng Nông nghiệp và Phát triển Nông thôn VN' },
  { abbr: 'CTG',  short: 'VietinBank',   full: 'Ngân hàng TMCP Công Thương Việt Nam' },
  // ... full list in repo
];
```

**Search logic** — match against all 3 fields, case-insensitive, accent-insensitive:
```js
function searchBanks(q) {
  const norm = q.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return BANKS.filter(b =>
    [b.abbr, b.short, b.full].some(s =>
      s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(norm)
    )
  );
}
// "ky thuong" → matches Techcombank ✓
// "TCB"       → matches Techcombank ✓
// "Kỹ Thương" → matches Techcombank ✓
```

**Display format in dropdown results:**
```
TCB — Ngân hàng TMCP Kỹ Thương Việt Nam (Techcombank)
VCB — Ngân hàng TMCP Ngoại Thương Việt Nam (Vietcombank)
```

**Stored value in DB:** abbreviation only (`TCB`). Resolved to full display on render.

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
│   ├── main.js                  # app entry, router
│   ├── api.js                   # fetch wrapper (replaces google.script.run)
│   ├── components/
│   │   ├── bank-select.js       # searchable bank dropdown component
│   │   └── platform-select.js  # platform dropdown for Tiền gửi
│   └── pages/
│       ├── dashboard.js
│       ├── assets.js
│       ├── transactions.js
│       ├── members.js
│       ├── groups.js
│       └── settings.js          # manage platforms, banks, groups
│
├── functions/
│   └── api/
│       ├── assets.js            # GET (list), POST (create)
│       ├── assets/
│       │   └── [id].js          # PUT (update), DELETE (soft delete)
│       ├── transactions.js
│       ├── members.js
│       ├── groups.js
│       ├── platforms.js         # GET/POST/DELETE savings platforms
│       ├── dashboard.js         # aggregated KPIs + breakdowns
│       └── seed.js              # POST — idempotent data init
│
├── workers/
│   └── price-sync.js            # [FUTURE] cron-triggered price updater
│
├── data/
│   └── banks.js                 # static list of VN banks (abbr + full name)
│
├── schema.sql                   # D1 table definitions
├── seed.sql                     # default groups, subtypes, platforms, banks
├── wrangler.toml                # Cloudflare config
├── vite.config.js
└── package.json
```

---

## Phase 1 — D1 Database Schema

**Estimated effort: ~1.5h**

### Tables

```sql
-- Members (no role/email — simple family sharing)
CREATE TABLE members (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#888888'
);

-- Asset groups (customisable, defaults from spreadsheet)
CREATE TABLE asset_groups (
  id TEXT PRIMARY KEY,        -- 'dau-tu', 'tich-tru', 'vay-no', 'tien-gui', 'bank'
  name TEXT NOT NULL,         -- 'Đầu tư', 'Tích trữ', etc.
  icon TEXT,
  type TEXT DEFAULT 'Asset',  -- 'Asset' (Đầu tư/Tích trữ/Cho vay/Tiền gửi/Bank) | 'Liability' (Đi vay)
  sort_order INTEGER DEFAULT 0,
  active INTEGER DEFAULT 1
);

-- Subtypes per group (customisable)
CREATE TABLE asset_subtypes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id TEXT NOT NULL REFERENCES asset_groups(id),
  name TEXT NOT NULL           -- 'Cổ phiếu', 'TG cố định', 'TK tự do', etc.
);

-- Savings platforms (for Tiền gửi group — add/remove by user)
CREATE TABLE platforms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE    -- 'Topi', 'Sstock', 'TCB', etc.
);

-- Core assets table
CREATE TABLE assets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  group_id TEXT NOT NULL REFERENCES asset_groups(id),
  subtype TEXT,                -- selected from asset_subtypes.name
  member_id TEXT REFERENCES members(id),
  qty REAL DEFAULT 0,
  unit TEXT,
  cost_price REAL DEFAULT 0,
  current_price REAL DEFAULT 0,
  -- Tiền gửi fields
  platform TEXT,               -- FK to platforms.name (Tiền gửi only)
  term TEXT,                   -- kỳ hạn: '1 tháng', '6 tháng', '1 năm', etc.
  maturity_date TEXT,          -- ngày đáo hạn (ISO date)
  -- Bank fields
  bank TEXT,                   -- bank abbreviation, e.g. 'TCB' (Bank group only)
  -- Common
  interest_rate REAL DEFAULT 0,
  start_date TEXT,
  notes TEXT,
  status TEXT DEFAULT 'active' -- 'active' | 'deleted'
);

-- Transactions log
CREATE TABLE transactions (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  type TEXT NOT NULL,          -- 'Mua', 'Bán', 'Cho vay', 'Gửi tiết kiệm', etc.
  asset_id TEXT REFERENCES assets(id),
  asset_name TEXT,             -- denormalised for display
  group_id TEXT,
  member_id TEXT REFERENCES members(id),
  qty REAL DEFAULT 0,
  unit_price REAL DEFAULT 0,
  total REAL DEFAULT 0,
  notes TEXT
);

-- Price history (for future Worker + sparklines)
CREATE TABLE price_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id TEXT REFERENCES assets(id),
  price REAL NOT NULL,
  recorded_at TEXT NOT NULL,
  source TEXT DEFAULT 'manual' -- 'manual' | 'worker'
);
```

### Computed values (never stored)
- `value = qty × current_price` — calculated at query time
- `pl = value - (qty × cost_price)`
- `pl_pct = pl / (qty × cost_price) × 100`

### Seed data (default groups + subtypes + platforms)

```sql
-- Groups (6 groups matching spreadsheet)
INSERT INTO asset_groups VALUES ('dau-tu',   'Đầu tư',   '📈', 'Asset',     1, 1);
INSERT INTO asset_groups VALUES ('tich-tru', 'Tích trữ', '🏆', 'Asset',     2, 1);
INSERT INTO asset_groups VALUES ('cho-vay',  'Cho vay',  '🤝', 'Asset',     3, 1);
INSERT INTO asset_groups VALUES ('di-vay',   'Đi vay',   '💳', 'Liability', 4, 1);
INSERT INTO asset_groups VALUES ('tien-gui', 'Tiền gửi', '🏦', 'Asset',     5, 1);
INSERT INTO asset_groups VALUES ('bank',     'Bank',     '🏧', 'Asset',     6, 1);

-- Subtypes
INSERT INTO asset_subtypes (group_id, name) VALUES
  ('dau-tu',   'Cổ phiếu'), ('dau-tu',   'Coin'),
  ('dau-tu',   'Trái phiếu'), ('dau-tu', 'CCQ'),
  ('tich-tru', 'USD'), ('tich-tru', 'Vàng'), ('tich-tru', 'BĐS'),
  ('cho-vay',  'Cho vay nóng'), ('cho-vay', 'Cho vay lâu dài'),
  ('di-vay',   'Trả góp'), ('di-vay', 'Vay nóng'), ('di-vay', 'Vay lâu dài'),
  ('tien-gui', 'TG cố định'), ('tien-gui', 'TG linh hoạt'),
  ('bank',     'TK tự do'), ('bank', 'TK dài tháng'), ('bank', 'TK ít tháng');

-- Default platforms
INSERT INTO platforms (name) VALUES
  ('Topi'), ('Sstock'), ('TCB'), ('BIDV'), ('VCB'),
  ('ACB'), ('MB'), ('VPB'), ('VIB'), ('TPB');
```

---

## Phase 2 — Pages Functions API Endpoints

**Estimated effort: ~2h**

### New endpoints vs previous plan

| Method | Path | Description |
|---|---|---|
| GET | `/api/dashboard` | KPIs + group breakdown + member breakdown (computed values) |
| GET | `/api/assets` | Filtered list: `?group=`, `?member=`, `?q=`, `?subtype=` |
| POST | `/api/assets` | Create asset |
| PUT | `/api/assets/[id]` | Update asset (price, full row) — reused by future Worker |
| DELETE | `/api/assets/[id]` | Soft delete |
| GET/POST | `/api/transactions` | List / create transactions |
| GET/POST | `/api/members` | List / create members |
| GET/POST/DELETE | `/api/groups` | List / create / deactivate groups |
| GET/POST/DELETE | `/api/groups/[id]/subtypes` | Manage subtypes per group |
| **GET/POST/DELETE** | **`/api/platforms`** | **List / add / remove savings platforms** |
| POST | `/api/seed` | Idempotent init — inserts defaults if DB is empty |

### Dashboard query structure

```sql
SELECT
  g.name AS group_name,
  g.icon,
  g.type,
  COUNT(a.id) AS asset_count,
  SUM(a.qty * a.current_price) AS total_value,
  SUM(a.qty * a.current_price - a.qty * a.cost_price) AS total_pl
FROM asset_groups g
LEFT JOIN assets a ON a.group_id = g.id AND a.status = 'active'
WHERE g.active = 1
GROUP BY g.id
ORDER BY g.sort_order;
```

---

## Phase 3 — Frontend Changes

**Estimated effort: ~4h**

### 3a. `api.js` — fetch wrapper

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
  get:  (path)       => request('GET',    path),
  post: (path, body) => request('POST',   path, body),
  put:  (path, body) => request('PUT',    path, body),
  del:  (path)       => request('DELETE', path),
};
```

### 3b. Per-group form renderer

Instead of one shared modal with conditional `display:none` fields, each group renders its own dedicated form template. The group selector is shown **outside** the form — selecting a group destroys the current form and mounts the correct one.

```js
const GROUP_FORMS = {
  'dau-tu':   renderDauTuForm,
  'tich-tru': renderTichTruForm,
  'cho-vay':  renderChoVayForm,
  'di-vay':   renderDiVayForm,
  'tien-gui': renderTienGuiForm,
  'bank':     renderBankForm,
};

function onGroupChange(groupId) {
  const subtypes = await api.get('/groups/' + groupId + '/subtypes');
  const platforms = groupId === 'tien-gui' ? await api.get('/platforms') : null;
  document.getElementById('form-body').innerHTML =
    GROUP_FORMS[groupId](subtypes, platforms);
}
```

### 3c. Bank searchable select (Bank group)

```html
<div class="bank-select-wrap">
  <input id="bank_search"
    placeholder="Tìm ngân hàng (VD: TCB, Techcombank, Kỹ Thương...)"
    oninput="filterBanks(this.value)" autocomplete="off"/>
  <div id="bank_results" role="listbox"></div>
  <input type="hidden" id="a_bank_abbr"/>   <!-- stored value: 'TCB' -->
  <input type="hidden" id="a_bank_display"/><!-- display value: full name -->
</div>
```

```js
// Accent-insensitive search across abbr + short name + full name
function filterBanks(q) {
  const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
  const results = BANKS.filter(b =>
    [b.abbr, b.short, b.full].some(s => norm(s).includes(norm(q)))
  );
  renderBankResults(results);  // show "TCB — Ngân hàng TMCP Kỹ Thương..." rows
}

function selectBank(bank) {
  document.getElementById('bank_search').value   = `${bank.abbr} — ${bank.full}`;
  document.getElementById('a_bank_abbr').value   = bank.abbr;
  document.getElementById('a_bank_display').value = bank.full;
  document.getElementById('bank_results').innerHTML = '';
}
```

### 3d. Platform selector (Tiền gửi group)

Platforms are user-managed (add/remove in Settings), loaded from D1 at form open time.

```js
async function renderTienGuiForm(subtypes, platforms) {
  const platformOptions = platforms.map(p =>
    `<option value="${p.name}">${p.name}</option>`
  ).join('');
  // render form with platform <select> + kỳ hạn + ngày đáo hạn
}
```

Auto-calculate ngày đáo hạn when both ngày gửi and kỳ hạn are selected:
```js
function calcMaturity() {
  const start = new Date(document.getElementById('t_start').value);
  const term  = document.getElementById('t_term').value; // '1 tháng', '6 tháng', etc.
  if (!start || !term) return;
  const months = { '1 tháng':1,'3 tháng':3,'6 tháng':6,'1 năm':12 }[term];
  if (months) {
    start.setMonth(start.getMonth() + months);
    document.getElementById('t_maturity').value = start.toISOString().split('T')[0];
  }
}
```

### 3e. Platform management (Settings page)

```
Settings → Nền tảng tiền gửi
[ Topi ✕ ]  [ Sstock ✕ ]  [ Techcombank ✕ ]  [ + Thêm nền tảng ]
```

Calls `POST /api/platforms` and `DELETE /api/platforms/:id`.

### 3f. Replace all `google.script.run` calls

Mechanical find-and-replace across ~12 call sites — same pattern as previous plan.

---

## Phase 4 — Cloudflare Deploy Config

**Estimated effort: ~30min** (unchanged)

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

### Deploy commands

```bash
npx wrangler d1 create finance-db
npx wrangler d1 execute finance-db --file=schema.sql
npx wrangler d1 execute finance-db --file=seed.sql
npm run build
npx wrangler pages deploy dist
```

### Optional: Cloudflare Access

Enable in the Cloudflare dashboard — **no code changes**. Supports Google SSO, email OTP, GitHub OAuth.

---

## Phase 5 — Future: Cloudflare Worker Price Sync

**No frontend changes required.** Worker reuses `PUT /api/assets/[id]`.

### Supported price sources (Vietnamese market)

| Asset subtype | Source |
|---|---|
| Cổ phiếu (VN stocks) | SSI iBoard API or VNDIRECT API |
| CCQ (mutual funds) | TCBS API |
| Coin/Crypto | CoinGecko public API (free tier) |
| USD/VND rate | State Bank of Vietnam (SBV) XML feed |
| Vàng (gold) | SJC website or Bảo Tín Minh Châu API |

### `wrangler.toml` addition

```toml
[triggers]
crons = ["*/15 2-8 * * 1-5"]  # every 15min, 9:00–15:00 ICT, weekdays
```

---

## Changes vs Previous Plan

| Area | Previous | Updated |
|---|---|---|
| Groups | 6 groups incl. "Tiền mặt/Bank" | 6 groups — matches spreadsheet exactly |
| Subtypes | Hardcoded in JS `GROUP_SUBS` object | Loaded from D1 `asset_subtypes` table — fully dynamic |
| Cho vay | Single "Cho vay" group | **Cho vay** (Asset) + **Đi vay** (Liability) — two separate groups |
| Đi vay subtypes | — | Trả góp, Vay nóng, Vay lâu dài |
| Tiền gửi fields | Only kỳ hạn + ngày đáo hạn | + **Platform selector** (Topi, Sstock, TCB…) — add/remove in settings |
| Bank field | None | **Searchable bank select** (abbr + full name fuzzy search) |
| New API | — | `GET/POST/DELETE /api/platforms` |
| New API | — | `GET/POST/DELETE /api/groups/[id]/subtypes` |
| Bank data | abbr + short name | abbr + short name + **full official name** — search across all 3, accent-insensitive |
| Bank display | Abbreviation | `TCB — Ngân hàng TMCP Kỹ Thương Việt Nam (Techcombank)` |
| Add Asset modal | One shared modal, conditional show/hide fields | **Per-group dedicated form** — group selector swaps entire form |
| New component | — | `bank-select.js` — 3-field accent-insensitive searchable dropdown |
| New page | — | Settings page for platform management |
| Effort estimate | ~5.5h | ~8h |

---

## Implementation Order

```
Phase 1 (schema + seed)
    ↓
Phase 2 (API functions)
    ↓
Phase 3a–b (api.js + dynamic subtypes)   ← unblocks basic CRUD
    ↓
Phase 3c–e (conditional fields + bank select + platform settings)
    ↓
Phase 4 (deploy)
    ↓
Phase 5 (future: Worker price sync)
```