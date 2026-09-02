/* =========================================================
   GROUP DETAIL PAGE
   ========================================================= */
const groupId = new URLSearchParams(location.search).get('id');
let currentUserId = null;
let currentGroup = null;

if (!groupId) location.href = 'groups.html';

/* ---- header / members / balances ---- */

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
  populateExpenseFormMemberFields(group);
}

function renderMembers(group) {
  const isAdmin = group.members.some((m) => m.userId === currentUserId && m.role === 'admin');
  document.getElementById('memberList').innerHTML = group.members.map((m) => `
    <div class="member-chip">
      <div>
        <span class="member-chip-name">${escapeHtml(m.name)}</span>
        <span class="member-chip-role">${m.role === 'admin' ? 'Admin' : ''}</span>
        <div class="member-chip-email">${escapeHtml(m.email)}</div>
      </div>
      ${(isAdmin || m.userId === currentUserId) ? `<button class="btn-icon danger" data-remove-member="${m.userId}" title="${m.userId === currentUserId ? 'Leave group' : 'Remove'}">✕</button>` : ''}
    </div>`).join('');

  document.querySelectorAll('[data-remove-member]').forEach((btn) => {
    btn.addEventListener('click', () => removeMember(btn.dataset.removeMember));
  });
}

document.getElementById('addMemberForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const emailInput = document.getElementById('addMemberEmail');
  try {
    const group = await addGroupMember(groupId, emailInput.value.trim());
    currentGroup = group;
    emailInput.value = '';
    showToast('Member added');
    renderMembers(group);
    populateExpenseFormMemberFields(group);
    await loadGroupHeader();
  } catch (err) {
    showToast(err.message || 'Failed to add member.');
  }
});

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

async function renderBalances() {
  try {
    const { balances, totalSpent } = await getGroupBalances(groupId);
    const totalSpentFigure = document.getElementById('totalSpentFigure');
    if (totalSpentFigure) totalSpentFigure.textContent = formatMoney(totalSpent);

    document.getElementById('balanceList').innerHTML = balances.map((b) => {
      const cls = b.balance > 0.004 ? 'positive' : b.balance < -0.004 ? 'negative' : 'zero';
      const label = b.balance > 0.004 ? 'is owed' : b.balance < -0.004 ? 'owes' : 'settled up';
      return `
        <div class="balance-row">
          <span>${escapeHtml(b.name)} <span style="color:var(--ink-500); font-weight:400;">${label}</span></span>
          <span class="balance-amount ${cls}">${formatMoney(Math.abs(b.balance))}</span>
        </div>`;
    }).join('');
  } catch (err) {
    showToast(err.message || 'Failed to load balances.');
  }
}

/* ---- expenses (categories come from the personal categories table) ---- */

function populateExpenseFormMemberFields(group) {
  const paidBySel = document.getElementById('expensePaidBy');
  paidBySel.innerHTML = group.members.map((m) => `<option value="${m.userId}">${escapeHtml(m.name)}</option>`).join('');
  paidBySel.value = currentUserId;

  document.getElementById('splitBetweenList').innerHTML = group.members.map((m) => `
    <label class="member-chip" style="cursor:pointer;">
      <span class="member-chip-name">${escapeHtml(m.name)}</span>
      <input type="checkbox" class="split-checkbox" value="${m.userId}" checked style="width:18px; height:18px;">
    </label>`).join('');
}

/**
 * Populates the category select from the signed-in user's own personal categories
 * (the same list used on the Outcome form). `selected` can be omitted, a plain
 * category id (string), or a populated {id,name,color} object — the latter is
 * used when editing an expense whose category might belong to a different
 * member, so it's shown even if it's not in the current viewer's own list.
 */
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

document.getElementById('expenseCategorySelect').addEventListener('change', (e) => {
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
});

document.getElementById('expenseCategoryNew').addEventListener('input', async (e) => {
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
});

async function resetExpenseForm() {
  document.getElementById('expenseId').value = '';
  document.getElementById('expenseName').value = '';
  document.getElementById('expenseAmount').value = '';
  document.getElementById('expenseDate').value = todayISO();
  document.getElementById('expenseTime').value = nowTime();
  document.getElementById('expenseDescription').value = '';
  document.getElementById('expenseCategoryNew').hidden = true;
  document.getElementById('expenseCategoryNew').required = false;
  document.getElementById('expenseCategoryNew').value = '';
  document.getElementById('expenseCategoryNewNote').hidden = true;
  await populateExpenseCategorySelect();
  if (currentGroup) populateExpenseFormMemberFields(currentGroup);
}

document.getElementById('toggleExpenseFormBtn').addEventListener('click', async () => {
  const form = document.getElementById('expenseForm');
  const opening = form.hidden;
  if (opening) await resetExpenseForm();
  form.hidden = !opening;
});
document.getElementById('cancelExpenseFormBtn').addEventListener('click', () => {
  document.getElementById('expenseForm').hidden = true;
});

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

  const splitBetween = Array.from(document.querySelectorAll('.split-checkbox:checked')).map((cb) => cb.value);
  if (!splitBetween.length) { showToast('Pick at least one person to split with.'); return; }

  const payload = {
    name: document.getElementById('expenseName').value.trim(),
    amount: parseFloat(document.getElementById('expenseAmount').value) || 0,
    date: document.getElementById('expenseDate').value,
    time: document.getElementById('expenseTime').value,
    description: document.getElementById('expenseDescription').value.trim(),
    paidBy: document.getElementById('expensePaidBy').value,
    categoryId,
    splitBetween,
  };

  try {
    if (id) await updateGroupExpense(groupId, id, payload);
    else await createGroupExpense(groupId, payload);
    document.getElementById('expenseForm').hidden = true;
    showToast(id ? 'Expense updated' : 'Expense added');
    await Promise.all([renderExpenses(), renderBalances(), loadGroupHeader()]);
  } catch (err) {
    showToast(err.message || 'Failed to save expense.');
  }
});

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
    const cat = e.categoryId; // populated by the server: {id, name, color}
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

async function editExpense(id, expenses) {
  const expense = expenses.find((e) => e.id === id);
  if (!expense) return;
  populateExpenseFormMemberFields(currentGroup);
  await populateExpenseCategorySelect(expense.categoryId);
  document.getElementById('expenseId').value = expense.id;
  document.getElementById('expenseName').value = expense.name;
  document.getElementById('expenseAmount').value = expense.amount;
  document.getElementById('expenseDate').value = expense.date;
  document.getElementById('expenseTime').value = expense.time;
  document.getElementById('expenseDescription').value = expense.description || '';
  document.getElementById('expensePaidBy').value = expense.paidBy;
  document.getElementById('expenseCategoryNew').hidden = true;
  document.getElementById('expenseCategoryNew').required = false;
  document.querySelectorAll('.split-checkbox').forEach((cb) => {
    cb.checked = expense.splitBetween.includes(cb.value);
  });
  document.getElementById('expenseForm').hidden = false;
  document.getElementById('expenseForm').scrollIntoView({ behavior: 'smooth' });
}

async function deleteExpense(id) {
  const ok = await confirmModal({ message: "Delete this expense? This can't be undone.", confirmLabel: 'Delete expense' });
  if (!ok) return;
  try {
    await deleteGroupExpenseApi(groupId, id);
    showToast('Expense deleted');
    await Promise.all([renderExpenses(), renderBalances(), loadGroupHeader()]);
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
    await Promise.all([renderExpenses(), renderBalances()]);
    await initChat();
  } catch (err) {
    showToast(err.message || 'Failed to load group.');
  }
}

init();
