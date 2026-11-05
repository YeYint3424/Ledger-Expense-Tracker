const expenseForm = document.getElementById("expenseForm");
const editId = new URLSearchParams(location.search).get("id");
let cachedCategories = [];
wireThousandsInput(document.getElementById("expenseAmount"));

async function populateExpenseCategorySelect(selectedId) {
  cachedCategories = await getCategories();
  const sel = document.getElementById("expenseCategorySelect");
  sel.innerHTML =
    '<option value="" disabled>Choose a category…</option>' +
    cachedCategories
      .map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`)
      .join("") +
    '<option value="__new__">➕ Add new category…</option>';
  sel.value = selectedId || "";
}

function findCachedDuplicate(name) {
  const trimmed = (name || "").trim().toLowerCase();
  if (!trimmed) return null;
  return (
    cachedCategories.find((c) => c.name.trim().toLowerCase() === trimmed) ||
    null
  );
}

document
  .getElementById("expenseCategorySelect")
  .addEventListener("change", (e) => {
    const newInput = document.getElementById("expenseCategoryNew");
    const note = document.getElementById("expenseCategoryNewNote");
    if (e.target.value === "__new__") {
      newInput.hidden = false;
      newInput.required = true;
      newInput.focus();
    } else {
      newInput.hidden = true;
      newInput.required = false;
      newInput.value = "";
      note.hidden = true;
    }
  });

document.getElementById("expenseCategoryNew").addEventListener("input", (e) => {
  const note = document.getElementById("expenseCategoryNewNote");
  const dupe = findCachedDuplicate(e.target.value);
  if (dupe) {
    note.textContent = `Matches existing category "${dupe.name}" — that one will be used instead of creating a duplicate.`;
    note.hidden = false;
  } else {
    note.hidden = true;
  }
});

async function loadExpenseForm() {
  let tx = null;
  if (editId) {
    try {
      const found = await getTransaction(editId);
      if (found.type === "expense") tx = found;
    } catch (e) {
      tx = null;
    }
  }
  document.getElementById("expenseFormTitle").textContent = tx
    ? "Edit expense"
    : "Add expense";
  document.title = (tx ? "Edit expense" : "Add expense") + " — Ledger";
  document.getElementById("expenseId").value = tx ? tx.id : "";
  document.getElementById("expenseName").value = tx ? tx.name : "";
  setAmountInputValue(
    document.getElementById("expenseAmount"),
    tx ? tx.amount : "",
  );
  document.getElementById("expenseDate").value = tx ? tx.date : todayISO();
  document.getElementById("expenseTime").value = tx ? tx.time : nowTime();
  document.getElementById("expenseDescription").value = tx
    ? tx.description || ""
    : "";
  await populateExpenseCategorySelect(tx ? tx.categoryId : "");
  document.getElementById("expenseCategoryNew").hidden = true;
  document.getElementById("expenseCategoryNew").required = false;
  document.getElementById("expenseCategoryNew").value = "";
  document.getElementById("expenseCategoryNewNote").hidden = true;
}

expenseForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("expenseId").value;
  const select = document.getElementById("expenseCategorySelect");
  let categoryId = select.value;

  try {
    if (categoryId === "__new__") {
      const newName = document
        .getElementById("expenseCategoryNew")
        .value.trim();
      if (!newName) {
        showToast("Enter a category name");
        return;
      }
      // Server creates it, or returns the existing one if the name already exists —
      // this is what keeps category_localStorage-style data free of duplicates.
      const { category } = await createCategory({
        name: newName,
        color: randomCategoryColor(),
      });
      categoryId = category.id;
    }
    if (!categoryId) {
      showToast("Please choose a category");
      return;
    }

    const payload = {
      type: "expense",
      name: document.getElementById("expenseName").value.trim(),
      amount: parseAmountInput(document.getElementById("expenseAmount")),
      date: document.getElementById("expenseDate").value,
      time: document.getElementById("expenseTime").value,
      description: document.getElementById("expenseDescription").value.trim(),
      categoryId,
    };

    if (id) await updateTransaction(id, payload);
    else await createTransaction(payload);
    location.href = "transactions.html";
  } catch (err) {
    showToast(err.message || "Failed to save expense.");
  }
});

async function init() {
  const user = await requireAuthOrRedirect();
  if (!user) return;
  try {
    await loadExpenseForm();
  } catch (err) {
    showToast(err.message || "Failed to load form.");
  }
}

init();
