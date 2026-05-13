-- Finance Manager — Default seed (Vietnamese)

INSERT INTO members (name, color) VALUES
  ('Chồng',   '#3b82f6'),
  ('Vợ',    '#ec4899'),
  ('Chung', '#8b5cf6');

-- 6 groups matching the canonical spreadsheet
INSERT INTO asset_groups (id, name, icon, type, sort_order, active) VALUES
  ('dau-tu',   'Đầu tư',   '📈', 'Asset',     1, 1),
  ('tich-tru', 'Tích trữ', '🏆', 'Asset',     2, 1),
  ('cho-vay',  'Cho vay',  '🤝', 'Asset',     3, 1),
  ('di-vay',   'Đi vay',   '💳', 'Liability', 4, 1),
  ('tien-gui', 'Tiền gửi', '🏦', 'Asset',     5, 1),
  ('bank',     'Bank',     '🏧', 'Asset',     6, 1);

INSERT INTO asset_subtypes (group_id, name) VALUES
  ('dau-tu',   'Cổ phiếu'),
  ('dau-tu',   'Coin'),
  ('dau-tu',   'Trái phiếu'),
  ('dau-tu',   'CCQ'),
  ('tich-tru', 'USD'),
  ('tich-tru', 'Vàng'),
  ('tich-tru', 'BĐS'),
  ('cho-vay',  'Cho vay nóng'),
  ('cho-vay',  'Cho vay lâu dài'),
  ('di-vay',   'Trả góp'),
  ('di-vay',   'Vay nóng'),
  ('di-vay',   'Vay lâu dài'),
  ('tien-gui', 'TG cố định'),
  ('tien-gui', 'TG linh hoạt'),
  ('bank',     'TK tự do'),
  ('bank',     'Tiết kiệm dài tháng'),
  ('bank',     'Tiết kiệm ít tháng');

INSERT INTO platforms (name) VALUES
  ('Topi'), ('Sstock'), ('Viettel Money'), ('Zalopay'), ('Momo');
