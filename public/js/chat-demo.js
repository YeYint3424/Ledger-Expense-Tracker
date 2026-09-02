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
function confirmModal(options) {
  const opts = typeof options === 'string' ? { message: options } : (options || {});
  const { title = 'Are you sure?', message = '', confirmLabel = 'Delete', cancelLabel = 'Cancel', danger = true } = opts;
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'confirm-modal-backdrop';
    backdrop.innerHTML = `
      <div class="confirm-modal" role="dialog" aria-modal="true">
        <h3 class="confirm-modal-title">${escapeHtml(title)}</h3>
        <p class="confirm-modal-text">${escapeHtml(message)}</p>
        <div class="confirm-modal-actions">
          <button type="button" class="btn btn-ghost" data-action="cancel">${escapeHtml(cancelLabel)}</button>
          <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-action="confirm">${escapeHtml(confirmLabel)}</button>
        </div>
      </div>`;
    document.body.appendChild(backdrop);
    function cleanup(result) { backdrop.remove(); resolve(result); }
    backdrop.querySelector('[data-action="cancel"]').addEventListener('click', () => cleanup(false));
    backdrop.querySelector('[data-action="confirm"]').addEventListener('click', () => cleanup(true));
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) cleanup(false); });
  });
}

/* ---- fake users ---- */
const USERS = {
  me: { id: 'user-me', name: 'Me' },
  alice: { id: 'user-alice', name: 'Alice' },
  bob: { id: 'user-bob', name: 'Bob' },
};
let currentUserId = USERS.me.id;

/* ---- fake in-memory message store, keyed by room id ---- */
const ROOMS = { GROUP: 'demo-group', DM: 'demo-dm' };
let idCounter = 100;
const store = {
  [ROOMS.GROUP]: [
    msg({ sender: USERS.alice, text: 'Hey, are we still on for the trip next week?', minutesAgo: 40 }),
    msg({ sender: USERS.bob, text: "Yes! I've booked the hotel already.", minutesAgo: 35 }),
    msg({ sender: USERS.me, text: 'Nice, send the confirmation when you get a chance', minutesAgo: 30 }),
    msg({ sender: USERS.alice, text: 'Will do 👍', minutesAgo: 28 }),
  ],
  [ROOMS.DM]: [
    msg({ sender: USERS.alice, text: 'hey, got a sec?', minutesAgo: 20 }),
    msg({ sender: USERS.me, text: "what's up?", minutesAgo: 18 }),
    msg({ sender: USERS.alice, text: 'nvm, figured it out', minutesAgo: 15 }),
  ],
};

function msg({ sender, text, minutesAgo = 0, replyTo = null, forwardedFrom = null }) {
  return {
    id: 'm' + idCounter++,
    senderId: { id: sender.id, name: sender.name },
    text,
    createdAt: new Date(Date.now() - minutesAgo * 60000).toISOString(),
    groupId: null,
    conversationId: null,
    replyTo,
    forwardedFrom,
    edited: false,
    editedAt: null,
    deleted: false,
    deletedAt: null,
  };
}

function roomKey(scope, id) { return scope === 'group' ? id : id; }

/* ---- fake socket: on/off/emit, simulating a server round-trip ---- */
const listeners = {};
function on(event, handler) { (listeners[event] = listeners[event] || []).push(handler); }
function off(event, handler) {
  if (!listeners[event]) return;
  listeners[event] = listeners[event].filter((h) => h !== handler);
}
function fire(event, payload) { (listeners[event] || []).forEach((h) => h(payload)); }

function emit(event, payload) {
  setTimeout(() => handleEmit(event, payload), 120); // small delay so it feels like a real round trip
}

