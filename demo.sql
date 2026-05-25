-- demo.sql — Finance Manager demo seed
-- Phủ toàn bộ các trường hợp hiển thị của src/pages/assets.js
-- Ngày tham chiếu cho maturity chip: 2026-05-19
-- Chạy sau schema.sql (giả sử bảng trống).

PRAGMA foreign_keys = ON;

-- ── Members (member_id: 1=Chồng  2=Vợ  3=Chung) ────────────────────────────
INSERT INTO members (name, color) VALUES
  ('Chồng', '#3b82f6'),
  ('Vợ',    '#ec4899'),
  ('Chung',  '#8b5cf6');

-- ── Platforms ────────────────────────────────────────────────────────────────
INSERT INTO platforms (name) VALUES
  ('Topi'), ('Viettel Money'), ('Zalopay'), ('Momo');

-- ═══════════════════════════════════════════════════════════════════════════
-- GROUP: dau-tu / Đầu tư
-- Hiển thị: qty + unit; value/pnl = qty × (current−cost); cost dòng phụ khi ≠ value
-- ═══════════════════════════════════════════════════════════════════════════

-- co-phieu: pnl dương, cost hiển thị dòng phụ, member chip Chồng (xanh)
INSERT INTO assets (name, group_id, subtype, member_id, qty, unit, cost_price, current_price, ticker, status, created_at, updated_at)
VALUES ('VNM', 'dau-tu', 'co-phieu', 1, 1000, 'cp', 89000, 95000, 'VNM', 'active', datetime('now'), datetime('now'));

-- co-phieu: pnl âm, member chip Vợ (hồng)
INSERT INTO assets (name, group_id, subtype, member_id, qty, unit, cost_price, current_price, ticker, status, created_at, updated_at)
VALUES ('FPT', 'dau-tu', 'co-phieu', 2, 500, 'cp', 120000, 110000, 'FPT', 'active', datetime('now'), datetime('now'));

-- coin: giá trị lớn; notes có __src prefix → hiển thị "source:COINGECKO · Đầu tư dài hạn"; member Chung
INSERT INTO assets (name, group_id, subtype, member_id, qty, unit, cost_price, current_price, ticker, notes, status, created_at, updated_at)
VALUES ('Bitcoin', 'dau-tu', 'coin', 3, 0.5, 'BTC', 2000000000, 2500000000, 'bitcoin',
        '__src:coingecko:bitcoin|Đầu tư dài hạn', 'active', datetime('now'), datetime('now'));

-- coin: pnl âm, không member
INSERT INTO assets (name, group_id, subtype, member_id, qty, unit, cost_price, current_price, ticker, status, created_at, updated_at)
VALUES ('Ethereum', 'dau-tu', 'coin', NULL, 2, 'ETH', 60000000, 55000000, 'ethereum', 'active', datetime('now'), datetime('now'));

-- coin: notes thường (không __src), pnl dương
INSERT INTO assets (name, group_id, subtype, member_id, qty, unit, cost_price, current_price, ticker, notes, status, created_at, updated_at)
VALUES ('XRP', 'dau-tu', 'coin', NULL, 5000, 'XRP', 15000, 18000, 'XRP',
        'Giao dịch ngắn hạn', 'active', datetime('now'), datetime('now'));

-- trai-phieu: bond field (maturity_date) hiện; diffDays=730 → không có chip, chỉ hiện "Đáo hạn: 2028-05-19"
INSERT INTO assets (name, group_id, subtype, member_id, qty, unit, cost_price, current_price, maturity_date, status, created_at, updated_at)
VALUES ('Trái phiếu VHM', 'dau-tu', 'trai-phieu', 1, 10, 'trái phiếu', 100000000, 102000000,
        '2028-05-19', 'active', datetime('now'), datetime('now'));

-- ccq: không member, pnl dương
INSERT INTO assets (name, group_id, subtype, member_id, qty, unit, cost_price, current_price, ticker, status, created_at, updated_at)
VALUES ('VESAF', 'dau-tu', 'ccq', NULL, 1000, 'CCQ', 25000, 28000, 'VESAF', 'active', datetime('now'), datetime('now'));

-- KHÔNG CÓ subtype: subtype_name=''; grouped view → không hiện div ar-type; flat view → chỉ hiện "📈 Đầu tư"
INSERT INTO assets (name, group_id, subtype, member_id, qty, unit, cost_price, current_price, status, created_at, updated_at)
VALUES ('USDT', 'dau-tu', NULL, NULL, 10000, 'USDT', 24000, 24500, 'active', datetime('now'), datetime('now'));

-- ═══════════════════════════════════════════════════════════════════════════
-- GROUP: tich-tru / Tích trữ
-- tich-tru/bds → ALWAYS_ILLIQUID → badge "Chưa khả dụng"
-- ═══════════════════════════════════════════════════════════════════════════

-- usd: unit=USD, member Vợ
INSERT INTO assets (name, group_id, subtype, member_id, qty, unit, cost_price, current_price, status, created_at, updated_at)
VALUES ('USD dự phòng', 'tich-tru', 'usd', 2, 5000, 'USD', 24000, 25500, 'active', datetime('now'), datetime('now'));

-- vang: unit=lượng, member Chồng
INSERT INTO assets (name, group_id, subtype, member_id, qty, unit, cost_price, current_price, status, created_at, updated_at)
VALUES ('Vàng SJC', 'tich-tru', 'vang', 1, 5, 'lượng', 85000000, 91000000, 'active', datetime('now'), datetime('now'));

-- bds: ALWAYS_ILLIQUID (isLiquid=false bất kể maturity), unit=m², member Chung
INSERT INTO assets (name, group_id, subtype, member_id, qty, unit, cost_price, current_price, status, created_at, updated_at)
VALUES ('Đất Hà Đông', 'tich-tru', 'bds', 3, 100, 'm²', 15000000, 20000000, 'active', datetime('now'), datetime('now'));

-- ═══════════════════════════════════════════════════════════════════════════
-- GROUP: cho-vay / Cho vay
-- qty + unit ẩn trong row; pnl = lãi forward-looking (computeLoanInterest)
-- pnl=null khi interest_rate IS NULL → ar-pnl không có class màu
-- cho-vay/cho-vay-lau-dai → ALWAYS_ILLIQUID
-- ═══════════════════════════════════════════════════════════════════════════

-- cho-vay-nong: liquid, pnl dương, interest_rate + maturity_date hiện trong subInfoLine
INSERT INTO assets (name, group_id, subtype, member_id, qty, unit, cost_price, current_price,
                    interest_rate, start_date, maturity_date, status, created_at, updated_at)
VALUES ('Cho vay Phước', 'cho-vay', 'cho-vay-nong', 1, 1, 'VND', 50000000, 50000000,
        15, '2026-03-01', '2026-06-01', 'active', datetime('now'), datetime('now'));

-- cho-vay-lau-dai: ALWAYS_ILLIQUID, current_price < cost_price (đã thu một phần)
INSERT INTO assets (name, group_id, subtype, member_id, qty, unit, cost_price, current_price,
                    interest_rate, start_date, maturity_date, status, created_at, updated_at)
VALUES ('Cho vay anh Sơn', 'cho-vay', 'cho-vay-lau-dai', NULL, 1, 'VND', 200000000, 150000000,
        8, '2025-01-01', '2027-01-01', 'active', datetime('now'), datetime('now'));

-- cho-vay-nong: pnl=null (interest_rate IS NULL → computeLoanInterest trả null); subInfoLine trống
INSERT INTO assets (name, group_id, subtype, member_id, qty, unit, cost_price, current_price, status, created_at, updated_at)
VALUES ('Bạn mượn tiền chữa bệnh', 'cho-vay', 'cho-vay-nong', 2, 1, 'VND', 10000000, 10000000, 'active', datetime('now'), datetime('now'));

-- ═══════════════════════════════════════════════════════════════════════════
-- GROUP: di-vay / Đi vay  (group_type='Liability')
-- isLiquid luôn false → badge "Chưa khả dụng"
-- pnl = −lãi (âm); được tính vào totalLiability → summary bar hiện "Tài sản ròng"
-- ═══════════════════════════════════════════════════════════════════════════

-- tra-gop: pnl âm, member Vợ
INSERT INTO assets (name, group_id, subtype, member_id, qty, unit, cost_price, current_price,
                    interest_rate, start_date, maturity_date, status, created_at, updated_at)
