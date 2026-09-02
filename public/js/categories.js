/* =========================================================
   CATEGORIES PAGE (CRUD)
   ========================================================= */
async function renderCategoriesPage() {
  const [categories, txs] = await Promise.all([getCategories(), getTransactions()]);
  const grid = document.getElementById('categoryManageGrid');
  const empty = document.getElementById('categoryManageEmpty');

  if (!categories.length) {
    grid.innerHTML = '';
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  grid.innerHTML = categories.map(c => {
    const relatedTx = txs.filter(t => t.categoryId === c.id);
    const total = relatedTx.reduce((s, t) => s + Number(t.amount), 0);
    return `
      <div class="category-manage-card">
        <div class="cmc-head">
          <span class="cmc-swatch" style="background:${c.color}"></span>
          <span class="cmc-name">${escapeHtml(c.name)}</span>
        </div>
        <div class="cmc-stats">${relatedTx.length} transaction${relatedTx.length === 1 ? '' : 's'} · ${formatMoney(total)} total</div>
        <div class="cmc-actions">
          <a class="btn btn-ghost btn-sm" href="category-form.html?id=${c.id}">Edit</a>
          <button class="btn btn-icon danger btn-sm" data-del-cat="${c.id}" title="Delete">🗑</button>
        </div>
      </div>`;
  }).join('');

  grid.querySelectorAll('[data-del-cat]').forEach(btn => {
    btn.addEventListener('click', () => deleteCategory(btn.dataset.delCat));
  });
}

async function deleteCategory(id) {
  const txs = await getTransactions();
  const inUse = txs.filter(t => t.categoryId === id).length;
  const msg = inUse
    ? `${inUse} transaction${inUse === 1 ? '' : 's'} use this category. Deleting it will mark them "Uncategorized". Continue?`
    : "Delete this category? This can't be undone.";
  if (!(await confirmModal({ message: msg, confirmLabel: 'Delete category' }))) return;
  try {
    await deleteCategoryApi(id);
    showToast('Category deleted');
    await renderCategoriesPage();
  } catch (err) {
    showToast(err.message || 'Failed to delete category.');
  }
}

async function init() {
  const user = await requireAuthOrRedirect();
  if (!user) return;
  try {
    await renderCategoriesPage();
  } catch (err) {
    showToast(err.message || 'Failed to load categories.');
  }
}

init();