function handleEmit(event, payload) {
  if (event === 'group-message' || event === 'direct-message') {
    const room = payload.groupId || payload.conversationId;
    const list = store[room] || (store[room] = []);
    let replyTo = null;
    if (payload.replyTo) {
      const original = list.find((m) => m.id === payload.replyTo);
      if (original) {
        replyTo = { id: original.id, text: original.deleted ? null : original.text, deleted: !!original.deleted, senderName: original.senderId.name };
      }
    }
    const sender = Object.values(USERS).find((u) => u.id === currentUserId) || USERS.me;
    const newMsg = msg({ sender, text: payload.text, minutesAgo: 0, replyTo });
    if (payload.groupId) newMsg.groupId = payload.groupId; else newMsg.conversationId = payload.conversationId;
    list.push(newMsg);
    fire(event, newMsg);
  } else if (event === 'edit-message') {
    for (const room of Object.keys(store)) {
      const m = store[room].find((x) => x.id === payload.messageId);
      if (m) {
        m.text = payload.text;
        m.edited = true;
        m.editedAt = new Date().toISOString();
        fire('message-edited', m);
        return;
      }
    }
  } else if (event === 'delete-message') {
    for (const room of Object.keys(store)) {
      const m = store[room].find((x) => x.id === payload.messageId);
      if (m) {
        m.deleted = true;
        m.deletedAt = new Date().toISOString();
        fire('message-deleted', { id: m.id, groupId: m.groupId, conversationId: m.conversationId });
        return;
      }
    }
  } else if (event === 'forward-message') {
    let original = null;
    for (const room of Object.keys(store)) {
      const found = store[room].find((x) => x.id === payload.messageId);
      if (found) { original = found; break; }
    }
    if (!original) return;
    const sender = Object.values(USERS).find((u) => u.id === currentUserId) || USERS.me;
    const targetRoom = payload.targetId;
    const list = store[targetRoom] || (store[targetRoom] = []);
    const forwardedFrom = { senderName: original.senderId.name, text: original.text };
    const newMsg = msg({ sender, text: original.text, minutesAgo: 0, forwardedFrom });
    if (payload.targetScope === 'group') newMsg.groupId = targetRoom; else newMsg.conversationId = targetRoom;
    list.push(newMsg);
    fire(payload.targetScope === 'group' ? 'group-message' : 'direct-message', newMsg);
  }
}

const fakeSocket = { on, off, emit };
function getSocket() { return fakeSocket; }

/* ---- forward targets: the two demo rooms ---- */
async function getGroups() { return [{ id: ROOMS.GROUP, name: 'Trip Planning' }]; }
async function getConversations() { return [{ id: ROOMS.DM, friend: { id: USERS.alice.id, name: 'Alice' } }]; }

/* ---- mount both demo panels ---- */
let groupHandle = null;
let dmHandle = null;

function mountPanels() {
  if (groupHandle) groupHandle.destroy();
  if (dmHandle) dmHandle.destroy();

  groupHandle = ChatUI.mount({
    containerEl: document.getElementById('groupChatMessages'),
    formEl: document.getElementById('groupChatForm'),
    inputEl: document.getElementById('groupChatInput'),
    currentUserId,
    room: ROOMS.GROUP,
    scope: 'group',
    fetchHistory: async () => store[ROOMS.GROUP],
    resolveSenderName: (userId) => {
      const u = Object.values(USERS).find((x) => x.id === userId);
      return u ? u.name : null;
    },
  });

  dmHandle = ChatUI.mount({
    containerEl: document.getElementById('dmChatMessages'),
    formEl: document.getElementById('dmChatForm'),
    inputEl: document.getElementById('dmChatInput'),
    currentUserId,
    room: ROOMS.DM,
    scope: 'direct',
    fetchHistory: async () => store[ROOMS.DM],
    resolveSenderName: (userId) => (userId === USERS.alice.id ? 'Alice' : null),
  });
}

/* ---- "viewing as" switcher, to demonstrate edit/delete only showing for your own messages ---- */
function setViewer(userId, btnEl) {
  currentUserId = userId;
  document.querySelectorAll('.demo-user-switch .btn').forEach((b) => {
    b.classList.remove('btn-primary');
    b.classList.add('btn-ghost');
  });
  btnEl.classList.remove('btn-ghost');
  btnEl.classList.add('btn-primary');
  mountPanels();
}

document.getElementById('viewAsMe').addEventListener('click', (e) => setViewer(USERS.me.id, e.target));
document.getElementById('viewAsAlice').addEventListener('click', (e) => setViewer(USERS.alice.id, e.target));

mountPanels();
