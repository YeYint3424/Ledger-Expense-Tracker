/* =========================================================
   API CLIENT (talks to the Express backend under /api)
   Loaded on every page, before the page-specific script.
   ========================================================= */
const API_BASE = '/api';

async function apiFetch(path, options = {}) {
  const res = await fetch(API_BASE + path, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    ...options,
  });
  let data = null;
  try { data = await res.json(); } catch (e) { /* empty body, fine */ }
  if (!res.ok) {
    const message = (data && data.error) || 'Something went wrong.';
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }
  return data;
}

/* ---- auth ---- */
async function fetchCurrentUser() {
  try {
    const data = await apiFetch('/auth/me');
    return data.user;
  } catch (e) {
    return null;
  }
}

/** Call at the top of every protected page's init(). Redirects to login.html if not signed in. */
async function requireAuthOrRedirect() {
  const user = await fetchCurrentUser();
  if (!user) {
    location.href = 'login.html';
    return null;
  }
  window.__currentUserId = user.id;
  const nameEl = document.getElementById('currentUserName');
  if (nameEl) nameEl.textContent = user.name;
  initGlobalNotifications();
  return user;
}

async function logout() {
  try { await apiFetch('/auth/logout', { method: 'POST' }); } catch (e) { /* ignore */ }
  location.href = 'login.html';
}

async function updateProfile(payload) {
  const data = await apiFetch('/auth/me', { method: 'PUT', body: JSON.stringify(payload) });
  return data.user;
}

/* ---- categories ---- */
async function getCategories() {
  const data = await apiFetch('/categories');
  return data.categories;
}
/** Returns { category, reused }. If a category with the same name already existed, reused=true and the existing one is returned instead of a duplicate. */
async function createCategory(payload) {
  return apiFetch('/categories', { method: 'POST', body: JSON.stringify(payload) });
}
async function updateCategory(id, payload) {
  const data = await apiFetch(`/categories/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
  return data.category;
}
async function deleteCategoryApi(id) {
  return apiFetch(`/categories/${id}`, { method: 'DELETE' });
}

/* ---- transactions ---- */
async function getTransactions(filters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v); });
  const qs = params.toString();
  const data = await apiFetch(`/transactions${qs ? '?' + qs : ''}`);
  return data.transactions;
}
async function getTransactionMonths() {
  const data = await apiFetch('/transactions/months');
  return data.months; // ['2026-03', '2026-02', ...] newest first
}
async function getTransaction(id) {
  const data = await apiFetch(`/transactions/${id}`);
  return data.transaction;
}
async function createTransaction(payload) {
  const data = await apiFetch('/transactions', { method: 'POST', body: JSON.stringify(payload) });
  return data.transaction;
}
async function updateTransaction(id, payload) {
  const data = await apiFetch(`/transactions/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
  return data.transaction;
}
async function deleteTransactionApi(id) {
  return apiFetch(`/transactions/${id}`, { method: 'DELETE' });
}

/* ---- formatting helpers ---- */
function formatMoney(n) {
  const num = Number(n) || 0;
  return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function nowTime() {
  return new Date().toTimeString().slice(0, 5);
}
function formatDateTime(dateStr, timeStr) {
  if (!dateStr) return '—';
  const d = new Date(`${dateStr}T${timeStr || '00:00'}`);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString(undefined, { month: 'short', day: '2-digit', year: 'numeric' }) +
    (timeStr ? ' · ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '');
}
function monthKey(dateStr) {
  return dateStr ? dateStr.slice(0, 7) : '';
}
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}
function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => { t.hidden = true; }, 2200);
}

const SWATCH_PALETTE = ['#B0462B', '#3E7D53', '#B98B2E', '#5B6B8C', '#8E4E8C', '#2C7A7B', '#7A5C3E', '#4C6B2C', '#8FA096', '#1F2A24'];
function randomCategoryColor() {
  return SWATCH_PALETTE[Math.floor(Math.random() * SWATCH_PALETTE.length)];
}

/* ---- export (fetches everything for the current user) ---- */
function wireExportButton() {
  document.querySelectorAll('#exportBtn, .js-export-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        const res = await fetch(`${API_BASE}/export/xlsx`, { credentials: 'include' });
        if (!res.ok) throw new Error('Export failed.');
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ledger-export-${todayISO()}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
      } catch (e) {
        showToast('Export failed.');
      }
    });
  });
}

function wireLogoutButton() {
  document.querySelectorAll('#logoutBtn, .js-logout-btn').forEach((btn) => {
    btn.addEventListener('click', logout);
  });
}