VALUES ('Vay xe TCB', 'di-vay', 'tra-gop', 2, 1, 'VND', 500000000, 350000000,
        9.5, '2024-06-01', '2027-06-01', 'active', datetime('now'), datetime('now'));

-- vay-lau-dai: khoản nợ lớn, không member
INSERT INTO assets (name, group_id, subtype, member_id, qty, unit, cost_price, current_price,
                    interest_rate, start_date, maturity_date, status, created_at, updated_at)
VALUES ('Vay mua nhà VCB', 'di-vay', 'vay-lau-dai', NULL, 1, 'VND', 2000000000, 1800000000,
        7.5, '2023-01-01', '2033-01-01', 'active', datetime('now'), datetime('now'));

-- vay-nong: pnl=null (interest_rate IS NULL), subInfoLine trống
INSERT INTO assets (name, group_id, subtype, member_id, qty, unit, cost_price, current_price, status, created_at, updated_at)
VALUES ('Mượn anh A', 'di-vay', 'vay-nong', 1, 1, 'VND', 20000000, 20000000, 'active', datetime('now'), datetime('now'));

-- ═══════════════════════════════════════════════════════════════════════════
-- GROUP: tien-gui / Tiền gửi
-- qty + unit ẩn; platform hiện trong subInfoLine
-- pnl = lãi tích lũy: cost_price × rate × years × (1 − tax)
-- tien-gui/tg-co-dinh → MATURITY_ILLIQUID: illiquid khi daysLeft > 30
--
-- Bảng phủ maturity chip (ref 2026-05-19):
--   mat > 30d:  illiquid, không chip (chỉ hiện "Đáo hạn: DATE")
--   0 < mat ≤ 30d: liquid, không chip
--   mat ≤ 3d:   liquid, badge warn "Sắp đáo hạn: Nd"
--   mat = 0d:   liquid, badge pos  "Đáo hạn hôm nay"
--   mat < 0d:   liquid, badge neg  "Quá hạn: Nd"
-- ═══════════════════════════════════════════════════════════════════════════

-- tg-co-dinh: illiquid (mat 2026-07-01 = 43d > 30); platform + term + rate trong subInfoLine; không chip
INSERT INTO assets (name, group_id, subtype, member_id, qty, unit, cost_price, current_price,
                    platform, interest_rate, interest_tax_rate, start_date, maturity_date, term,
                    status, created_at, updated_at)
VALUES ('TG TCB 6 tháng', 'tien-gui', 'tg-co-dinh', 1, 1, 'VND', 300000000, 300000000,
        'Topi', 5.5, 5, '2026-01-01', '2026-07-01', '6', 'active', datetime('now'), datetime('now'));

-- tg-linh-hoat: liquid (không maturity_date); platform Momo
INSERT INTO assets (name, group_id, subtype, member_id, qty, unit, cost_price, current_price,
                    platform, interest_rate, interest_tax_rate, start_date,
                    status, created_at, updated_at)
VALUES ('TG linh hoạt', 'tien-gui', 'tg-linh-hoat', NULL, 1, 'VND', 100000000, 100000000,
        'Momo', 4.0, 5, '2026-01-01', 'active', datetime('now'), datetime('now'));

-- tg-co-dinh QUÁ HẠN: mat 2026-05-10 (9d trước) → badge neg "Quá hạn: 9 ngày"; liquid (daysLeft<0 ≤ 30)
INSERT INTO assets (name, group_id, subtype, member_id, qty, unit, cost_price, current_price,
                    interest_rate, interest_tax_rate, start_date, maturity_date, term,
                    status, created_at, updated_at)
VALUES ('TG BIDV đã đáo hạn', 'tien-gui', 'tg-co-dinh', 2, 1, 'VND', 50000000, 50000000,
        5.5, 5, '2025-11-10', '2026-05-10', '6', 'active', datetime('now'), datetime('now'));

-- tg-co-dinh HÔM NAY: mat 2026-05-19 (daysLeft=0) → badge pos "Đáo hạn hôm nay"; liquid
INSERT INTO assets (name, group_id, subtype, member_id, qty, unit, cost_price, current_price,
                    interest_rate, interest_tax_rate, start_date, maturity_date, term,
                    status, created_at, updated_at)
VALUES ('TG ACB đáo hạn hôm nay', 'tien-gui', 'tg-co-dinh', NULL, 1, 'VND', 80000000, 80000000,
        6.0, 5, '2025-11-19', '2026-05-19', '6', 'active', datetime('now'), datetime('now'));

-- tg-co-dinh SẮP ĐÁO HẠN: mat 2026-05-21 (daysLeft=2 ≤ 3) → badge warn "Sắp đáo hạn: 2 ngày"; liquid
INSERT INTO assets (name, group_id, subtype, member_id, qty, unit, cost_price, current_price,
                    platform, interest_rate, interest_tax_rate, start_date, maturity_date, term,
                    status, created_at, updated_at)
VALUES ('TG Zalopay sắp đáo hạn', 'tien-gui', 'tg-co-dinh', 3, 1, 'VND', 100000000, 100000000,
        'Zalopay', 5.8, 5, '2025-11-21', '2026-05-21', '6', 'active', datetime('now'), datetime('now'));

-- ═══════════════════════════════════════════════════════════════════════════
-- GROUP: bank / Bank
-- qty + unit ẩn; bank field → formatBank() trong subInfoLine: "TCB — Techcombank"
-- notes dùng làm số tài khoản → hiện như note thường trong subInfoLine
-- bank/so-tiet-kiem → MATURITY_ILLIQUID (cùng quy tắc 30d như tg-co-dinh)
-- ═══════════════════════════════════════════════════════════════════════════

-- tk-tu-do: liquid; bank=TCB → "TCB — Techcombank"; notes=số TK;
--   pnl = 25tr × 0.1% × ~6.4 năm ≈ 160k → cost ≠ value → cost hiện dòng phụ
INSERT INTO assets (name, group_id, subtype, member_id, qty, unit, cost_price, current_price,
                    bank, interest_rate, start_date, notes, status, created_at, updated_at)
VALUES ('Lương TCB', 'bank', 'tk-tu-do', 1, 1, 'VND', 0, 25000000,
        'TCB', 0.1, '2020-01-01', '19001234567', 'active', datetime('now'), datetime('now'));

-- so-tiet-kiem: MATURITY_ILLIQUID (mat 2026-08-01 = 74d > 30); bank=VCB; term + rate trong subInfoLine; không chip
INSERT INTO assets (name, group_id, subtype, member_id, qty, unit, cost_price, current_price,
                    bank, interest_rate, interest_tax_rate, start_date, maturity_date, term, notes,
                    status, created_at, updated_at)
VALUES ('Sổ TK VCB 6 tháng', 'bank', 'so-tiet-kiem', 2, 1, 'VND', 100000000, 100000000,
        'VCB', 6.0, 5, '2026-02-01', '2026-08-01', '6', '1234567890',
        'active', datetime('now'), datetime('now'));

-- tk-tu-do: không member; không interest_rate/start_date → pnl=0, cost=value → cost KHÔNG hiện dòng phụ
--   subInfoLine: chỉ "MB — MB Bank"
INSERT INTO assets (name, group_id, subtype, member_id, qty, unit, cost_price, current_price,
                    bank, status, created_at, updated_at)
VALUES ('MB Bank', 'bank', 'tk-tu-do', NULL, 1, 'VND', 0, 5000000,
        'MB', 'active', datetime('now'), datetime('now'));



