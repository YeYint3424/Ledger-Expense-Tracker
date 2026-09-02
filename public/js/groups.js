/* =========================================================
   GROUPS LIST PAGE
   ========================================================= */
async function renderGroups() {
  const [groups, categories] = await Promise.all([getGroups(), getGroupCategories()]);
  const grid = document.getElementById('groupGrid');
  const empty = document.getElementById('groupEmpty');

  if (!groups.length) {
    grid.innerHTML = '';
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  grid.innerHTML = groups.map((g) => {
    const cat = g.categoryId ? categories.find((c) => c.id === g.categoryId) : null;
    return `
      <a class="group-card" style="--tab-color:${cat ? cat.color : '#8FA096'}" href="group-detail.html?id=${g.id}">
        <div class="group-card-head">
          <span class="group-card-name">${escapeHtml(g.name)}</span>
          ${cat ? `<span class="group-card-tag">${escapeHtml(cat.name)}</span>` : ''}
        </div>
        ${g.description ? `<p class="group-card-desc">${escapeHtml(g.description)}</p>` : ''}
        <div class="group-card-foot">
          <span>${g.members.length} member${g.members.length === 1 ? '' : 's'}</span>
        </div>
      </a>`;
  }).join('');
}

async function init() {
  const user = await requireAuthOrRedirect();
  if (!user) return;
  try {
    await renderGroups();
  } catch (err) {
    showToast(err.message || 'Failed to load groups.');
  }
}

init();