/* ---- analytics ---- */
async function getAnalyticsSummary(months = 6, month = null) {
  const params = new URLSearchParams({ months });
  if (month) params.set('month', month);
  const data = await apiFetch(`/analytics/summary?${params.toString()}`);
  return data;
}

/* ---- group categories ---- */
async function getGroupCategories() {
  const data = await apiFetch('/group-categories');
  return data.categories;
}
async function createGroupCategory(payload) {
  return apiFetch('/group-categories', { method: 'POST', body: JSON.stringify(payload) }); // { category, reused }
}
async function updateGroupCategory(id, payload) {
  const data = await apiFetch(`/group-categories/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
  return data.category;
}
async function deleteGroupCategoryApi(id) {
  return apiFetch(`/group-categories/${id}`, { method: 'DELETE' });
}

/* ---- groups ---- */
async function getGroups() {
  const data = await apiFetch('/groups');
  return data.groups;
}
async function getGroup(id) {
  const data = await apiFetch(`/groups/${id}`);
  return data.group;
}
async function createGroup(payload) {
  const data = await apiFetch('/groups', { method: 'POST', body: JSON.stringify(payload) });
  return data.group;
}
async function updateGroup(id, payload) {
  const data = await apiFetch(`/groups/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
  return data.group;
}
async function deleteGroupApi(id) {
  return apiFetch(`/groups/${id}`, { method: 'DELETE' });
}
async function addGroupMember(groupId, email) {
  const data = await apiFetch(`/groups/${groupId}/members`, { method: 'POST', body: JSON.stringify({ email }) });
  return data.group;
}
async function removeGroupMember(groupId, userId) {
  return apiFetch(`/groups/${groupId}/members/${userId}`, { method: 'DELETE' });
}
async function getGroupExpenses(groupId) {
  const data = await apiFetch(`/groups/${groupId}/expenses`);
  return data.expenses;
}
async function createGroupExpense(groupId, payload) {
  const data = await apiFetch(`/groups/${groupId}/expenses`, { method: 'POST', body: JSON.stringify(payload) });
  return data.expense;
}
async function updateGroupExpense(groupId, expenseId, payload) {
  const data = await apiFetch(`/groups/${groupId}/expenses/${expenseId}`, { method: 'PUT', body: JSON.stringify(payload) });
  return data.expense;
}
async function deleteGroupExpenseApi(groupId, expenseId) {
  return apiFetch(`/groups/${groupId}/expenses/${expenseId}`, { method: 'DELETE' });
}
async function getGroupBalances(groupId) {
  return apiFetch(`/groups/${groupId}/balances`); // { balances, totalSpent }
}
async function getGroupMessages(groupId, limit = 50) {
  const data = await apiFetch(`/groups/${groupId}/messages?limit=${limit}`);
  return data.messages;
}

/* ---- friends ---- */
async function getFriends() {
  const data = await apiFetch('/friends');
  return data.friends;
}
async function getFriendRequests() {
  return apiFetch('/friends/requests'); // { incoming, outgoing }
}
async function sendFriendRequest(email) {
  return apiFetch('/friends/requests', { method: 'POST', body: JSON.stringify({ email }) });
}
async function acceptFriendRequest(id) {
  return apiFetch(`/friends/requests/${id}/accept`, { method: 'POST' });
}
async function declineFriendRequest(id) {
  return apiFetch(`/friends/requests/${id}/decline`, { method: 'POST' });
}
async function unfriend(userId) {
  return apiFetch(`/friends/${userId}`, { method: 'DELETE' });
}

/* ---- conversations (direct messages) ---- */
async function getConversations() {
  const data = await apiFetch('/conversations');
  return data.conversations;
}
async function getConversationMessages(conversationId, limit = 50) {
  const data = await apiFetch(`/conversations/${conversationId}/messages?limit=${limit}`);
  return data.messages;
}
async function startConversation(friendId) {
  const data = await apiFetch('/conversations/start', { method: 'POST', body: JSON.stringify({ friendId }) });
  return data.conversationId;
}

/* ---- shared socket.io connection (used by group-detail.js and messages.js) ---- */
let _socket = null;
function getSocket() {
  if (!_socket) {
    _socket = io({ withCredentials: true });
  }
  return _socket;
}

/* ---- global chat notifications (works on every page, not just the open chat) ----
   Whichever chat a page currently has open should call window.setActiveChatId(id)
   so we don't pop a notification about a message the person is already looking at. */
let _activeChatId = null;
function setActiveChatId(id) { _activeChatId = id; }
window.setActiveChatId = setActiveChatId;

function ensureNotificationPermission() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    Notification.requestPermission().catch(() => {});
  }
}

