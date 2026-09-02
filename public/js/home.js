/* =========================================================
   HOME PAGE
   ========================================================= */
async function populateHomeMonthFilter(allTxs) {
  const sel = document.getElementById('homeMonthFilter');
  const months = Array.from(new Set(allTxs.map(t => monthKey(t.date)))).filter(Boolean).sort().reverse();
  const prevValue = sel.value;
  sel.innerHTML = '<option value="all">All time</option>' + months.map(m => {
    const label = new Date(m + '-01').toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    return `<option value="${m}">${label}</option>`;
  }).join('');
  sel.value = months.includes(prevValue) || prevValue === 'all' ? prevValue : 'all';
}

async function renderHome() {
  const [allTxs, categories] = await Promise.all([getTransactions(), getCategories()]);
  await populateHomeMonthFilter(allTxs);

  const monthFilter = document.getElementById('homeMonthFilter').value || 'all';
  const txs = allTxs.filter(t => monthFilter === 'all' || monthKey(t.date) === monthFilter);

  const totalIncome = txs.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
  const totalOutcome = txs.filter(t => t.type === 'outcome').reduce((s, t) => s + Number(t.amount), 0);
  const balance = totalIncome - totalOutcome;

  document.getElementById('summaryRow').innerHTML = `
    <div class="summary-card" style="--card-accent:var(--income)">
      <div class="summary-label">Total income</div>
      <div class="summary-figure income">${formatMoney(totalIncome)}</div>
    </div>
    <div class="summary-card" style="--card-accent:var(--outcome)">
      <div class="summary-label">Total outcome</div>
      <div class="summary-figure outcome">${formatMoney(totalOutcome)}</div>
    </div>
    <div class="summary-card" style="--card-accent:var(--gold)">
      <div class="summary-label">Balance</div>
      <div class="summary-figure">${formatMoney(balance)}</div>
    </div>
  `;

  const outcomeTx = txs.filter(t => t.type === 'outcome');
  const totalsByCategory = {};
  outcomeTx.forEach(t => {
    const key = t.categoryId || 'uncategorized';
    if (!totalsByCategory[key]) totalsByCategory[key] = { total: 0, count: 0 };
    totalsByCategory[key].total += Number(t.amount);
    totalsByCategory[key].count += 1;
  });

  const grid = document.getElementById('categorySpendGrid');
  const emptyNote = document.getElementById('categorySpendEmpty');
  const entries = Object.entries(totalsByCategory).sort((a, b) => b[1].total - a[1].total);

  if (!entries.length) {
    grid.innerHTML = '';
    emptyNote.hidden = false;
  } else {
    emptyNote.hidden = true;
    const maxTotal = Math.max(...entries.map(e => e[1].total));
    grid.innerHTML = entries.map(([catId, data]) => {
      const cat = catId === 'uncategorized' ? { name: 'Uncategorized', color: '#8FA096' } : categories.find(c => c.id === catId);
      if (!cat) return '';
      const pct = maxTotal ? Math.round((data.total / maxTotal) * 100) : 0;
      return `
        <a class="ledger-tab-card" style="--tab-color:${cat.color}" href="transactions.html?type=outcome&category=${encodeURIComponent(catId)}">
          <div class="tab-card-head">
            <span class="tab-card-name">${escapeHtml(cat.name)}</span>
            <span class="tab-card-count">${data.count} tx</span>
          </div>
          <div class="tab-card-amount">${formatMoney(data.total)}</div>
          <div class="tab-card-bar"><div class="tab-card-bar-fill" style="width:${pct}%; background:${cat.color}"></div></div>
        </a>`;
    }).join('');
  }

  renderHomeRecentTable(txs, categories);
}

function renderHomeRecentTable(txs, categories) {
  const tbody = document.getElementById('homeRecentTableBody');
  const empty = document.getElementById('homeRecentEmpty');
  const recent = [...txs]
    .sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || '')))
    .slice(0, 10);

  if (!recent.length) {
    tbody.innerHTML = '';
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  tbody.innerHTML = recent.map(t => {
    const cat = t.categoryId ? categories.find(c => c.id === t.categoryId) : null;
    const catChip = t.type === 'outcome'
      ? `<span class="cat-chip"><span class="cat-dot" style="background:${cat ? cat.color : '#8FA096'}"></span>${cat ? escapeHtml(cat.name) : 'Uncategorized'}</span>`
      : '<span class="cat-chip" style="color:var(--ink-300)">—</span>';
    return `
      <tr>
        <td>
          <span class="type-badge ${t.type}">${t.type === 'income' ? 'In' : 'Out'}</span>
          <span class="tx-name">${escapeHtml(t.name)}</span>
        </td>
        <td>${catChip}</td>
        <td class="date-cell">${formatDateTime(t.date, t.time)}</td>
        <td class="num ${t.type}">${t.type === 'income' ? '+' : '−'}${formatMoney(t.amount)}</td>
      </tr>`;
  }).join('');
}

async function init() {
  const user = await requireAuthOrRedirect();
  if (!user) return;
  document.getElementById('homeMonthFilter').addEventListener('change', renderHome);
  try {
    await renderHome();
  } catch (err) {
    showToast(err.message || 'Failed to load your data.');
  }
}

init();
