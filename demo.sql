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