function getNotificationContainer() {
  let el = document.getElementById('notificationContainer');
  if (!el) {
    el = document.createElement('div');
    el.id = 'notificationContainer';
    el.className = 'notification-container';
    document.body.appendChild(el);
  }
  return el;
}

/** Shows a small floating, dismissible notification card (never window.alert). */
function showNotificationCard({ title, body, href }) {
  const container = getNotificationContainer();
  const card = document.createElement('div');
  card.className = 'notification-card';
  card.innerHTML = `
    <button type="button" class="notification-card-close" aria-label="Dismiss">✕</button>
    <a class="notification-card-body" href="${href}">
      <div class="notification-card-title">💬 ${escapeHtml(title)}</div>
      <div class="notification-card-text">${escapeHtml(body)}</div>
    </a>
  `;
  container.appendChild(card);
  card.querySelector('.notification-card-close').addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    card.remove();
  });
  setTimeout(() => card.remove(), 8000);

  if ('Notification' in window && Notification.permission === 'granted' && document.visibilityState !== 'visible') {
    try { new Notification(title, { body }); } catch (e) { /* ignore */ }
  }
}

const _groupNameCache = {};
async function notifyGroupMessage(message) {
  const groupId = message.groupId;
  if (!_groupNameCache[groupId]) {
    try {
      const group = await getGroup(groupId);
      _groupNameCache[groupId] = group.name;
    } catch (e) {
      _groupNameCache[groupId] = 'a group';
    }
  }
  const senderName = message.senderId.name || 'Someone';
  showNotificationCard({
    title: `${senderName} in ${_groupNameCache[groupId]}`,
    body: message.text,
    href: `group-detail.html?id=${groupId}`,
  });
}

function notifyDirectMessage(message) {
  const senderName = message.senderId.name || 'New message';
  showNotificationCard({
    title: senderName,
    body: message.text,
    href: `messages.html?conversation=${message.conversationId}`,
  });
}

let _notificationsInitialized = false;
function initGlobalNotifications() {
  if (_notificationsInitialized || typeof io === 'undefined') return; // socket.io client not loaded on this page
  _notificationsInitialized = true;
  ensureNotificationPermission();

  const socket = getSocket();

  socket.on('group-message', (message) => {
    const senderId = message.senderId && message.senderId.id ? message.senderId.id : message.senderId;
    if (senderId === window.__currentUserId) return;
    if (message.groupId === _activeChatId) return;
    notifyGroupMessage(message);
  });

  socket.on('direct-message', (message) => {
    const senderId = message.senderId && message.senderId.id ? message.senderId.id : message.senderId;
    if (senderId === window.__currentUserId) return;
    if (message.conversationId === _activeChatId) return;
    notifyDirectMessage(message);
  });
}

/* ---- confirm modal (replaces window.confirm everywhere) ----
   Usage: if (!(await confirmModal('Delete this?'))) return;
   Or with options: await confirmModal({ title, message, confirmLabel, cancelLabel, danger }) */
function confirmModal(options) {
  const opts = typeof options === 'string' ? { message: options } : (options || {});
  const {
    title = 'Are you sure?',
    message = '',
    confirmLabel = 'Delete',
    cancelLabel = 'Cancel',
    danger = true,
  } = opts;

  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'confirm-modal-backdrop';
    backdrop.innerHTML = `
      <div class="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="confirmModalTitle">
        <h3 class="confirm-modal-title" id="confirmModalTitle">${escapeHtml(title)}</h3>
        <p class="confirm-modal-text">${escapeHtml(message)}</p>
        <div class="confirm-modal-actions">
          <button type="button" class="btn btn-ghost" data-action="cancel">${escapeHtml(cancelLabel)}</button>
          <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-action="confirm">${escapeHtml(confirmLabel)}</button>
        </div>
      </div>`;
    document.body.appendChild(backdrop);

    function cleanup(result) {
      backdrop.remove();
      document.removeEventListener('keydown', onKeydown);
      resolve(result);
    }
    function onKeydown(e) {
      if (e.key === 'Escape') cleanup(false);
    }
    document.addEventListener('keydown', onKeydown);

    backdrop.querySelector('[data-action="cancel"]').addEventListener('click', () => cleanup(false));
    backdrop.querySelector('[data-action="confirm"]').addEventListener('click', () => cleanup(true));
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) cleanup(false); });

    requestAnimationFrame(() => backdrop.querySelector('[data-action="confirm"]').focus());
  });
}
window.confirmModal = confirmModal;

document.addEventListener('DOMContentLoaded', () => {
  wireExportButton();
  wireLogoutButton();
});
