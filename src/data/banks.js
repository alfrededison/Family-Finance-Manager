// Vietnamese commercial banks — abbreviation + short name + full official name.
// Stored on assets as `bank` (abbreviation). Display resolved from this list.
export const BANKS = [
  { abbr: 'VCB',  short: 'Vietcombank',  full: 'Ngân hàng TMCP Ngoại Thương Việt Nam' },
  { abbr: 'TCB',  short: 'Techcombank',  full: 'Ngân hàng TMCP Kỹ Thương Việt Nam' },
  { abbr: 'BIDV', short: 'BIDV',         full: 'Ngân hàng TMCP Đầu Tư và Phát Triển Việt Nam' },
  { abbr: 'CTG',  short: 'VietinBank',   full: 'Ngân hàng TMCP Công Thương Việt Nam' },
  { abbr: 'AGRI', short: 'Agribank',     full: 'Ngân hàng Nông nghiệp và Phát triển Nông thôn Việt Nam' },
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
  { abbr: 'SEAB', short: 'SeABank',      full: 'Ngân hàng TMCP Đông Nam Á' },
  { abbr: 'NAB',  short: 'Nam A Bank',   full: 'Ngân hàng TMCP Nam Á' },
  { abbr: 'PGB',  short: 'PGBank',       full: 'Ngân hàng TMCP Thịnh Vượng và Phát Triển' },
  { abbr: 'BAB',  short: 'Bac A Bank',   full: 'Ngân hàng TMCP Bắc Á' },
  { abbr: 'KLB',  short: 'Kienlongbank', full: 'Ngân hàng TMCP Kiên Long' },
  { abbr: 'LPB',  short: 'LPBank',       full: 'Ngân hàng TMCP Lộc Phát Việt Nam' },
  { abbr: 'NCB',  short: 'NCB',          full: 'Ngân hàng TMCP Quốc Dân' },
  { abbr: 'VAB',  short: 'VietABank',    full: 'Ngân hàng TMCP Việt Á' },
  { abbr: 'EIB',  short: 'Eximbank',     full: 'Ngân hàng TMCP Xuất Nhập Khẩu Việt Nam' },
  { abbr: 'SCB',  short: 'SCB',          full: 'Ngân hàng TMCP Sài Gòn' },
  { abbr: 'ABB',  short: 'ABBANK',       full: 'Ngân hàng TMCP An Bình' },
  { abbr: 'VBB',  short: 'VietBank',     full: 'Ngân hàng TMCP Việt Nam Thương Tín' },
  { abbr: 'BVB',  short: 'BVBank',       full: 'Ngân hàng TMCP Bản Việt' },
  { abbr: 'SGB',  short: 'Saigonbank',   full: 'Ngân hàng TMCP Sài Gòn Công Thương' },
  { abbr: 'OCEAN', short: 'OceanBank',   full: 'Ngân hàng TM TNHH MTV Đại Dương' },
  { abbr: 'GPB',  short: 'GPBank',       full: 'Ngân hàng TM TNHH MTV Dầu Khí Toàn Cầu' },
  { abbr: 'CB',   short: 'CBBank',       full: 'Ngân hàng Thương Mại TNHH MTV Xây Dựng Việt Nam' },
  { abbr: 'PVCB', short: 'PVcomBank',    full: 'Ngân hàng TMCP Đại Chúng Việt Nam' },
  { abbr: 'DAB',  short: 'DongA Bank',   full: 'Ngân hàng TMCP Đông Á' },
];

// Accent-insensitive normalisation. Combining-marks block U+0300–U+036F.
function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

export function searchBanks(query) {
  const q = norm(query).trim();
  if (!q) return BANKS;
  return BANKS.filter((b) =>
    [b.abbr, b.short, b.full].some((s) => norm(s).includes(q))
  );
}

export function findBank(abbr) {
  if (!abbr) return null;
  return BANKS.find((b) => b.abbr === abbr) || null;
}

export function formatBank(abbr) {
  const b = findBank(abbr);
  if (!b) return abbr || '';
  return `${b.abbr} — ${b.short}`;
}