-- ═══════════════════════════════════════════════════════════════════════════
-- ASSET SNAPSHOTS — 1 year of history for the growth chart.
-- Older months (May 2025 → Feb 2026): 1 snapshot per month (end-of-month).
-- Recent 3 months: weekly snapshots ending 2026-05-25 (≈ current asset totals).
-- Generated to mirror the live (group, subtype) buckets above.
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO asset_snapshots (recorded_at, snapshot_date, group_id, subtype, value, cost, asset_count) VALUES
  ('2025-05-31T17:00:00.000Z', '2025-05-31', 'dau-tu', 'co-phieu', 75000000, 77480000, 2),
  ('2025-05-31T17:00:00.000Z', '2025-05-31', 'dau-tu', 'coin', 725000000, 621400000, 3),
  ('2025-05-31T17:00:00.000Z', '2025-05-31', 'dau-tu', 'trai-phieu', 510000000, 520000000, 1),
  ('2025-05-31T17:00:00.000Z', '2025-05-31', 'dau-tu', 'ccq', 14000000, 13000000, 1),
  ('2025-05-31T17:00:00.000Z', '2025-05-31', 'dau-tu', NULL, 122500000, 124800000, 1),
  ('2025-05-31T17:00:00.000Z', '2025-05-31', 'tich-tru', 'usd', 63750000, 62400000, 1),
  ('2025-05-31T17:00:00.000Z', '2025-05-31', 'tich-tru', 'vang', 227500000, 221000000, 1),
  ('2025-05-31T17:00:00.000Z', '2025-05-31', 'tich-tru', 'bds', 1000000000, 780000000, 1),
  ('2025-05-31T17:00:00.000Z', '2025-05-31', 'cho-vay', 'cho-vay-nong', 30000000, 31200000, 2),
  ('2025-05-31T17:00:00.000Z', '2025-05-31', 'cho-vay', 'cho-vay-lau-dai', 75000000, 78000000, 1),
  ('2025-05-31T17:00:00.000Z', '2025-05-31', 'di-vay', 'tra-gop', 472500000, 472500000, 1),
  ('2025-05-31T17:00:00.000Z', '2025-05-31', 'di-vay', 'vay-lau-dai', 2430000000, 2430000000, 1),
  ('2025-05-31T17:00:00.000Z', '2025-05-31', 'di-vay', 'vay-nong', 27000000, 27000000, 1),
  ('2025-05-31T17:00:00.000Z', '2025-05-31', 'tien-gui', 'tg-co-dinh', 270000000, 275600000, 4),
  ('2025-05-31T17:00:00.000Z', '2025-05-31', 'tien-gui', 'tg-linh-hoat', 51000000, 52000000, 1),
  ('2025-05-31T17:00:00.000Z', '2025-05-31', 'bank', 'tk-tu-do', 15000000, 15600000, 2),
  ('2025-05-31T17:00:00.000Z', '2025-05-31', 'bank', 'so-tiet-kiem', 50000000, 52000000, 1);

INSERT INTO asset_snapshots (recorded_at, snapshot_date, group_id, subtype, value, cost, asset_count) VALUES
  ('2025-06-30T17:00:00.000Z', '2025-06-30', 'dau-tu', 'co-phieu', 82500000, 84930000, 2),
  ('2025-06-30T17:00:00.000Z', '2025-06-30', 'dau-tu', 'coin', 797500000, 681150000, 3),
  ('2025-06-30T17:00:00.000Z', '2025-06-30', 'dau-tu', 'trai-phieu', 561000000, 570000000, 1),
  ('2025-06-30T17:00:00.000Z', '2025-06-30', 'dau-tu', 'ccq', 15400000, 14250000, 1),
  ('2025-06-30T17:00:00.000Z', '2025-06-30', 'dau-tu', NULL, 134750000, 136800000, 1),
  ('2025-06-30T17:00:00.000Z', '2025-06-30', 'tich-tru', 'usd', 70125000, 68400000, 1),
  ('2025-06-30T17:00:00.000Z', '2025-06-30', 'tich-tru', 'vang', 250250000, 242250000, 1),
  ('2025-06-30T17:00:00.000Z', '2025-06-30', 'tich-tru', 'bds', 1100000000, 855000000, 1),
  ('2025-06-30T17:00:00.000Z', '2025-06-30', 'cho-vay', 'cho-vay-nong', 33000000, 34200000, 2),
  ('2025-06-30T17:00:00.000Z', '2025-06-30', 'cho-vay', 'cho-vay-lau-dai', 82500000, 85500000, 1),
  ('2025-06-30T17:00:00.000Z', '2025-06-30', 'di-vay', 'tra-gop', 462000000, 462000000, 1),
  ('2025-06-30T17:00:00.000Z', '2025-06-30', 'di-vay', 'vay-lau-dai', 2376000000, 2376000000, 1),
  ('2025-06-30T17:00:00.000Z', '2025-06-30', 'di-vay', 'vay-nong', 26400000, 26400000, 1),
  ('2025-06-30T17:00:00.000Z', '2025-06-30', 'tien-gui', 'tg-co-dinh', 297000000, 302100000, 4),
  ('2025-06-30T17:00:00.000Z', '2025-06-30', 'tien-gui', 'tg-linh-hoat', 56100000, 57000000, 1),
  ('2025-06-30T17:00:00.000Z', '2025-06-30', 'bank', 'tk-tu-do', 16500000, 17100000, 2),
  ('2025-06-30T17:00:00.000Z', '2025-06-30', 'bank', 'so-tiet-kiem', 55000000, 57000000, 1);

INSERT INTO asset_snapshots (recorded_at, snapshot_date, group_id, subtype, value, cost, asset_count) VALUES
  ('2025-07-31T17:00:00.000Z', '2025-07-31', 'dau-tu', 'co-phieu', 90000000, 92380000, 2),
  ('2025-07-31T17:00:00.000Z', '2025-07-31', 'dau-tu', 'coin', 870000000, 740900000, 3),
  ('2025-07-31T17:00:00.000Z', '2025-07-31', 'dau-tu', 'trai-phieu', 612000000, 620000000, 1),
  ('2025-07-31T17:00:00.000Z', '2025-07-31', 'dau-tu', 'ccq', 16800000, 15500000, 1),
  ('2025-07-31T17:00:00.000Z', '2025-07-31', 'dau-tu', NULL, 147000000, 148800000, 1),
  ('2025-07-31T17:00:00.000Z', '2025-07-31', 'tich-tru', 'usd', 76500000, 74400000, 1),
  ('2025-07-31T17:00:00.000Z', '2025-07-31', 'tich-tru', 'vang', 273000000, 263500000, 1),
  ('2025-07-31T17:00:00.000Z', '2025-07-31', 'tich-tru', 'bds', 1200000000, 930000000, 1),
  ('2025-07-31T17:00:00.000Z', '2025-07-31', 'cho-vay', 'cho-vay-nong', 36000000, 37200000, 2),
  ('2025-07-31T17:00:00.000Z', '2025-07-31', 'cho-vay', 'cho-vay-lau-dai', 90000000, 93000000, 1),
  ('2025-07-31T17:00:00.000Z', '2025-07-31', 'di-vay', 'tra-gop', 451500000, 451500000, 1),
  ('2025-07-31T17:00:00.000Z', '2025-07-31', 'di-vay', 'vay-lau-dai', 2322000000, 2322000000, 1),
  ('2025-07-31T17:00:00.000Z', '2025-07-31', 'di-vay', 'vay-nong', 25800000, 25800000, 1),
  ('2025-07-31T17:00:00.000Z', '2025-07-31', 'tien-gui', 'tg-co-dinh', 324000000, 328600000, 4),
  ('2025-07-31T17:00:00.000Z', '2025-07-31', 'tien-gui', 'tg-linh-hoat', 61200000, 62000000, 1),
  ('2025-07-31T17:00:00.000Z', '2025-07-31', 'bank', 'tk-tu-do', 18000000, 18600000, 2),
  ('2025-07-31T17:00:00.000Z', '2025-07-31', 'bank', 'so-tiet-kiem', 60000000, 62000000, 1);

INSERT INTO asset_snapshots (recorded_at, snapshot_date, group_id, subtype, value, cost, asset_count) VALUES
  ('2025-08-31T17:00:00.000Z', '2025-08-31', 'dau-tu', 'co-phieu', 96000000, 98340000, 2),
  ('2025-08-31T17:00:00.000Z', '2025-08-31', 'dau-tu', 'coin', 928000000, 788700000, 3),
  ('2025-08-31T17:00:00.000Z', '2025-08-31', 'dau-tu', 'trai-phieu', 652800000, 660000000, 1),
  ('2025-08-31T17:00:00.000Z', '2025-08-31', 'dau-tu', 'ccq', 17920000, 16500000, 1),
  ('2025-08-31T17:00:00.000Z', '2025-08-31', 'dau-tu', NULL, 156800000, 158400000, 1),
  ('2025-08-31T17:00:00.000Z', '2025-08-31', 'tich-tru', 'usd', 81600000, 79200000, 1),
  ('2025-08-31T17:00:00.000Z', '2025-08-31', 'tich-tru', 'vang', 291200000, 280500000, 1),
  ('2025-08-31T17:00:00.000Z', '2025-08-31', 'tich-tru', 'bds', 1280000000, 990000000, 1),
  ('2025-08-31T17:00:00.000Z', '2025-08-31', 'cho-vay', 'cho-vay-nong', 38400000, 39600000, 2),
  ('2025-08-31T17:00:00.000Z', '2025-08-31', 'cho-vay', 'cho-vay-lau-dai', 96000000, 99000000, 1),
  ('2025-08-31T17:00:00.000Z', '2025-08-31', 'di-vay', 'tra-gop', 441000000, 441000000, 1),
  ('2025-08-31T17:00:00.000Z', '2025-08-31', 'di-vay', 'vay-lau-dai', 2268000000, 2268000000, 1),
  ('2025-08-31T17:00:00.000Z', '2025-08-31', 'di-vay', 'vay-nong', 25200000, 25200000, 1),
  ('2025-08-31T17:00:00.000Z', '2025-08-31', 'tien-gui', 'tg-co-dinh', 345600000, 349800000, 4),
  ('2025-08-31T17:00:00.000Z', '2025-08-31', 'tien-gui', 'tg-linh-hoat', 65280000, 66000000, 1),
  ('2025-08-31T17:00:00.000Z', '2025-08-31', 'bank', 'tk-tu-do', 19200000, 19800000, 2),
  ('2025-08-31T17:00:00.000Z', '2025-08-31', 'bank', 'so-tiet-kiem', 64000000, 66000000, 1);

