#!/usr/bin/env node
// Sinh demo.sql từ demo.template.sql, điền ngày tương đối theo ngày chạy
// để các case phụ thuộc thời gian (maturity chip, snapshot, delta) không bị lỗi thời.
//
// Placeholder:
//   {{D+n}} / {{D-n}} / {{D0}}  → hôm nay ± n ngày (YYYY-MM-DD)
//   {{EOM-n}}                   → ngày cuối của tháng n tháng trước
//   {{DOM+n}}                   → day-of-month của (hôm nay + n ngày), dạng số nguyên

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const template = readFileSync(join(root, 'demo.template.sql'), 'utf8');

const today = new Date();
const fmt = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (n) => {
  const d = new Date(today);
  d.setDate(d.getDate() + n);
  return d;
};
const endOfMonth = (n) => new Date(today.getFullYear(), today.getMonth() - n + 1, 0);

const out = template
  .replace(/\{\{D([+-]?\d+)\}\}/g, (_, n) => fmt(addDays(Number(n))))
  .replace(/\{\{EOM-(\d+)\}\}/g, (_, n) => fmt(endOfMonth(Number(n))))
  .replace(/\{\{DOM([+-]?\d+)\}\}/g, (_, n) => String(addDays(Number(n)).getDate()));

const leftover = out.match(/\{\{[^}]*\}\}/);
if (leftover) {
  console.error(`Placeholder không nhận dạng được: ${leftover[0]}`);
  process.exit(1);
}

const header = `-- GENERATED từ demo.template.sql (ngày ${fmt(today)}) — đừng sửa trực tiếp, chạy: node scripts/gen-demo.js\n`;
writeFileSync(join(root, 'demo.sql'), header + out);
console.log(`demo.sql generated (hôm nay = ${fmt(today)})`);
