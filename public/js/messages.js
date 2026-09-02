let currentUserId = null;
let activeConversationId = null;
let conversationsCache = [];
let currentChatHandle = null;

function renderConversationList() {
  const list = document.getElementById('conversationList');
  const empty = document.getElementById('conversationEmpty');

  if (!conversationsCache.length) {
    list.innerHTML = '';
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  list.innerHTML = conversationsCache.map((c) => {
    const preview = c.lastMessage ? (c.lastMessage.text || 'Message deleted') : 'Say hi 👋';
    return `
      <div class="conversation-item ${c.id === activeConversationId ? 'active' : ''}" data-convo="${c.id}">
        <div>
          <div class="conversation-item-name">${escapeHtml(c.friend ? c.friend.name : 'Unknown')}</div>
          <div class="conversation-item-preview">${escapeHtml(preview)}</div>
        </div>
      </div>`;
  }).join('');

  list.querySelectorAll('[data-convo]').forEach((el) => {
    el.addEventListener('click', () => openConversation(el.dataset.convo));
  });
}

async function openConversation(conversationId) {
  activeConversationId = conversationId;
  if (window.setActiveChatId) window.setActiveChatId(conversationId);
  renderConversationList();

  getSocket().emit('join-conversation', conversationId);
  document.getElementById('chatForm').hidden = false;

  if (currentChatHandle) currentChatHandle.destroy();
  currentChatHandle = ChatUI.mount({
    containerEl: document.getElementById('chatMessages'),
    formEl: document.getElementById('chatForm'),
    inputEl: document.getElementById('chatInput'),
    currentUserId,
    room: conversationId,
    scope: 'direct',
    fetchHistory: () => getConversationMessages(conversationId),
    resolveSenderName: (userId) => {
      const convo = conversationsCache.find((c) => c.id === conversationId);
      return convo && convo.friend && convo.friend.id === userId ? convo.friend.name : null;
    },
  });
}

async function loadConversations() {
  conversationsCache = await getConversations();
  renderConversationList();
}

async function init() {
  const user = await requireAuthOrRedirect();
  if (!user) return;
  currentUserId = user.id;

  getSocket().on('direct-message', () => loadConversations());
  getSocket().on('message-edited', () => loadConversations());
  getSocket().on('message-deleted', () => loadConversations());

  try {
    await loadConversations();
    const conversationParam = new URLSearchParams(location.search).get('conversation');
    const friendId = new URLSearchParams(location.search).get('friend');
    if (conversationParam) {
      if (!conversationsCache.some((c) => c.id === conversationParam)) await loadConversations();
      await openConversation(conversationParam);
    } else if (friendId) {
      const conversationId = await startConversation(friendId);
      if (!conversationsCache.some((c) => c.id === conversationId)) {
        await loadConversations();
      }
      await openConversation(conversationId);
    } else if (conversationsCache.length) {
      await openConversation(conversationsCache[0].id);
    }
  } catch (err) {
    showToast(err.message || 'Failed to load messages.');
  }
}

init();
