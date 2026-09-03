const editId = new URLSearchParams(location.search).get('id');
let cachedCategories = [];

function buildSwatchOptions(selectedColor) {
  const wrap = document.getElementById('swatchOptions');
  wrap.innerHTML = SWATCH_PALETTE.map(color =>
    `<span class="swatch-dot ${color === selectedColor ? 'active' : ''}" style="background:${color}" data-color="${color}"></span>`
  ).join('');
  wrap.querySelectorAll('.swatch-dot').forEach(dot => {
    dot.addEventListener('click', () => {
      document.getElementById('categoryColor').value = dot.dataset.color;
      wrap.querySelectorAll('.swatch-dot').forEach(d => d.classList.remove('active'));
      dot.classList.add('active');
    });
  });
}

function setCategoryNameError(message) {
  const input = document.getElementById('categoryName');
  const errorEl = document.getElementById('categoryNameError');
  if (message) {
    input.classList.add('input-invalid');
    input.setAttribute('aria-invalid', 'true');
    errorEl.textContent = message;
    errorEl.hidden = false;
  } else {
    input.classList.remove('input-invalid');
    input.removeAttribute('aria-invalid');
    errorEl.textContent = '';
    errorEl.hidden = true;
  }
}

function validateCategoryNameField() {
  const id = document.getElementById('categoryId').value;
  const name = document.getElementById('categoryName').value;
  if (!name.trim()) {
    setCategoryNameError(null);
    return true;
  }
  const trimmed = name.trim().toLowerCase();
  const dupe = cachedCategories.find(c => c.name.trim().toLowerCase() === trimmed && c.id !== id);
  if (dupe) {
    setCategoryNameError(`"${dupe.name}" already exists — choose a different name.`);
    return false;
  }
  setCategoryNameError(null);
  return true;
}

document.getElementById('categoryName').addEventListener('input', validateCategoryNameField);

async function loadCategoryForm() {
  cachedCategories = await getCategories();
  const cat = editId ? cachedCategories.find(c => c.id === editId) : null;
  document.getElementById('categoryFormTitle').textContent = cat ? 'Edit category' : 'Add category';
  document.title = (cat ? 'Edit category' : 'Add category') + ' — Ledger';
  document.getElementById('categoryId').value = cat ? cat.id : '';
  document.getElementById('categoryName').value = cat ? cat.name : '';
  const color = cat ? cat.color : randomCategoryColor();
  document.getElementById('categoryColor').value = color;
  buildSwatchOptions(color);
  setCategoryNameError(null);
}

document.getElementById('categoryForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('categoryId').value;
  const name = document.getElementById('categoryName').value.trim();
  const color = document.getElementById('categoryColor').value;

  if (!name) {
    document.getElementById('categoryName').focus();
    return;
  }
  if (!validateCategoryNameField()) {
    document.getElementById('categoryName').focus();
    return;
  }

  try {
    if (id) {
      await updateCategory(id, { name, color });
    } else {
      const { category, reused } = await createCategory({ name, color });
      if (reused) {
        setCategoryNameError(`"${category.name}" already exists — choose a different name.`);
        document.getElementById('categoryName').focus();
        return;
      }
    }
    location.href = 'categories.html';
  } catch (err) {
    setCategoryNameError(err.message || 'Failed to save category.');
  }
});

async function init() {
  const user = await requireAuthOrRedirect();
  if (!user) return;
  try {
    await loadCategoryForm();
  } catch (err) {
    showToast(err.message || 'Failed to load form.');
  }
}

init();