INSERT INTO asset_snapshots (recorded_at, snapshot_date, group_id, subtype, value, cost, asset_count) VALUES
  ('2025-09-30T17:00:00.000Z', '2025-09-30', 'dau-tu', 'co-phieu', 102000000, 104300000, 2),
  ('2025-09-30T17:00:00.000Z', '2025-09-30', 'dau-tu', 'coin', 986000000, 836500000, 3),
  ('2025-09-30T17:00:00.000Z', '2025-09-30', 'dau-tu', 'trai-phieu', 693600000, 700000000, 1),
  ('2025-09-30T17:00:00.000Z', '2025-09-30', 'dau-tu', 'ccq', 19040000, 17500000, 1),
  ('2025-09-30T17:00:00.000Z', '2025-09-30', 'dau-tu', NULL, 166600000, 168000000, 1),
  ('2025-09-30T17:00:00.000Z', '2025-09-30', 'tich-tru', 'usd', 86700000, 84000000, 1),
  ('2025-09-30T17:00:00.000Z', '2025-09-30', 'tich-tru', 'vang', 309400000, 297500000, 1),
  ('2025-09-30T17:00:00.000Z', '2025-09-30', 'tich-tru', 'bds', 1360000000, 1050000000, 1),
  ('2025-09-30T17:00:00.000Z', '2025-09-30', 'cho-vay', 'cho-vay-nong', 40800000, 42000000, 2),
  ('2025-09-30T17:00:00.000Z', '2025-09-30', 'cho-vay', 'cho-vay-lau-dai', 102000000, 105000000, 1),
  ('2025-09-30T17:00:00.000Z', '2025-09-30', 'di-vay', 'tra-gop', 430500000, 430500000, 1),
  ('2025-09-30T17:00:00.000Z', '2025-09-30', 'di-vay', 'vay-lau-dai', 2214000000, 2214000000, 1),
  ('2025-09-30T17:00:00.000Z', '2025-09-30', 'di-vay', 'vay-nong', 24600000, 24600000, 1),
  ('2025-09-30T17:00:00.000Z', '2025-09-30', 'tien-gui', 'tg-co-dinh', 367200000, 371000000, 4),
  ('2025-09-30T17:00:00.000Z', '2025-09-30', 'tien-gui', 'tg-linh-hoat', 69360000, 70000000, 1),
  ('2025-09-30T17:00:00.000Z', '2025-09-30', 'bank', 'tk-tu-do', 20400000, 21000000, 2),
  ('2025-09-30T17:00:00.000Z', '2025-09-30', 'bank', 'so-tiet-kiem', 68000000, 70000000, 1);

INSERT INTO asset_snapshots (recorded_at, snapshot_date, group_id, subtype, value, cost, asset_count) VALUES
  ('2025-10-31T17:00:00.000Z', '2025-10-31', 'dau-tu', 'co-phieu', 106500000, 108770000, 2),
  ('2025-10-31T17:00:00.000Z', '2025-10-31', 'dau-tu', 'coin', 1029500000, 872350000, 3),
  ('2025-10-31T17:00:00.000Z', '2025-10-31', 'dau-tu', 'trai-phieu', 724200000, 730000000, 1),
  ('2025-10-31T17:00:00.000Z', '2025-10-31', 'dau-tu', 'ccq', 19880000, 18250000, 1),
  ('2025-10-31T17:00:00.000Z', '2025-10-31', 'dau-tu', NULL, 173950000, 175200000, 1),
  ('2025-10-31T17:00:00.000Z', '2025-10-31', 'tich-tru', 'usd', 90525000, 87600000, 1),
  ('2025-10-31T17:00:00.000Z', '2025-10-31', 'tich-tru', 'vang', 323050000, 310250000, 1),
  ('2025-10-31T17:00:00.000Z', '2025-10-31', 'tich-tru', 'bds', 1420000000, 1095000000, 1),
  ('2025-10-31T17:00:00.000Z', '2025-10-31', 'cho-vay', 'cho-vay-nong', 42600000, 43800000, 2),
  ('2025-10-31T17:00:00.000Z', '2025-10-31', 'cho-vay', 'cho-vay-lau-dai', 106500000, 109500000, 1),
  ('2025-10-31T17:00:00.000Z', '2025-10-31', 'di-vay', 'tra-gop', 420000000, 420000000, 1),
  ('2025-10-31T17:00:00.000Z', '2025-10-31', 'di-vay', 'vay-lau-dai', 2160000000, 2160000000, 1),
  ('2025-10-31T17:00:00.000Z', '2025-10-31', 'di-vay', 'vay-nong', 24000000, 24000000, 1),
  ('2025-10-31T17:00:00.000Z', '2025-10-31', 'tien-gui', 'tg-co-dinh', 383400000, 386900000, 4),
  ('2025-10-31T17:00:00.000Z', '2025-10-31', 'tien-gui', 'tg-linh-hoat', 72420000, 73000000, 1),
  ('2025-10-31T17:00:00.000Z', '2025-10-31', 'bank', 'tk-tu-do', 21300000, 21900000, 2),
  ('2025-10-31T17:00:00.000Z', '2025-10-31', 'bank', 'so-tiet-kiem', 71000000, 73000000, 1);

INSERT INTO asset_snapshots (recorded_at, snapshot_date, group_id, subtype, value, cost, asset_count) VALUES
  ('2025-11-30T17:00:00.000Z', '2025-11-30', 'dau-tu', 'co-phieu', 111000000, 113240000, 2),
  ('2025-11-30T17:00:00.000Z', '2025-11-30', 'dau-tu', 'coin', 1073000000, 908200000, 3),
  ('2025-11-30T17:00:00.000Z', '2025-11-30', 'dau-tu', 'trai-phieu', 754800000, 760000000, 1),
  ('2025-11-30T17:00:00.000Z', '2025-11-30', 'dau-tu', 'ccq', 20720000, 19000000, 1),
  ('2025-11-30T17:00:00.000Z', '2025-11-30', 'dau-tu', NULL, 181300000, 182400000, 1),
  ('2025-11-30T17:00:00.000Z', '2025-11-30', 'tich-tru', 'usd', 94350000, 91200000, 1),
  ('2025-11-30T17:00:00.000Z', '2025-11-30', 'tich-tru', 'vang', 336700000, 323000000, 1),
  ('2025-11-30T17:00:00.000Z', '2025-11-30', 'tich-tru', 'bds', 1480000000, 1140000000, 1),
  ('2025-11-30T17:00:00.000Z', '2025-11-30', 'cho-vay', 'cho-vay-nong', 44400000, 45600000, 2),
  ('2025-11-30T17:00:00.000Z', '2025-11-30', 'cho-vay', 'cho-vay-lau-dai', 111000000, 114000000, 1),
  ('2025-11-30T17:00:00.000Z', '2025-11-30', 'di-vay', 'tra-gop', 409500000, 409500000, 1),
  ('2025-11-30T17:00:00.000Z', '2025-11-30', 'di-vay', 'vay-lau-dai', 2106000000, 2106000000, 1),
  ('2025-11-30T17:00:00.000Z', '2025-11-30', 'di-vay', 'vay-nong', 23400000, 23400000, 1),
  ('2025-11-30T17:00:00.000Z', '2025-11-30', 'tien-gui', 'tg-co-dinh', 399600000, 402800000, 4),
  ('2025-11-30T17:00:00.000Z', '2025-11-30', 'tien-gui', 'tg-linh-hoat', 75480000, 76000000, 1),
  ('2025-11-30T17:00:00.000Z', '2025-11-30', 'bank', 'tk-tu-do', 22200000, 22800000, 2),
  ('2025-11-30T17:00:00.000Z', '2025-11-30', 'bank', 'so-tiet-kiem', 74000000, 76000000, 1);

