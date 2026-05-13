-- Finance Manager — Sample seed data (Vietnamese)

INSERT INTO members (name, color) VALUES
  ('Tôi',     '#3b82f6'),
  ('Vợ',      '#ec4899'),
  ('Chung',   '#8b5cf6');

INSERT INTO asset_groups (name, icon, type) VALUES
  ('Tiền mặt',         '💵', 'Asset'),
  ('Tiền gửi',         '🏦', 'Asset'),
  ('Cổ phiếu',         '📈', 'Asset'),
  ('Crypto',           '🪙', 'Asset'),
  ('Vàng',             '🥇', 'Asset'),
  ('Bất động sản',     '🏠', 'Asset'),
  ('Khác',             '📦', 'Asset'),
  ('Vay nợ',           '💳', 'Liability');

-- Sample assets
INSERT INTO assets (name, group_id, subtype, member_id, qty, unit, cost_price, current_price, start_date, notes) VALUES
  ('Tiền mặt VND',        1, NULL,        1, 1,     'VND',  5000000,     5000000,      '2025-01-01', 'Ví cá nhân'),
  ('Sổ tiết kiệm VCB',    2, 'Tiền gửi',  1, 1,     'VND',  100000000,   102500000,    '2025-01-15', 'Kỳ hạn 12 tháng, lãi 5%'),
  ('VNM',                 3, 'HOSE',      1, 100,   'cp',   75000,       82000,        '2024-06-10', 'Vinamilk'),
  ('FPT',                 3, 'HOSE',      2, 50,    'cp',   95000,       128000,        '2024-08-22', 'FPT Corp'),
  ('BTC',                 4, 'Crypto',    1, 0.05,  'BTC',  900000000,   1050000000,   '2024-10-01', 'Mua qua sàn'),
  ('SJC 1 chỉ',           5, 'Vàng SJC',  3, 5,     'chỉ',  7500000,     8200000,      '2024-12-15', 'Mua tại SJC'),
  ('Vay mua xe',          8, 'Vay TD',    1, 1,     'VND',  300000000,   180000000,    '2024-03-01', 'Trả góp 36 tháng, lãi 9%');

-- Sample transactions
INSERT INTO transactions (date, type, asset_id, member_id, qty, unit_price, total, notes) VALUES
  ('2024-06-10', 'buy',  3, 1, 100,   75000,    7500000,   'Mua VNM lần đầu'),
  ('2024-08-22', 'buy',  4, 2, 50,    95000,    4750000,   'Mua FPT'),
  ('2024-10-01', 'buy',  5, 1, 0.05,  900000000, 45000000, 'Mua BTC'),
  ('2025-02-15', 'dividend', 3, 1, 0, 2000,     200000,    'Cổ tức VNM 2024');
