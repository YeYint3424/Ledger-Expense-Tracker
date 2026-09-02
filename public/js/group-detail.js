const groupId = new URLSearchParams(location.search).get('id');
let currentUserId = null;
let currentGroup = null;

if (!groupId) location.href = 'groups.html';

/* ---- header / members ---- */

async function loadGroupHeader() {
  const [group, categories] = await Promise.all([getGroup(groupId), getGroupCategories()]);
  currentGroup = group;
  document.getElementById('groupNameHeading').textContent = group.name;
  document.title = `${group.name} — Ledger`;
  const cat = group.categoryId ? categories.find((c) => c.id === group.categoryId) : null;
  document.getElementById('groupCategoryLabel').textContent = cat ? cat.name : 'Group';
  document.getElementById('editGroupLink').href = `group-form.html?id=${group.id}`;

  document.getElementById('groupSummaryRow').innerHTML = `
    <div class="summary-card" style="--card-accent:var(--gold)">
      <div class="summary-label">Members</div>
      <div class="summary-figure">${group.members.length}</div>
    </div>
    <div class="summary-card" style="--card-accent:var(--outcome)">
      <div class="summary-label">Total spent</div>
      <div class="summary-figure outcome" id="totalSpentFigure">—</div>
    </div>
    <div class="summary-card" style="--card-accent:var(--income)">
      <div class="summary-label">Created</div>
      <div class="summary-figure" style="font-size:16px;">${new Date(group.createdAt).toLocaleDateString(undefined, { month: 'short', day: '2-digit', year: 'numeric' })}</div>
    </div>
  `;

  renderMembers(group);
}

function renderMembers(group) {
  const isAdmin = group.members.some((m) => m.userId === currentUserId && m.role === 'admin');
  document.getElementById('memberList').innerHTML = group.members.map((m) => `
    <span class="member-badge" title="${escapeHtml(m.email)}">
      <span class="member-badge-name">${escapeHtml(m.name)}</span>
      ${m.role === 'admin' ? '<span class="member-badge-role">Admin</span>' : ''}
      ${(isAdmin || m.userId === currentUserId) ? `<button type="button" class="member-badge-remove" data-remove-member="${m.userId}" title="${m.userId === currentUserId ? 'Leave group' : 'Remove'}">✕</button>` : ''}
    </span>`).join('');

  document.querySelectorAll('[data-remove-member]').forEach((btn) => {
    btn.addEventListener('click', () => removeMember(btn.dataset.removeMember));
  });
}

function showAddMemberModal() {
  const backdrop = document.createElement('div');
  backdrop.className = 'confirm-modal-backdrop';
  backdrop.innerHTML = `
    <div class="confirm-modal member-modal" role="dialog" aria-modal="true" aria-labelledby="addMemberModalTitle">
      <h3 class="confirm-modal-title" id="addMemberModalTitle">Add a member</h3>
      <form id="addMemberModalForm">
        <div class="field">
          <label for="addMemberEmail">Email address</label>
          <input type="email" id="addMemberEmail" class="input" placeholder="someone@example.com" required />
        </div>
        <div class="confirm-modal-actions" style="margin-top: 20px">
          <button type="button" class="btn btn-ghost" data-action="cancel">Cancel</button>
          <button type="submit" class="btn btn-primary">Add</button>
        </div>
      </form>
    </div>`;
  document.body.appendChild(backdrop);

  function cleanup() {
    backdrop.remove();
    document.removeEventListener('keydown', onKeydown);
  }
  function onKeydown(e) {
    if (e.key === 'Escape') cleanup();
  }
  document.addEventListener('keydown', onKeydown);

  backdrop.querySelector('[data-action="cancel"]').addEventListener('click', cleanup);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) cleanup(); });

  const emailInput = backdrop.querySelector('#addMemberEmail');
  requestAnimationFrame(() => emailInput.focus());

  backdrop.querySelector('#addMemberModalForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const group = await addGroupMember(groupId, emailInput.value.trim());
      currentGroup = group;
      showToast('Member added');
      renderMembers(group);
      await loadGroupHeader();
      cleanup();
    } catch (err) {
      showToast(err.message || 'Failed to add member.');
    }
  });
}

