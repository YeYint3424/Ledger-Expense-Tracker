/* =========================================================
   OUTCOME FORM PAGE (add / edit — id comes from ?id= in URL)
   ========================================================= */
const outcomeForm = document.getElementById('outcomeForm');
const editId = new URLSearchParams(location.search).get('id');
let cachedCategories = [];

async function populateOutcomeCategorySelect(selectedId) {
  cachedCategories = await getCategories();
  const sel = document.getElementById('outcomeCategorySelect');
  sel.innerHTML = '<option value="" disabled>Choose a category…</option>' +
    cachedCategories.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('') +
    '<option value="__new__">➕ Add new category…</option>';
  sel.value = selectedId || '';
}

function findCachedDuplicate(name) {
  const trimmed = (name || '').trim().toLowerCase();
  if (!trimmed) return null;
  return cachedCategories.find(c => c.name.trim().toLowerCase() === trimmed) || null;
}

document.getElementById('outcomeCategorySelect').addEventListener('change', (e) => {
  const newInput = document.getElementById('outcomeCategoryNew');
  const note = document.getElementById('outcomeCategoryNewNote');
  if (e.target.value === '__new__') {
    newInput.hidden = false;
    newInput.required = true;
    newInput.focus();
  } else {
    newInput.hidden = true;
    newInput.required = false;
    newInput.value = '';
    note.hidden = true;
  }
});

document.getElementById('outcomeCategoryNew').addEventListener('input', (e) => {
  const note = document.getElementById('outcomeCategoryNewNote');
  const dupe = findCachedDuplicate(e.target.value);
  if (dupe) {
    note.textContent = `Matches existing category "${dupe.name}" — that one will be used instead of creating a duplicate.`;
    note.hidden = false;
  } else {
    note.hidden = true;
  }
});

async function loadOutcomeForm() {
  let tx = null;
  if (editId) {
    try {
      const found = await getTransaction(editId);
      if (found.type === 'outcome') tx = found;
    } catch (e) {
      tx = null;
    }
  }
  document.getElementById('outcomeFormTitle').textContent = tx ? 'Edit outcome' : 'Add outcome';
  document.title = (tx ? 'Edit outcome' : 'Add outcome') + ' — Ledger';
  document.getElementById('outcomeId').value = tx ? tx.id : '';
  document.getElementById('outcomeName').value = tx ? tx.name : '';
  document.getElementById('outcomeAmount').value = tx ? tx.amount : '';
  document.getElementById('outcomeDate').value = tx ? tx.date : todayISO();
  document.getElementById('outcomeTime').value = tx ? tx.time : nowTime();
  document.getElementById('outcomeDescription').value = tx ? (tx.description || '') : '';
  await populateOutcomeCategorySelect(tx ? tx.categoryId : '');
  document.getElementById('outcomeCategoryNew').hidden = true;
  document.getElementById('outcomeCategoryNew').required = false;
  document.getElementById('outcomeCategoryNew').value = '';
  document.getElementById('outcomeCategoryNewNote').hidden = true;
}

outcomeForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('outcomeId').value;
  const select = document.getElementById('outcomeCategorySelect');
  let categoryId = select.value;

  try {
    if (categoryId === '__new__') {
      const newName = document.getElementById('outcomeCategoryNew').value.trim();
      if (!newName) { showToast('Enter a category name'); return; }
      // Server creates it, or returns the existing one if the name already exists —
      // this is what keeps category_localStorage-style data free of duplicates.
      const { category } = await createCategory({ name: newName, color: randomCategoryColor() });
      categoryId = category.id;
    }
    if (!categoryId) { showToast('Please choose a category'); return; }

    const payload = {
      type: 'outcome',
      name: document.getElementById('outcomeName').value.trim(),
      amount: parseFloat(document.getElementById('outcomeAmount').value) || 0,
      date: document.getElementById('outcomeDate').value,
      time: document.getElementById('outcomeTime').value,
      description: document.getElementById('outcomeDescription').value.trim(),
      categoryId,
    };

    if (id) await updateTransaction(id, payload);
    else await createTransaction(payload);
    location.href = 'transactions.html';
  } catch (err) {
    showToast(err.message || 'Failed to save outcome.');
  }
});

async function init() {
  const user = await requireAuthOrRedirect();
  if (!user) return;
  try {
    await loadOutcomeForm();
  } catch (err) {
    showToast(err.message || 'Failed to load form.');
  }
}

init();
