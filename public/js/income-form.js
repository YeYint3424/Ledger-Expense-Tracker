const incomeForm = document.getElementById('incomeForm');
const editId = new URLSearchParams(location.search).get('id');
wireThousandsInput(document.getElementById('incomeAmount'));

async function loadIncomeForm() {
  let tx = null;
  if (editId) {
    try {
      const found = await getTransaction(editId);
      if (found.type === 'income') tx = found;
    } catch (e) {
      tx = null;
    }
  }
  document.getElementById('incomeFormTitle').textContent = tx ? 'Edit income' : 'Add income';
  document.title = (tx ? 'Edit income' : 'Add income') + ' — Ledger';
  document.getElementById('incomeId').value = tx ? tx.id : '';
  document.getElementById('incomeName').value = tx ? tx.name : '';
  setAmountInputValue(document.getElementById('incomeAmount'), tx ? tx.amount : '');
  document.getElementById('incomeDate').value = tx ? tx.date : todayISO();
  document.getElementById('incomeTime').value = tx ? tx.time : nowTime();
  document.getElementById('incomeDescription').value = tx ? (tx.description || '') : '';
}

incomeForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('incomeId').value;
  const payload = {
    type: 'income',
    name: document.getElementById('incomeName').value.trim(),
    amount: parseAmountInput(document.getElementById('incomeAmount')),
    date: document.getElementById('incomeDate').value,
    time: document.getElementById('incomeTime').value,
    description: document.getElementById('incomeDescription').value.trim(),
    categoryId: null,
  };
  try {
    if (id) await updateTransaction(id, payload);
    else await createTransaction(payload);
    location.href = 'transactions.html';
  } catch (err) {
    showToast(err.message || 'Failed to save income.');
  }
});

async function init() {
  const user = await requireAuthOrRedirect();
  if (!user) return;
  try {
    await loadIncomeForm();
  } catch (err) {
    showToast(err.message || 'Failed to load form.');
  }
}

init();
