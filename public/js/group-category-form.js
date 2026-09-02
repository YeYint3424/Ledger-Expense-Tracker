/* =========================================================
   GROUP CATEGORY FORM PAGE (add / edit — id from ?id= in URL)
   ========================================================= */
const editId = new URLSearchParams(location.search).get('id');
let cachedCategories = [];

function buildSwatchOptions(selectedColor) {
  const wrap = document.getElementById('swatchOptions');
  wrap.innerHTML = SWATCH_PALETTE.map((color) =>
    `<span class="swatch-dot ${color === selectedColor ? 'active' : ''}" style="background:${color}" data-color="${color}"></span>`
  ).join('');
  wrap.querySelectorAll('.swatch-dot').forEach((dot) => {
    dot.addEventListener('click', () => {
      document.getElementById('groupCategoryColor').value = dot.dataset.color;
      wrap.querySelectorAll('.swatch-dot').forEach((d) => d.classList.remove('active'));
      dot.classList.add('active');
    });
  });
}

function setNameError(message) {
  const input = document.getElementById('groupCategoryName');
  const errorEl = document.getElementById('groupCategoryNameError');
  if (message) {
    input.classList.add('input-invalid');
    errorEl.textContent = message;
    errorEl.hidden = false;
  } else {
    input.classList.remove('input-invalid');
    errorEl.textContent = '';
    errorEl.hidden = true;
  }
}

function validateNameField() {
  const id = document.getElementById('groupCategoryId').value;
  const name = document.getElementById('groupCategoryName').value;
  if (!name.trim()) { setNameError(null); return true; }
  const trimmed = name.trim().toLowerCase();
  const dupe = cachedCategories.find((c) => c.name.trim().toLowerCase() === trimmed && c.id !== id);
  if (dupe) { setNameError(`"${dupe.name}" already exists — choose a different name.`); return false; }
  setNameError(null);
  return true;
}

document.getElementById('groupCategoryName').addEventListener('input', validateNameField);

async function loadForm() {
  cachedCategories = await getGroupCategories();
  const cat = editId ? cachedCategories.find((c) => c.id === editId) : null;
  document.getElementById('groupCategoryFormTitle').textContent = cat ? 'Edit category' : 'Add category';
  document.title = (cat ? 'Edit category' : 'Add category') + ' — Ledger';
  document.getElementById('groupCategoryId').value = cat ? cat.id : '';
  document.getElementById('groupCategoryName').value = cat ? cat.name : '';
  const color = cat ? cat.color : randomCategoryColor();
  document.getElementById('groupCategoryColor').value = color;
  buildSwatchOptions(color);
  setNameError(null);
}

document.getElementById('groupCategoryForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('groupCategoryId').value;
  const name = document.getElementById('groupCategoryName').value.trim();
  const color = document.getElementById('groupCategoryColor').value;

  if (!name || !validateNameField()) {
    document.getElementById('groupCategoryName').focus();
    return;
  }

  try {
    if (id) {
      await updateGroupCategory(id, { name, color });
    } else {
      const { category, reused } = await createGroupCategory({ name, color });
      if (reused) {
        setNameError(`"${category.name}" already exists — choose a different name.`);
        return;
      }
    }
    location.href = 'group-categories.html';
  } catch (err) {
    setNameError(err.message || 'Failed to save category.');
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