document.getElementById('openAddMemberBtn').addEventListener('click', showAddMemberModal);

async function removeMember(userId) {
  const leavingSelf = userId === currentUserId;
  const ok = await confirmModal({
    title: leavingSelf ? 'Leave this group?' : 'Remove this member?',
    message: leavingSelf
      ? "You'll need to be re-added by another member to rejoin."
      : 'They can be added back later by any group member.',
    confirmLabel: leavingSelf ? 'Leave group' : 'Remove member',
  });
  if (!ok) return;
  try {
    const result = await removeGroupMember(groupId, userId);
    if (leavingSelf) { location.href = 'groups.html'; return; }
    showToast('Member removed');
    await loadGroupHeader();
    if (result.group) renderMembers(result.group);
  } catch (err) {
    showToast(err.message || 'Failed to remove member.');
  }
}

async function loadTotalSpent() {
  try {
    const { totalSpent } = await getGroupBalances(groupId);
    const totalSpentFigure = document.getElementById('totalSpentFigure');
    if (totalSpentFigure) totalSpentFigure.textContent = formatMoney(totalSpent);
  } catch (err) {
    showToast(err.message || 'Failed to load total spent.');
  }
}

/* ---- expenses (categories come from the personal categories table) ---- */

function populateExpenseFormMemberFields(group) {
  const paidBySel = document.getElementById('expensePaidBy');
  paidBySel.innerHTML = group.members.map((m) => `<option value="${m.userId}">${escapeHtml(m.name)}</option>`).join('');
  paidBySel.value = currentUserId;
}

async function populateExpenseCategorySelect(selected) {
  const categories = await getCategories();
  let options = categories.map((c) => ({ id: c.id, name: c.name }));
  let selectedId = '';

  if (selected) {
    if (typeof selected === 'string') {
      selectedId = selected;
    } else {
      selectedId = selected.id;
      if (!options.some((o) => o.id === selectedId)) {
        options = [{ id: selectedId, name: `${selected.name} (added by someone else)` }, ...options];
      }
    }
  }

  const sel = document.getElementById('expenseCategorySelect');
  sel.innerHTML = '<option value="" disabled selected>Choose a category…</option>' +
    options.map((o) => `<option value="${o.id}">${escapeHtml(o.name)}</option>`).join('') +
    '<option value="__new__">➕ Add new category…</option>';
  sel.value = selectedId || '';
}

function onExpenseCategoryChange(e) {
  const newInput = document.getElementById('expenseCategoryNew');
  const note = document.getElementById('expenseCategoryNewNote');
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
}

async function onExpenseCategoryNewInput(e) {
  const note = document.getElementById('expenseCategoryNewNote');
  const trimmed = e.target.value.trim().toLowerCase();
  if (!trimmed) { note.hidden = true; return; }
  const categories = await getCategories();
  const dupe = categories.find((c) => c.name.trim().toLowerCase() === trimmed);
  if (dupe) {
    note.textContent = `Matches existing category "${dupe.name}" — that one will be used instead of creating a duplicate.`;
    note.hidden = false;
  } else {
    note.hidden = true;
  }
}

