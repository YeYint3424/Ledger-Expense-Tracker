const editId = new URLSearchParams(location.search).get('id');
const groupForm = document.getElementById('groupForm');

async function populateCategorySelect(selectedId) {
  const categories = await getGroupCategories();
  const sel = document.getElementById('groupCategorySelect');
  sel.innerHTML = '<option value="">No category</option>' +
    categories.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
  sel.value = selectedId || '';
}

async function loadForm() {
  let group = null;
  if (editId) {
    try { group = await getGroup(editId); } catch (e) { group = null; }
  }
  document.getElementById('groupFormTitle').textContent = group ? 'Edit group' : 'Create group';
  document.title = (group ? 'Edit group' : 'Create group') + ' — Ledger';
  document.getElementById('groupId').value = group ? group.id : '';
  document.getElementById('groupName').value = group ? group.name : '';
  document.getElementById('groupDescription').value = group ? (group.description || '') : '';
  await populateCategorySelect(group ? group.categoryId : '');
}

groupForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('groupId').value;
  const payload = {
    name: document.getElementById('groupName').value.trim(),
    description: document.getElementById('groupDescription').value.trim(),
    categoryId: document.getElementById('groupCategorySelect').value || null,
  };
  try {
    let group;
    if (id) group = await updateGroup(id, payload);
    else group = await createGroup(payload);
    location.href = `group-detail.html?id=${group.id}`;
  } catch (err) {
    showToast(err.message || 'Failed to save group.');
  }
});

async function init() {
  const user = await requireAuthOrRedirect();
  if (!user) return;
  try {
    await loadForm();
  } catch (err) {
    showToast(err.message || 'Failed to load form.');
  }
}

init();
