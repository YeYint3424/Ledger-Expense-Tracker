async function renderGroupCategories() {
  const categories = await getGroupCategories();
  const grid = document.getElementById('groupCategoryGrid');
  const empty = document.getElementById('groupCategoryEmpty');

  if (!categories.length) {
    grid.innerHTML = '';
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  grid.innerHTML = categories.map((c) => `
    <div class="category-manage-card">
      <div class="cmc-head">
        <span class="cmc-swatch" style="background:${c.color}"></span>
        <span class="cmc-name">${escapeHtml(c.name)}</span>
      </div>
      <div class="cmc-actions">
        <a class="btn btn-ghost btn-sm" href="group-category-form.html?id=${c.id}">Edit</a>
        <button class="btn btn-icon danger btn-sm" data-del-cat="${c.id}" title="Delete">🗑</button>
      </div>
    </div>`).join('');

  grid.querySelectorAll('[data-del-cat]').forEach((btn) => {
    btn.addEventListener('click', () => deleteGroupCategory(btn.dataset.delCat));
  });
}

async function deleteGroupCategory(id) {
  const ok = await confirmModal({
    title: 'Delete this category?',
    message: 'Groups using it will show "No category" instead.',
    confirmLabel: 'Delete category',
  });
  if (!ok) return;
  try {
    await deleteGroupCategoryApi(id);
    showToast('Category deleted');
    await renderGroupCategories();
  } catch (err) {
    showToast(err.message || 'Failed to delete category.');
  }
}

async function init() {
  const user = await requireAuthOrRedirect();
  if (!user) return;
  try {
    await renderGroupCategories();
  } catch (err) {
    showToast(err.message || 'Failed to load categories.');
  }
}

init();