function showExpenseModal(expense) {
  const backdrop = document.createElement('div');
  backdrop.className = 'confirm-modal-backdrop';
  backdrop.innerHTML = `
    <div class="confirm-modal expense-modal" role="dialog" aria-modal="true" aria-labelledby="expenseModalTitle">
      <h3 class="confirm-modal-title" id="expenseModalTitle">${expense ? 'Edit expense' : 'Add expense'}</h3>
      <form id="expenseForm">
        <input type="hidden" id="expenseId" />
        <div class="field">
          <label for="expenseName">Name<span class="req">*</span></label>
          <input type="text" id="expenseName" class="input" required placeholder="e.g. Hotel" />
        </div>
        <div class="field">
          <label for="expenseAmount">Amount<span class="req">*</span></label>
          <input type="text" inputmode="decimal" id="expenseAmount" class="input" required placeholder="0.00" />
        </div>
        <div class="field">
          <label for="expenseCategorySelect">Category<span class="req">*</span></label>
          <select id="expenseCategorySelect" class="select" required>
            <option value="" disabled selected>Choose a category…</option>
            <option value="__new__">➕ Add new category…</option>
          </select>
          <input type="text" id="expenseCategoryNew" class="input" placeholder="Type new category name…" hidden style="margin-top: 8px" />
          <span class="field-note" id="expenseCategoryNewNote" hidden></span>
        </div>
        <div class="field-row">
          <div class="field">
            <label for="expenseDate">Date<span class="req">*</span></label>
            <input type="date" id="expenseDate" class="input" required />
          </div>
          <div class="field">
            <label for="expenseTime">Time<span class="req">*</span></label>
            <input type="time" id="expenseTime" class="input" required />
          </div>
        </div>
        <div class="field">
          <label for="expensePaidBy">Paid by<span class="req">*</span></label>
          <select id="expensePaidBy" class="select" required></select>
        </div>
        <div class="field">
          <label for="expenseDescription">Description <span class="optional">(optional)</span></label>
          <textarea id="expenseDescription" class="input textarea" rows="2"></textarea>
        </div>
        <div class="confirm-modal-actions" style="margin-top: 20px">
          <button type="button" class="btn btn-ghost" data-action="cancel">Cancel</button>
          <button type="submit" class="btn btn-primary">${expense ? 'Save changes' : 'Save expense'}</button>
        </div>
      </form>
    </div>`;
  document.body.appendChild(backdrop);

  function cleanup() {
    backdrop.remove();
    document.removeEventListener('keydown', onKeydown);
  }
  function onKeydown(e) {
    if (e.key === 'Escape') cleanup();
  }
  document.addEventListener('keydown', onKeydown);
  backdrop.querySelector('[data-action="cancel"]').addEventListener('click', cleanup);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) cleanup(); });

  wireThousandsInput(document.getElementById('expenseAmount'));
  document.getElementById('expenseCategorySelect').addEventListener('change', onExpenseCategoryChange);
  document.getElementById('expenseCategoryNew').addEventListener('input', onExpenseCategoryNewInput);

  (async () => {
    populateExpenseFormMemberFields(currentGroup);
    await populateExpenseCategorySelect(expense ? expense.category : undefined);
    document.getElementById('expenseId').value = expense ? expense.id : '';
    document.getElementById('expenseName').value = expense ? expense.name : '';
    setAmountInputValue(document.getElementById('expenseAmount'), expense ? expense.amount : '');
    document.getElementById('expenseDate').value = expense ? expense.date : todayISO();
    document.getElementById('expenseTime').value = expense ? expense.time : nowTime();
    document.getElementById('expenseDescription').value = expense ? (expense.description || '') : '';
    if (expense) document.getElementById('expensePaidBy').value = expense.paidBy;
    requestAnimationFrame(() => document.getElementById('expenseName').focus());
  })();

  document.getElementById('expenseForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('expenseId').value;

    let categoryId = document.getElementById('expenseCategorySelect').value;
    if (categoryId === '__new__') {
      const newName = document.getElementById('expenseCategoryNew').value.trim();
      if (!newName) { showToast('Enter a category name'); return; }
      try {
        const { category } = await createCategory({ name: newName, color: randomCategoryColor() });
        categoryId = category.id;
      } catch (err) {
        showToast(err.message || 'Failed to create category.');
        return;
      }
    }
    if (!categoryId) { showToast('Please choose a category'); return; }

    const payload = {
      name: document.getElementById('expenseName').value.trim(),
      amount: parseAmountInput(document.getElementById('expenseAmount')),
      date: document.getElementById('expenseDate').value,
      time: document.getElementById('expenseTime').value,
      description: document.getElementById('expenseDescription').value.trim(),
      paidBy: document.getElementById('expensePaidBy').value,
      categoryId,
    };

    try {
      if (id) await updateGroupExpense(groupId, id, payload);
      else await createGroupExpense(groupId, payload);
      showToast(id ? 'Expense updated' : 'Expense added');
      cleanup();
      await Promise.all([renderExpenses(), loadTotalSpent(), loadGroupHeader()]);
    } catch (err) {
      showToast(err.message || 'Failed to save expense.');
    }
  });
}

