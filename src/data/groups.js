// Hard-coded asset groups + subtypes — single source of truth.
// Group `id` and subtype `id` are stable slugs. Display names can be renamed
// without affecting stored values.
export const ASSET_GROUPS = [
  {
    id: 'dau-tu',
    name: 'Đầu tư',
    icon: '📈',
    type: 'Asset',
    subtypes: [
      { id: 'co-phieu',   name: 'Cổ phiếu' },
      { id: 'coin',       name: 'Coin' },
      { id: 'trai-phieu', name: 'Trái phiếu' },
      { id: 'ccq',        name: 'CCQ' },
    ],
  },
  {
    id: 'tich-tru',
    name: 'Tích trữ',
    icon: '🏆',
    type: 'Asset',
    subtypes: [
      { id: 'usd',  name: 'USD' },
      { id: 'vang', name: 'Vàng' },
      { id: 'bds',  name: 'BĐS' },
    ],
  },
  {
    id: 'cho-vay',
    name: 'Cho vay',
    icon: '🤝',
    type: 'Asset',
    subtypes: [
      { id: 'cho-vay-nong',    name: 'Cho vay nóng' },
      { id: 'cho-vay-lau-dai', name: 'Cho vay lâu dài' },
    ],
  },
  {
    id: 'di-vay',
    name: 'Đi vay',
    icon: '💳',
    type: 'Liability',
    subtypes: [
      { id: 'tra-gop',     name: 'Trả góp' },
      { id: 'vay-nong',    name: 'Vay nóng' },
      { id: 'vay-lau-dai', name: 'Vay lâu dài' },
    ],
  },
  {
    id: 'tien-gui',
    name: 'Tiền gửi',
    icon: '🏦',
    type: 'Asset',
    subtypes: [
      { id: 'tg-co-dinh',   name: 'TG cố định' },
      { id: 'tg-linh-hoat', name: 'TG linh hoạt' },
    ],
  },
  {
    id: 'bank',
    name: 'Bank',
    icon: '🏧',
    type: 'Asset',
    subtypes: [
      { id: 'tk-tu-do',    name: 'TK tự do' },
      { id: 'so-tiet-kiem', name: 'Sổ tiết kiệm' },
    ],
  },
];

const BY_ID = Object.fromEntries(ASSET_GROUPS.map((g) => [g.id, g]));

export function findGroup(id) {
  return BY_ID[id] || null;
}

export function findSubtype(groupId, subtypeId) {
  if (!subtypeId) return null;
  const g = BY_ID[groupId];
  if (!g) return null;
  return g.subtypes.find((s) => s.id === subtypeId) || null;
}

// Always illiquid regardless of term.
const ALWAYS_ILLIQUID = new Set([
  'tich-tru/bds',
  'cho-vay/cho-vay-lau-dai',
]);

// Illiquid when maturity_date is more than 1 month away; liquid otherwise.
const MATURITY_ILLIQUID = new Set([
  'tien-gui/tg-co-dinh',
  'bank/so-tiet-kiem',
]);

export function isLiquid(a) {
  const g = BY_ID[a.group_id];
  if (!g || g.type === 'Liability') return false;
  const key = `${a.group_id}/${a.subtype}`;
  if (ALWAYS_ILLIQUID.has(key)) return false;
  if (MATURITY_ILLIQUID.has(key)) {
    if (!a.maturity_date) return true;
    const daysLeft = (new Date(a.maturity_date) - Date.now()) / 86_400_000;
    return daysLeft <= 30;
  }
  return true;
}

// Adds group_name/icon/type and a resolved subtype_name onto an asset row.
export function enrichAsset(a) {
  const g = BY_ID[a.group_id];
  if (!g) return a;

  const subtype_name = g.subtypes.find((s) => s.id === a.subtype)?.name ?? '';

  return {
    ...a,
    group_name: g.name,
    group_icon: g.icon,
    group_type: g.type,
    subtype_name,
  };
}