INSERT INTO asset_snapshots (recorded_at, snapshot_date, group_id, subtype, value, cost, asset_count) VALUES
  ('2025-12-31T17:00:00.000Z', '2025-12-31', 'dau-tu', 'co-phieu', 115500000, 117710000, 2),
  ('2025-12-31T17:00:00.000Z', '2025-12-31', 'dau-tu', 'coin', 1116500000, 944050000, 3),
  ('2025-12-31T17:00:00.000Z', '2025-12-31', 'dau-tu', 'trai-phieu', 785400000, 790000000, 1),
  ('2025-12-31T17:00:00.000Z', '2025-12-31', 'dau-tu', 'ccq', 21560000, 19750000, 1),
  ('2025-12-31T17:00:00.000Z', '2025-12-31', 'dau-tu', NULL, 188650000, 189600000, 1),
  ('2025-12-31T17:00:00.000Z', '2025-12-31', 'tich-tru', 'usd', 98175000, 94800000, 1),
  ('2025-12-31T17:00:00.000Z', '2025-12-31', 'tich-tru', 'vang', 350350000, 335750000, 1),
  ('2025-12-31T17:00:00.000Z', '2025-12-31', 'tich-tru', 'bds', 1540000000, 1185000000, 1),
  ('2025-12-31T17:00:00.000Z', '2025-12-31', 'cho-vay', 'cho-vay-nong', 46200000, 47400000, 2),
  ('2025-12-31T17:00:00.000Z', '2025-12-31', 'cho-vay', 'cho-vay-lau-dai', 115500000, 118500000, 1),
  ('2025-12-31T17:00:00.000Z', '2025-12-31', 'di-vay', 'tra-gop', 402500000, 402500000, 1),
  ('2025-12-31T17:00:00.000Z', '2025-12-31', 'di-vay', 'vay-lau-dai', 2070000000, 2070000000, 1),
  ('2025-12-31T17:00:00.000Z', '2025-12-31', 'di-vay', 'vay-nong', 23000000, 23000000, 1),
  ('2025-12-31T17:00:00.000Z', '2025-12-31', 'tien-gui', 'tg-co-dinh', 415800000, 418700000, 4),
  ('2025-12-31T17:00:00.000Z', '2025-12-31', 'tien-gui', 'tg-linh-hoat', 78540000, 79000000, 1),
  ('2025-12-31T17:00:00.000Z', '2025-12-31', 'bank', 'tk-tu-do', 23100000, 23700000, 2),
  ('2025-12-31T17:00:00.000Z', '2025-12-31', 'bank', 'so-tiet-kiem', 77000000, 79000000, 1);

INSERT INTO asset_snapshots (recorded_at, snapshot_date, group_id, subtype, value, cost, asset_count) VALUES
  ('2026-01-31T17:00:00.000Z', '2026-01-31', 'dau-tu', 'co-phieu', 120000000, 122180000, 2),
  ('2026-01-31T17:00:00.000Z', '2026-01-31', 'dau-tu', 'coin', 1160000000, 979900000, 3),
  ('2026-01-31T17:00:00.000Z', '2026-01-31', 'dau-tu', 'trai-phieu', 816000000, 820000000, 1),
  ('2026-01-31T17:00:00.000Z', '2026-01-31', 'dau-tu', 'ccq', 22400000, 20500000, 1),
  ('2026-01-31T17:00:00.000Z', '2026-01-31', 'dau-tu', NULL, 196000000, 196800000, 1),
  ('2026-01-31T17:00:00.000Z', '2026-01-31', 'tich-tru', 'usd', 102000000, 98400000, 1),
  ('2026-01-31T17:00:00.000Z', '2026-01-31', 'tich-tru', 'vang', 364000000, 348500000, 1),
  ('2026-01-31T17:00:00.000Z', '2026-01-31', 'tich-tru', 'bds', 1600000000, 1230000000, 1),
  ('2026-01-31T17:00:00.000Z', '2026-01-31', 'cho-vay', 'cho-vay-nong', 48000000, 49200000, 2),
  ('2026-01-31T17:00:00.000Z', '2026-01-31', 'cho-vay', 'cho-vay-lau-dai', 120000000, 123000000, 1),
  ('2026-01-31T17:00:00.000Z', '2026-01-31', 'di-vay', 'tra-gop', 392000000, 392000000, 1),
  ('2026-01-31T17:00:00.000Z', '2026-01-31', 'di-vay', 'vay-lau-dai', 2016000000, 2016000000, 1),
  ('2026-01-31T17:00:00.000Z', '2026-01-31', 'di-vay', 'vay-nong', 22400000, 22400000, 1),
  ('2026-01-31T17:00:00.000Z', '2026-01-31', 'tien-gui', 'tg-co-dinh', 432000000, 434600000, 4),
  ('2026-01-31T17:00:00.000Z', '2026-01-31', 'tien-gui', 'tg-linh-hoat', 81600000, 82000000, 1),
  ('2026-01-31T17:00:00.000Z', '2026-01-31', 'bank', 'tk-tu-do', 24000000, 24600000, 2),
  ('2026-01-31T17:00:00.000Z', '2026-01-31', 'bank', 'so-tiet-kiem', 80000000, 82000000, 1);

INSERT INTO asset_snapshots (recorded_at, snapshot_date, group_id, subtype, value, cost, asset_count) VALUES
  ('2026-02-28T17:00:00.000Z', '2026-02-28', 'dau-tu', 'co-phieu', 124500000, 126650000, 2),
  ('2026-02-28T17:00:00.000Z', '2026-02-28', 'dau-tu', 'coin', 1203500000, 1015750000, 3),
  ('2026-02-28T17:00:00.000Z', '2026-02-28', 'dau-tu', 'trai-phieu', 846600000, 850000000, 1),
  ('2026-02-28T17:00:00.000Z', '2026-02-28', 'dau-tu', 'ccq', 23240000, 21250000, 1),
  ('2026-02-28T17:00:00.000Z', '2026-02-28', 'dau-tu', NULL, 203350000, 204000000, 1),
  ('2026-02-28T17:00:00.000Z', '2026-02-28', 'tich-tru', 'usd', 105825000, 102000000, 1),
  ('2026-02-28T17:00:00.000Z', '2026-02-28', 'tich-tru', 'vang', 377650000, 361250000, 1),
  ('2026-02-28T17:00:00.000Z', '2026-02-28', 'tich-tru', 'bds', 1660000000, 1275000000, 1),
  ('2026-02-28T17:00:00.000Z', '2026-02-28', 'cho-vay', 'cho-vay-nong', 49800000, 51000000, 2),
  ('2026-02-28T17:00:00.000Z', '2026-02-28', 'cho-vay', 'cho-vay-lau-dai', 124500000, 127500000, 1),
  ('2026-02-28T17:00:00.000Z', '2026-02-28', 'di-vay', 'tra-gop', 385000000, 385000000, 1),
  ('2026-02-28T17:00:00.000Z', '2026-02-28', 'di-vay', 'vay-lau-dai', 1980000000, 1980000000, 1),
  ('2026-02-28T17:00:00.000Z', '2026-02-28', 'di-vay', 'vay-nong', 22000000, 22000000, 1),
  ('2026-02-28T17:00:00.000Z', '2026-02-28', 'tien-gui', 'tg-co-dinh', 448200000, 450500000, 4),
  ('2026-02-28T17:00:00.000Z', '2026-02-28', 'tien-gui', 'tg-linh-hoat', 84660000, 85000000, 1),
  ('2026-02-28T17:00:00.000Z', '2026-02-28', 'bank', 'tk-tu-do', 24900000, 25500000, 2),
  ('2026-02-28T17:00:00.000Z', '2026-02-28', 'bank', 'so-tiet-kiem', 83000000, 85000000, 1);