document.getElementById('toggleExpenseFormBtn').addEventListener('click', () => showExpenseModal());

async function renderExpenses() {
  const expenses = await getGroupExpenses(groupId);
  const tbody = document.getElementById('expenseTableBody');
  const empty = document.getElementById('expenseEmpty');
  const memberMap = Object.fromEntries((currentGroup?.members || []).map((m) => [m.userId, m.name]));

  if (!expenses.length) {
    tbody.innerHTML = '';
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  tbody.innerHTML = expenses.map((e) => {
    const cat = e.category; // populated by the server: {id, name, color}
    const catChip = cat
      ? `<span class="cat-chip"><span class="cat-dot" style="background:${cat.color}"></span>${escapeHtml(cat.name)}</span>`
      : '<span class="cat-chip" style="color:var(--ink-300)">Uncategorized</span>';
    return `
      <tr>
        <td>
          <span class="tx-name">${escapeHtml(e.name)}</span>
          ${e.description ? `<div class="tx-desc">${escapeHtml(e.description)}</div>` : ''}
        </td>
        <td>${catChip}</td>
        <td>${escapeHtml(memberMap[e.paidBy] || 'Unknown')}</td>
        <td class="date-cell">${formatDateTime(e.date, e.time)}</td>
        <td class="num outcome">${formatMoney(e.amount)}</td>
        <td class="actions-col">
          <button class="btn-icon" data-edit-exp="${e.id}" title="Edit">✎</button>
          <button class="btn-icon danger" data-del-exp="${e.id}" title="Delete">🗑</button>
        </td>
      </tr>`;
  }).join('');

  tbody.querySelectorAll('[data-edit-exp]').forEach((btn) => {
    btn.addEventListener('click', () => editExpense(btn.dataset.editExp, expenses));
  });
  tbody.querySelectorAll('[data-del-exp]').forEach((btn) => {
    btn.addEventListener('click', () => deleteExpense(btn.dataset.delExp));
  });
}

function editExpense(id, expenses) {
  const expense = expenses.find((e) => e.id === id);
  if (!expense) return;
  showExpenseModal(expense);
}

async function deleteExpense(id) {
  const ok = await confirmModal({ message: "Delete this expense? This can't be undone.", confirmLabel: 'Delete expense' });
  if (!ok) return;
  try {
    await deleteGroupExpenseApi(groupId, id);
    showToast('Expense deleted');
    await Promise.all([renderExpenses(), loadTotalSpent(), loadGroupHeader()]);
  } catch (err) {
    showToast(err.message || 'Failed to delete expense.');
  }
}

/* ---- group chat (Socket.IO, via shared ChatUI) ---- */

async function initChat() {
  if (window.setActiveChatId) window.setActiveChatId(groupId);
  getSocket().emit('join-group', groupId);

  ChatUI.mount({
    containerEl: document.getElementById('chatMessages'),
    formEl: document.getElementById('chatForm'),
    inputEl: document.getElementById('chatInput'),
    currentUserId,
    room: groupId,
    scope: 'group',
    fetchHistory: () => getGroupMessages(groupId),
    resolveSenderName: (userId) => {
      const member = (currentGroup?.members || []).find((m) => m.userId === userId);
      return member ? member.name : null;
    },
  });
}

/* ---- init ---- */

async function init() {
  const user = await requireAuthOrRedirect();
  if (!user) return;
  currentUserId = user.id;

  try {
    await loadGroupHeader();
    await Promise.all([renderExpenses(), loadTotalSpent()]);
    await initChat();
  } catch (err) {
    showToast(err.message || 'Failed to load group.');
  }
}

init();
