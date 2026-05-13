-- Finance Manager — Default seed (Vietnamese)
-- Asset groups + subtypes are hard-coded in src/data/groups.js (no DB seed).

INSERT INTO members (name, color) VALUES
  ('Chồng', '#3b82f6'),
  ('Vợ',    '#ec4899'),
  ('Chung', '#8b5cf6');

INSERT INTO platforms (name) VALUES
  ('Topi'), ('Sstock'), ('Viettel Money'), ('Zalopay'), ('Momo');
