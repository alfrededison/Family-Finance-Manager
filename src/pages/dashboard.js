import { api } from '../api.js';
import { fmtVND, fmtPct, escapeHtml } from '../main.js';
import { txTypeLabel } from './transactions.js';

export async function renderDashboard(view) {
  const data = await api.get('/dashboard');
  const { kpi, breakdown, transactions } = data;

  const maxGroupValue = Math.max(1, ...breakdown.byGroup.map((g) => g.value));
  const maxMemberValue = Math.max(1, ...breakdown.byMember.map((m) => Math.abs(m.value)));

  view.innerHTML = `
    <div class="page-header"><h1>📊 Tổng quan</h1></div>

    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="label">Tài sản ròng</div>
        <div class="value ${kpi.netWorth >= 0 ? 'pos' : 'neg'}">${fmtVND(kpi.netWorth)}</div>
        <div class="sub">Tổng tài sản − Nợ phải trả</div>
      </div>
      <div class="kpi-card">
        <div class="label">Tổng tài sản</div>
        <div class="value">${fmtVND(kpi.totalAsset)}</div>
      </div>
      <div class="kpi-card">
        <div class="label">Nợ phải trả</div>
        <div class="value">${fmtVND(kpi.totalLiability)}</div>
      </div>
      <div class="kpi-card">
        <div class="label">Lãi/Lỗ chưa thực hiện</div>
        <div class="value ${kpi.pnl >= 0 ? 'pos' : 'neg'}">${fmtVND(kpi.pnl)}</div>
        <div class="sub ${kpi.pnl >= 0 ? 'pos' : 'neg'}">${fmtPct(kpi.pnlPct)}</div>
      </div>
    </div>

    <div class="section">
      <h2>Phân bổ theo nhóm</h2>
      <div class="breakdown-list">
        ${breakdown.byGroup.length === 0 ? '<div class="empty">Chưa có dữ liệu</div>' :
          breakdown.byGroup.map((g) => `
            <div class="breakdown-row">
              <div>${escapeHtml(g.icon)} ${escapeHtml(g.name)} <span class="badge">${g.count}</span></div>
              <div class="breakdown-bar"><div style="width:${(g.value / maxGroupValue * 100).toFixed(1)}%; background:${g.type === 'Liability' ? 'var(--danger)' : 'var(--primary)'}"></div></div>
              <div class="num">${fmtVND(g.value)}</div>
            </div>
          `).join('')}
      </div>
    </div>

    <div class="section">
      <h2>Phân bổ theo thành viên</h2>
      <div class="breakdown-list">
        ${breakdown.byMember.length === 0 ? '<div class="empty">Chưa có dữ liệu</div>' :
          breakdown.byMember.map((m) => `
            <div class="breakdown-row">
              <div><span class="member-chip" style="background:${escapeHtml(m.color)}">${escapeHtml(m.name)}</span> <span class="badge">${m.count}</span></div>
              <div class="breakdown-bar"><div style="width:${(Math.abs(m.value) / maxMemberValue * 100).toFixed(1)}%; background:${escapeHtml(m.color)}"></div></div>
              <div class="num">${fmtVND(m.value)}</div>
            </div>
          `).join('')}
      </div>
    </div>

    <div class="section">
      <h2>Giao dịch gần đây</h2>
      ${transactions.length === 0 ? '<div class="empty">Chưa có giao dịch</div>' : `
      <div class="table-wrap"><table>
        <thead>
          <tr><th>Ngày</th><th>Loại</th><th>Tài sản</th><th>Thành viên</th><th class="num">SL</th><th class="num">Đơn giá</th><th class="num">Tổng</th></tr>
        </thead>
        <tbody>
          ${transactions.map((t) => `
            <tr>
              <td>${escapeHtml(t.date)}</td>
              <td><span class="badge">${escapeHtml(txTypeLabel(t.type))}</span></td>
              <td>${escapeHtml(t.asset_name)}</td>
              <td>${escapeHtml(t.member_name || '—')}</td>
              <td class="num">${t.qty}</td>
              <td class="num">${fmtVND(t.unit_price)}</td>
              <td class="num">${fmtVND(t.total)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table></div>`}
    </div>
  `;
}

