import { BANKS, searchBanks, findBank } from '../data/banks.js';
import { escapeHtml } from '../main.js';

// Renders an inline searchable bank picker.
// `selected` = bank abbreviation. The hidden <input name="bank"> holds the value.
export function bankSelectHTML(name, selected) {
  const current = findBank(selected);
  const initial = current ? `${current.abbr} — ${current.full}` : (selected || '');
  return `
    <div class="bank-select" data-bank-select>
      <input type="hidden" name="${name}" value="${escapeHtml(selected || '')}" />
      <input type="text"
             class="bank-search"
             placeholder="Tìm ngân hàng (VD: TCB, Techcombank, Kỹ Thương...)"
             value="${escapeHtml(initial)}"
             autocomplete="off" />
      <div class="bank-results" role="listbox" hidden></div>
    </div>
  `;
}

export function bindBankSelect(root) {
  root.querySelectorAll('[data-bank-select]').forEach((wrap) => {
    const hidden  = wrap.querySelector('input[type="hidden"]');
    const search  = wrap.querySelector('.bank-search');
    const results = wrap.querySelector('.bank-results');

    const renderList = (list) => {
      if (!list.length) {
        results.innerHTML = `
          <div class="bank-row bank-row-custom" data-custom="1">
            Lưu giá trị tự do: <strong>${escapeHtml(search.value)}</strong>
          </div>`;
      } else {
        results.innerHTML = list.slice(0, 20).map((b) => `
          <div class="bank-row" data-abbr="${escapeHtml(b.abbr)}">
            <strong>${escapeHtml(b.abbr)}</strong> — ${escapeHtml(b.full)}
            <span class="bank-short">(${escapeHtml(b.short)})</span>
          </div>`).join('');
      }
      results.hidden = false;
    };

    search.addEventListener('focus', () => renderList(searchBanks(search.value)));
    search.addEventListener('input', () => {
      hidden.value = '';
      renderList(searchBanks(search.value));
    });
    search.addEventListener('blur', () => {
      // Defer so click registers before list disappears.
      setTimeout(() => { results.hidden = true; }, 150);
    });

    results.addEventListener('mousedown', (e) => {
      const row = e.target.closest('.bank-row');
      if (!row) return;
      if (row.dataset.custom === '1') {
        const free = search.value.trim();
        hidden.value = free;
      } else {
        const abbr = row.dataset.abbr;
        const b = BANKS.find((x) => x.abbr === abbr);
        if (b) {
          hidden.value = b.abbr;
          search.value = `${b.abbr} — ${b.full}`;
        }
      }
      results.hidden = true;
    });
  });
}