INSERT INTO asset_snapshots (recorded_at, snapshot_date, group_id, subtype, value, cost, asset_count) VALUES
  ('2026-03-23T17:00:00.000Z', '2026-03-23', 'dau-tu', 'co-phieu', 127500000, 129630000, 2),
  ('2026-03-23T17:00:00.000Z', '2026-03-23', 'dau-tu', 'coin', 1232500000, 1039650000, 3),
  ('2026-03-23T17:00:00.000Z', '2026-03-23', 'dau-tu', 'trai-phieu', 867000000, 870000000, 1),
  ('2026-03-23T17:00:00.000Z', '2026-03-23', 'dau-tu', 'ccq', 23800000, 21750000, 1),
  ('2026-03-23T17:00:00.000Z', '2026-03-23', 'dau-tu', NULL, 208250000, 208800000, 1),
  ('2026-03-23T17:00:00.000Z', '2026-03-23', 'tich-tru', 'usd', 108375000, 104400000, 1),
  ('2026-03-23T17:00:00.000Z', '2026-03-23', 'tich-tru', 'vang', 386750000, 369750000, 1),
  ('2026-03-23T17:00:00.000Z', '2026-03-23', 'tich-tru', 'bds', 1700000000, 1305000000, 1),
  ('2026-03-23T17:00:00.000Z', '2026-03-23', 'cho-vay', 'cho-vay-nong', 51000000, 52200000, 2),
  ('2026-03-23T17:00:00.000Z', '2026-03-23', 'cho-vay', 'cho-vay-lau-dai', 127500000, 130500000, 1),
  ('2026-03-23T17:00:00.000Z', '2026-03-23', 'di-vay', 'tra-gop', 378000000, 378000000, 1),
  ('2026-03-23T17:00:00.000Z', '2026-03-23', 'di-vay', 'vay-lau-dai', 1944000000, 1944000000, 1),
  ('2026-03-23T17:00:00.000Z', '2026-03-23', 'di-vay', 'vay-nong', 21600000, 21600000, 1),
  ('2026-03-23T17:00:00.000Z', '2026-03-23', 'tien-gui', 'tg-co-dinh', 459000000, 461100000, 4),
  ('2026-03-23T17:00:00.000Z', '2026-03-23', 'tien-gui', 'tg-linh-hoat', 86700000, 87000000, 1),
  ('2026-03-23T17:00:00.000Z', '2026-03-23', 'bank', 'tk-tu-do', 25500000, 26100000, 2),
  ('2026-03-23T17:00:00.000Z', '2026-03-23', 'bank', 'so-tiet-kiem', 85000000, 87000000, 1);

INSERT INTO asset_snapshots (recorded_at, snapshot_date, group_id, subtype, value, cost, asset_count) VALUES
  ('2026-03-30T17:00:00.000Z', '2026-03-30', 'dau-tu', 'co-phieu', 130500000, 132610000, 2),
  ('2026-03-30T17:00:00.000Z', '2026-03-30', 'dau-tu', 'coin', 1261500000, 1063550000, 3),
  ('2026-03-30T17:00:00.000Z', '2026-03-30', 'dau-tu', 'trai-phieu', 887400000, 890000000, 1),
  ('2026-03-30T17:00:00.000Z', '2026-03-30', 'dau-tu', 'ccq', 24360000, 22250000, 1),
  ('2026-03-30T17:00:00.000Z', '2026-03-30', 'dau-tu', NULL, 213150000, 213600000, 1),
  ('2026-03-30T17:00:00.000Z', '2026-03-30', 'tich-tru', 'usd', 110925000, 106800000, 1),
  ('2026-03-30T17:00:00.000Z', '2026-03-30', 'tich-tru', 'vang', 395850000, 378250000, 1),
  ('2026-03-30T17:00:00.000Z', '2026-03-30', 'tich-tru', 'bds', 1740000000, 1335000000, 1),
  ('2026-03-30T17:00:00.000Z', '2026-03-30', 'cho-vay', 'cho-vay-nong', 52200000, 53400000, 2),
  ('2026-03-30T17:00:00.000Z', '2026-03-30', 'cho-vay', 'cho-vay-lau-dai', 130500000, 133500000, 1),
  ('2026-03-30T17:00:00.000Z', '2026-03-30', 'di-vay', 'tra-gop', 374500000, 374500000, 1),
  ('2026-03-30T17:00:00.000Z', '2026-03-30', 'di-vay', 'vay-lau-dai', 1926000000, 1926000000, 1),
  ('2026-03-30T17:00:00.000Z', '2026-03-30', 'di-vay', 'vay-nong', 21400000, 21400000, 1),
  ('2026-03-30T17:00:00.000Z', '2026-03-30', 'tien-gui', 'tg-co-dinh', 469800000, 471700000, 4),
  ('2026-03-30T17:00:00.000Z', '2026-03-30', 'tien-gui', 'tg-linh-hoat', 88740000, 89000000, 1),
  ('2026-03-30T17:00:00.000Z', '2026-03-30', 'bank', 'tk-tu-do', 26100000, 26700000, 2),
  ('2026-03-30T17:00:00.000Z', '2026-03-30', 'bank', 'so-tiet-kiem', 87000000, 89000000, 1);

INSERT INTO asset_snapshots (recorded_at, snapshot_date, group_id, subtype, value, cost, asset_count) VALUES
  ('2026-04-06T17:00:00.000Z', '2026-04-06', 'dau-tu', 'co-phieu', 133500000, 135590000, 2),
  ('2026-04-06T17:00:00.000Z', '2026-04-06', 'dau-tu', 'coin', 1290500000, 1087450000, 3),
  ('2026-04-06T17:00:00.000Z', '2026-04-06', 'dau-tu', 'trai-phieu', 907800000, 910000000, 1),
  ('2026-04-06T17:00:00.000Z', '2026-04-06', 'dau-tu', 'ccq', 24920000, 22750000, 1),
  ('2026-04-06T17:00:00.000Z', '2026-04-06', 'dau-tu', NULL, 218050000, 218400000, 1),
  ('2026-04-06T17:00:00.000Z', '2026-04-06', 'tich-tru', 'usd', 113475000, 109200000, 1),
  ('2026-04-06T17:00:00.000Z', '2026-04-06', 'tich-tru', 'vang', 404950000, 386750000, 1),
  ('2026-04-06T17:00:00.000Z', '2026-04-06', 'tich-tru', 'bds', 1780000000, 1365000000, 1),
  ('2026-04-06T17:00:00.000Z', '2026-04-06', 'cho-vay', 'cho-vay-nong', 53400000, 54600000, 2),
  ('2026-04-06T17:00:00.000Z', '2026-04-06', 'cho-vay', 'cho-vay-lau-dai', 133500000, 136500000, 1),
  ('2026-04-06T17:00:00.000Z', '2026-04-06', 'di-vay', 'tra-gop', 371000000, 371000000, 1),
  ('2026-04-06T17:00:00.000Z', '2026-04-06', 'di-vay', 'vay-lau-dai', 1908000000, 1908000000, 1),
  ('2026-04-06T17:00:00.000Z', '2026-04-06', 'di-vay', 'vay-nong', 21200000, 21200000, 1),
  ('2026-04-06T17:00:00.000Z', '2026-04-06', 'tien-gui', 'tg-co-dinh', 480600000, 482300000, 4),
  ('2026-04-06T17:00:00.000Z', '2026-04-06', 'tien-gui', 'tg-linh-hoat', 90780000, 91000000, 1),
  ('2026-04-06T17:00:00.000Z', '2026-04-06', 'bank', 'tk-tu-do', 26700000, 27300000, 2),
  ('2026-04-06T17:00:00.000Z', '2026-04-06', 'bank', 'so-tiet-kiem', 89000000, 91000000, 1);

