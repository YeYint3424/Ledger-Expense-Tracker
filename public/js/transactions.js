/* =========================================================
   TRANSACTIONS PAGE
   ========================================================= */
async function populateFilterCategorySelect() {
  const sel = document.getElementById('filterCategory');
  const prev = sel.value;
  const categories = await getCategories();
  sel.innerHTML = '<option value="all">All</option>' +
    categories.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
  sel.value = categories.some(c => c.id === prev) ? prev : 'all';
  return categories;
}

function getFilterParams() {
  return {
    name: document.getElementById('filterName').value.trim(),
    type: document.getElementById('filterType').value,
    category: document.getElementById('filterCategory').value,
    from: document.getElementById('filterFrom').value,
    to: document.getElementById('filterTo').value,
  };
}

async function renderTransactionsPage() {
  const filters = getFilterParams();
  const [list, categories] = await Promise.all([getTransactions(filters), getCategories()]);
  const tbody = document.getElementById('txTableBody');
  const empty = document.getElementById('txEmpty');

  if (!list.length) {
    tbody.innerHTML = '';
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  tbody.innerHTML = list.map(t => {
    const cat = t.categoryId ? categories.find(c => c.id === t.categoryId) : null;
    const catChip = t.type === 'outcome'
      ? `<span class="cat-chip"><span class="cat-dot" style="background:${cat ? cat.color : '#8FA096'}"></span>${cat ? escapeHtml(cat.name) : 'Uncategorized'}</span>`
      : '<span class="cat-chip" style="color:var(--ink-300)">—</span>';
    const editHref = t.type === 'income' ? `income-form.html?id=${t.id}` : `outcome-form.html?id=${t.id}`;
    return `
      <tr>
        <td>
          <span class="type-badge ${t.type}">${t.type === 'income' ? 'In' : 'Out'}</span>
          <span class="tx-name">${escapeHtml(t.name)}</span>
          ${t.description ? `<div class="tx-desc">${escapeHtml(t.description)}</div>` : ''}
        </td>
        <td>${catChip}</td>
        <td class="date-cell">${formatDateTime(t.date, t.time)}</td>
        <td class="num ${t.type}">${t.type === 'income' ? '+' : '−'}${formatMoney(t.amount)}</td>
        <td class="actions-col">
          <a class="btn-icon" href="${editHref}" title="Edit" style="display:inline-flex;">✎</a>
          <button class="btn-icon danger" data-del="${t.id}" title="Delete">🗑</button>
        </td>
      </tr>`;
  }).join('');

  tbody.querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', () => deleteTransaction(btn.dataset.del));
  });
}

async function deleteTransaction(id) {
  const ok = await confirmModal({ message: "Delete this transaction? This can't be undone.", confirmLabel: 'Delete transaction' });
  if (!ok) return;
  try {
    await deleteTransactionApi(id);
    showToast('Transaction deleted');
    await renderTransactionsPage();
  } catch (err) {
    showToast(err.message || 'Failed to delete transaction.');
  }
}

/* ---- filter apply / clear / mobile modal ---- */
function wireFilterControls() {
  ['filterName', 'filterType', 'filterCategory', 'filterFrom', 'filterTo'].forEach(id => {
    document.getElementById(id).addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); applyFilters(); }
    });
  });

  const filterBarBackdrop = document.getElementById('filterBarBackdrop');

  document.getElementById('filterToggleBtn').addEventListener('click', () => {
    filterBarBackdrop.classList.add('open');
  });
  document.getElementById('filterBarCloseBtn').addEventListener('click', () => {
    filterBarBackdrop.classList.remove('open');
  });
  filterBarBackdrop.addEventListener('click', (e) => {
    if (e.target === filterBarBackdrop) filterBarBackdrop.classList.remove('open');
  });

  document.getElementById('applyFiltersBtn').addEventListener('click', applyFilters);
  document.getElementById('clearFiltersBtn').addEventListener('click', async () => {
    document.getElementById('filterName').value = '';
    document.getElementById('filterType').value = 'all';
    document.getElementById('filterCategory').value = 'all';
    document.getElementById('filterFrom').value = '';
    document.getElementById('filterTo').value = '';
    await renderTransactionsPage();
    filterBarBackdrop.classList.remove('open');
  });
}

async function applyFilters() {
  await renderTransactionsPage();
  document.getElementById('filterBarBackdrop').classList.remove('open');
}

/* ---- prefill from query params (e.g. linked from a Home category card) ---- */
function applyQueryParamsToFilters() {
  const params = new URLSearchParams(location.search);
  const type = params.get('type');
  const category = params.get('category');
  if (type) document.getElementById('filterType').value = type;
  if (category) document.getElementById('filterCategory').value = category;
}

async function init() {
  const user = await requireAuthOrRedirect();
  if (!user) return;
  try {
    await populateFilterCategorySelect();
    applyQueryParamsToFilters();
    wireFilterControls();
    await renderTransactionsPage();
  } catch (err) {
    showToast(err.message || 'Failed to load transactions.');
  }
}

init();