INSERT INTO asset_snapshots (recorded_at, snapshot_date, group_id, subtype, value, cost, asset_count) VALUES
  ('2026-04-13T17:00:00.000Z', '2026-04-13', 'dau-tu', 'co-phieu', 136500000, 138570000, 2),
  ('2026-04-13T17:00:00.000Z', '2026-04-13', 'dau-tu', 'coin', 1319500000, 1111350000, 3),
  ('2026-04-13T17:00:00.000Z', '2026-04-13', 'dau-tu', 'trai-phieu', 928200000, 930000000, 1),
  ('2026-04-13T17:00:00.000Z', '2026-04-13', 'dau-tu', 'ccq', 25480000, 23250000, 1),
  ('2026-04-13T17:00:00.000Z', '2026-04-13', 'dau-tu', NULL, 222950000, 223200000, 1),
  ('2026-04-13T17:00:00.000Z', '2026-04-13', 'tich-tru', 'usd', 116025000, 111600000, 1),
  ('2026-04-13T17:00:00.000Z', '2026-04-13', 'tich-tru', 'vang', 414050000, 395250000, 1),
  ('2026-04-13T17:00:00.000Z', '2026-04-13', 'tich-tru', 'bds', 1820000000, 1395000000, 1),
  ('2026-04-13T17:00:00.000Z', '2026-04-13', 'cho-vay', 'cho-vay-nong', 54600000, 55800000, 2),
  ('2026-04-13T17:00:00.000Z', '2026-04-13', 'cho-vay', 'cho-vay-lau-dai', 136500000, 139500000, 1),
  ('2026-04-13T17:00:00.000Z', '2026-04-13', 'di-vay', 'tra-gop', 367500000, 367500000, 1),
  ('2026-04-13T17:00:00.000Z', '2026-04-13', 'di-vay', 'vay-lau-dai', 1890000000, 1890000000, 1),
  ('2026-04-13T17:00:00.000Z', '2026-04-13', 'di-vay', 'vay-nong', 21000000, 21000000, 1),
  ('2026-04-13T17:00:00.000Z', '2026-04-13', 'tien-gui', 'tg-co-dinh', 491400000, 492900000, 4),
  ('2026-04-13T17:00:00.000Z', '2026-04-13', 'tien-gui', 'tg-linh-hoat', 92820000, 93000000, 1),
  ('2026-04-13T17:00:00.000Z', '2026-04-13', 'bank', 'tk-tu-do', 27300000, 27900000, 2),
  ('2026-04-13T17:00:00.000Z', '2026-04-13', 'bank', 'so-tiet-kiem', 91000000, 93000000, 1);

INSERT INTO asset_snapshots (recorded_at, snapshot_date, group_id, subtype, value, cost, asset_count) VALUES
  ('2026-04-20T17:00:00.000Z', '2026-04-20', 'dau-tu', 'co-phieu', 139500000, 141550000, 2),
  ('2026-04-20T17:00:00.000Z', '2026-04-20', 'dau-tu', 'coin', 1348500000, 1135250000, 3),
  ('2026-04-20T17:00:00.000Z', '2026-04-20', 'dau-tu', 'trai-phieu', 948600000, 950000000, 1),
  ('2026-04-20T17:00:00.000Z', '2026-04-20', 'dau-tu', 'ccq', 26040000, 23750000, 1),
  ('2026-04-20T17:00:00.000Z', '2026-04-20', 'dau-tu', NULL, 227850000, 228000000, 1),
  ('2026-04-20T17:00:00.000Z', '2026-04-20', 'tich-tru', 'usd', 118575000, 114000000, 1),
  ('2026-04-20T17:00:00.000Z', '2026-04-20', 'tich-tru', 'vang', 423150000, 403750000, 1),
  ('2026-04-20T17:00:00.000Z', '2026-04-20', 'tich-tru', 'bds', 1860000000, 1425000000, 1),
  ('2026-04-20T17:00:00.000Z', '2026-04-20', 'cho-vay', 'cho-vay-nong', 55800000, 57000000, 2),
  ('2026-04-20T17:00:00.000Z', '2026-04-20', 'cho-vay', 'cho-vay-lau-dai', 139500000, 142500000, 1),
  ('2026-04-20T17:00:00.000Z', '2026-04-20', 'di-vay', 'tra-gop', 364000000, 364000000, 1),
  ('2026-04-20T17:00:00.000Z', '2026-04-20', 'di-vay', 'vay-lau-dai', 1872000000, 1872000000, 1),
  ('2026-04-20T17:00:00.000Z', '2026-04-20', 'di-vay', 'vay-nong', 20800000, 20800000, 1),
  ('2026-04-20T17:00:00.000Z', '2026-04-20', 'tien-gui', 'tg-co-dinh', 502200000, 503500000, 4),
  ('2026-04-20T17:00:00.000Z', '2026-04-20', 'tien-gui', 'tg-linh-hoat', 94860000, 95000000, 1),
  ('2026-04-20T17:00:00.000Z', '2026-04-20', 'bank', 'tk-tu-do', 27900000, 28500000, 2),
  ('2026-04-20T17:00:00.000Z', '2026-04-20', 'bank', 'so-tiet-kiem', 93000000, 95000000, 1);

INSERT INTO asset_snapshots (recorded_at, snapshot_date, group_id, subtype, value, cost, asset_count) VALUES
  ('2026-04-27T17:00:00.000Z', '2026-04-27', 'dau-tu', 'co-phieu', 142500000, 144530000, 2),
  ('2026-04-27T17:00:00.000Z', '2026-04-27', 'dau-tu', 'coin', 1377500000, 1159150000, 3),
  ('2026-04-27T17:00:00.000Z', '2026-04-27', 'dau-tu', 'trai-phieu', 969000000, 970000000, 1),
  ('2026-04-27T17:00:00.000Z', '2026-04-27', 'dau-tu', 'ccq', 26600000, 24250000, 1),
  ('2026-04-27T17:00:00.000Z', '2026-04-27', 'dau-tu', NULL, 232750000, 232800000, 1),
  ('2026-04-27T17:00:00.000Z', '2026-04-27', 'tich-tru', 'usd', 121125000, 116400000, 1),
  ('2026-04-27T17:00:00.000Z', '2026-04-27', 'tich-tru', 'vang', 432250000, 412250000, 1),
  ('2026-04-27T17:00:00.000Z', '2026-04-27', 'tich-tru', 'bds', 1900000000, 1455000000, 1),
  ('2026-04-27T17:00:00.000Z', '2026-04-27', 'cho-vay', 'cho-vay-nong', 57000000, 58200000, 2),
  ('2026-04-27T17:00:00.000Z', '2026-04-27', 'cho-vay', 'cho-vay-lau-dai', 142500000, 145500000, 1),
  ('2026-04-27T17:00:00.000Z', '2026-04-27', 'di-vay', 'tra-gop', 360500000, 360500000, 1),
  ('2026-04-27T17:00:00.000Z', '2026-04-27', 'di-vay', 'vay-lau-dai', 1854000000, 1854000000, 1),
  ('2026-04-27T17:00:00.000Z', '2026-04-27', 'di-vay', 'vay-nong', 20600000, 20600000, 1),
  ('2026-04-27T17:00:00.000Z', '2026-04-27', 'tien-gui', 'tg-co-dinh', 513000000, 514100000, 4),
  ('2026-04-27T17:00:00.000Z', '2026-04-27', 'tien-gui', 'tg-linh-hoat', 96900000, 97000000, 1),
  ('2026-04-27T17:00:00.000Z', '2026-04-27', 'bank', 'tk-tu-do', 28500000, 29100000, 2),
  ('2026-04-27T17:00:00.000Z', '2026-04-27', 'bank', 'so-tiet-kiem', 95000000, 97000000, 1);

INSERT INTO asset_snapshots (recorded_at, snapshot_date, group_id, subtype, value, cost, asset_count) VALUES
  ('2026-05-04T17:00:00.000Z', '2026-05-04', 'dau-tu', 'co-phieu', 145500000, 147510000, 2),
  ('2026-05-04T17:00:00.000Z', '2026-05-04', 'dau-tu', 'coin', 1406500000, 1183050000, 3),
  ('2026-05-04T17:00:00.000Z', '2026-05-04', 'dau-tu', 'trai-phieu', 989400000, 990000000, 1),
  ('2026-05-04T17:00:00.000Z', '2026-05-04', 'dau-tu', 'ccq', 27160000, 24750000, 1),
  ('2026-05-04T17:00:00.000Z', '2026-05-04', 'dau-tu', NULL, 237650000, 237600000, 1),
  ('2026-05-04T17:00:00.000Z', '2026-05-04', 'tich-tru', 'usd', 123675000, 118800000, 1),
  ('2026-05-04T17:00:00.000Z', '2026-05-04', 'tich-tru', 'vang', 441350000, 420750000, 1),
  ('2026-05-04T17:00:00.000Z', '2026-05-04', 'tich-tru', 'bds', 1940000000, 1485000000, 1),
  ('2026-05-04T17:00:00.000Z', '2026-05-04', 'cho-vay', 'cho-vay-nong', 58200000, 59400000, 2),
  ('2026-05-04T17:00:00.000Z', '2026-05-04', 'cho-vay', 'cho-vay-lau-dai', 145500000, 148500000, 1),
  ('2026-05-04T17:00:00.000Z', '2026-05-04', 'di-vay', 'tra-gop', 357000000, 357000000, 1),
  ('2026-05-04T17:00:00.000Z', '2026-05-04', 'di-vay', 'vay-lau-dai', 1836000000, 1836000000, 1),
  ('2026-05-04T17:00:00.000Z', '2026-05-04', 'di-vay', 'vay-nong', 20400000, 20400000, 1),
  ('2026-05-04T17:00:00.000Z', '2026-05-04', 'tien-gui', 'tg-co-dinh', 523800000, 524700000, 4),
  ('2026-05-04T17:00:00.000Z', '2026-05-04', 'tien-gui', 'tg-linh-hoat', 98940000, 99000000, 1),
  ('2026-05-04T17:00:00.000Z', '2026-05-04', 'bank', 'tk-tu-do', 29100000, 29700000, 2),
  ('2026-05-04T17:00:00.000Z', '2026-05-04', 'bank', 'so-tiet-kiem', 97000000, 99000000, 1);

INSERT INTO asset_snapshots (recorded_at, snapshot_date, group_id, subtype, value, cost, asset_count) VALUES
  ('2026-05-11T17:00:00.000Z', '2026-05-11', 'dau-tu', 'co-phieu', 147750000, 149745000, 2),
  ('2026-05-11T17:00:00.000Z', '2026-05-11', 'dau-tu', 'coin', 1428250000, 1200975000, 3),
  ('2026-05-11T17:00:00.000Z', '2026-05-11', 'dau-tu', 'trai-phieu', 1004700000, 1005000000, 1),
  ('2026-05-11T17:00:00.000Z', '2026-05-11', 'dau-tu', 'ccq', 27580000, 25125000, 1),
  ('2026-05-11T17:00:00.000Z', '2026-05-11', 'dau-tu', NULL, 241325000, 241200000, 1),
  ('2026-05-11T17:00:00.000Z', '2026-05-11', 'tich-tru', 'usd', 125587500, 120600000, 1),
  ('2026-05-11T17:00:00.000Z', '2026-05-11', 'tich-tru', 'vang', 448175000, 427125000, 1),
  ('2026-05-11T17:00:00.000Z', '2026-05-11', 'tich-tru', 'bds', 1970000000, 1507500000, 1),
  ('2026-05-11T17:00:00.000Z', '2026-05-11', 'cho-vay', 'cho-vay-nong', 59100000, 60300000, 2),
  ('2026-05-11T17:00:00.000Z', '2026-05-11', 'cho-vay', 'cho-vay-lau-dai', 147750000, 150750000, 1),
  ('2026-05-11T17:00:00.000Z', '2026-05-11', 'di-vay', 'tra-gop', 353500000, 353500000, 1),
  ('2026-05-11T17:00:00.000Z', '2026-05-11', 'di-vay', 'vay-lau-dai', 1818000000, 1818000000, 1),
  ('2026-05-11T17:00:00.000Z', '2026-05-11', 'di-vay', 'vay-nong', 20200000, 20200000, 1),
  ('2026-05-11T17:00:00.000Z', '2026-05-11', 'tien-gui', 'tg-co-dinh', 531900000, 532650000, 4),
  ('2026-05-11T17:00:00.000Z', '2026-05-11', 'tien-gui', 'tg-linh-hoat', 100470000, 100500000, 1),
  ('2026-05-11T17:00:00.000Z', '2026-05-11', 'bank', 'tk-tu-do', 29550000, 30150000, 2),
  ('2026-05-11T17:00:00.000Z', '2026-05-11', 'bank', 'so-tiet-kiem', 98500000, 100500000, 1);

INSERT INTO asset_snapshots (recorded_at, snapshot_date, group_id, subtype, value, cost, asset_count) VALUES
  ('2026-05-18T17:00:00.000Z', '2026-05-18', 'dau-tu', 'co-phieu', 149250000, 151235000, 2),
  ('2026-05-18T17:00:00.000Z', '2026-05-18', 'dau-tu', 'coin', 1442750000, 1212925000, 3),
  ('2026-05-18T17:00:00.000Z', '2026-05-18', 'dau-tu', 'trai-phieu', 1014900000, 1015000000, 1),
  ('2026-05-18T17:00:00.000Z', '2026-05-18', 'dau-tu', 'ccq', 27860000, 25375000, 1),
  ('2026-05-18T17:00:00.000Z', '2026-05-18', 'dau-tu', NULL, 243775000, 243600000, 1),
  ('2026-05-18T17:00:00.000Z', '2026-05-18', 'tich-tru', 'usd', 126862500, 121800000, 1),
  ('2026-05-18T17:00:00.000Z', '2026-05-18', 'tich-tru', 'vang', 452725000, 431375000, 1),
  ('2026-05-18T17:00:00.000Z', '2026-05-18', 'tich-tru', 'bds', 1990000000, 1522500000, 1),
  ('2026-05-18T17:00:00.000Z', '2026-05-18', 'cho-vay', 'cho-vay-nong', 59700000, 60900000, 2),
  ('2026-05-18T17:00:00.000Z', '2026-05-18', 'cho-vay', 'cho-vay-lau-dai', 149250000, 152250000, 1),
  ('2026-05-18T17:00:00.000Z', '2026-05-18', 'di-vay', 'tra-gop', 351750000, 351750000, 1),
  ('2026-05-18T17:00:00.000Z', '2026-05-18', 'di-vay', 'vay-lau-dai', 1809000000, 1809000000, 1),
  ('2026-05-18T17:00:00.000Z', '2026-05-18', 'di-vay', 'vay-nong', 20100000, 20100000, 1),
  ('2026-05-18T17:00:00.000Z', '2026-05-18', 'tien-gui', 'tg-co-dinh', 537300000, 537950000, 4),
  ('2026-05-18T17:00:00.000Z', '2026-05-18', 'tien-gui', 'tg-linh-hoat', 101490000, 101500000, 1),
  ('2026-05-18T17:00:00.000Z', '2026-05-18', 'bank', 'tk-tu-do', 29850000, 30450000, 2),
  ('2026-05-18T17:00:00.000Z', '2026-05-18', 'bank', 'so-tiet-kiem', 99500000, 101500000, 1);

INSERT INTO asset_snapshots (recorded_at, snapshot_date, group_id, subtype, value, cost, asset_count) VALUES
  ('2026-05-25T17:00:00.000Z', '2026-05-25', 'dau-tu', 'co-phieu', 150000000, 151980000, 2),
  ('2026-05-25T17:00:00.000Z', '2026-05-25', 'dau-tu', 'coin', 1450000000, 1218900000, 3),
  ('2026-05-25T17:00:00.000Z', '2026-05-25', 'dau-tu', 'trai-phieu', 1020000000, 1020000000, 1),
  ('2026-05-25T17:00:00.000Z', '2026-05-25', 'dau-tu', 'ccq', 28000000, 25500000, 1),
  ('2026-05-25T17:00:00.000Z', '2026-05-25', 'dau-tu', NULL, 245000000, 244800000, 1),
  ('2026-05-25T17:00:00.000Z', '2026-05-25', 'tich-tru', 'usd', 127500000, 122400000, 1),
  ('2026-05-25T17:00:00.000Z', '2026-05-25', 'tich-tru', 'vang', 455000000, 433500000, 1),
  ('2026-05-25T17:00:00.000Z', '2026-05-25', 'tich-tru', 'bds', 2000000000, 1530000000, 1),
  ('2026-05-25T17:00:00.000Z', '2026-05-25', 'cho-vay', 'cho-vay-nong', 60000000, 61200000, 2),
  ('2026-05-25T17:00:00.000Z', '2026-05-25', 'cho-vay', 'cho-vay-lau-dai', 150000000, 153000000, 1),
  ('2026-05-25T17:00:00.000Z', '2026-05-25', 'di-vay', 'tra-gop', 350000000, 350000000, 1),
  ('2026-05-25T17:00:00.000Z', '2026-05-25', 'di-vay', 'vay-lau-dai', 1800000000, 1800000000, 1),
  ('2026-05-25T17:00:00.000Z', '2026-05-25', 'di-vay', 'vay-nong', 20000000, 20000000, 1),
  ('2026-05-25T17:00:00.000Z', '2026-05-25', 'tien-gui', 'tg-co-dinh', 540000000, 540600000, 4),
  ('2026-05-25T17:00:00.000Z', '2026-05-25', 'tien-gui', 'tg-linh-hoat', 102000000, 102000000, 1),
  ('2026-05-25T17:00:00.000Z', '2026-05-25', 'bank', 'tk-tu-do', 30000000, 30600000, 2),
  ('2026-05-25T17:00:00.000Z', '2026-05-25', 'bank', 'so-tiet-kiem', 100000000, 102000000, 1);
