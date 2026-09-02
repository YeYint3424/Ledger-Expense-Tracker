/* =========================================================
   SHARED CHAT UI (used by group-detail.js and messages.js)
   Messenger-style bubbles: sender name in the top-left corner
   of each incoming bubble, own messages on the right with no
   name. Hovering a message reveals Reply / Forward for anyone,
   plus Edit / Delete for your own messages only — pure CSS
   hover, no click-to-open menu to get stuck open or hidden.
   ========================================================= */
const ChatUI = (() => {
  /**
   * Normalizes m.senderId into { id, name } regardless of shape — a plain ID
   * string, the normal { id, name } the API sends, or a raw un-transformed
   * { _id, name } — so "is this my message" never silently fails just
   * because of a shape mismatch.
   */
  function extractSenderInfo(senderIdField) {
    if (senderIdField == null) return { id: null, name: null };
    if (typeof senderIdField === 'string') return { id: senderIdField, name: null };
    if (typeof senderIdField === 'object') {
      const rawId = senderIdField.id != null ? senderIdField.id : senderIdField._id;
      const id = rawId && typeof rawId === 'object' && rawId.toString ? rawId.toString() : rawId;
      return { id: id != null ? String(id) : null, name: senderIdField.name || null };
    }
    return { id: String(senderIdField), name: null };
  }

  /**
   * Name priority: the caller's own local lookup (group member list / known
   * friend) first, since that data is already loaded and known-correct —
   * then whatever the server sent, then a last-resort placeholder.
   */
  function resolveName(userId, mine, mFromServer, resolveSenderName) {
    if (mine) return 'You';
    if (typeof resolveSenderName === 'function') {
      const resolved = resolveSenderName(userId);
      if (resolved) return resolved;
    }
    if (mFromServer) return mFromServer;
    return 'Member';
  }

  function actionIconsHTML(mine) {
    return `
      <div class="msg-actions">
        <button type="button" class="msg-action-btn" data-action="reply" title="Reply">&#8617;</button>
        <button type="button" class="msg-action-btn" data-action="forward" title="Forward">&#8618;</button>
        ${mine ? '<button type="button" class="msg-action-btn" data-action="edit" title="Edit">&#9998;</button>' : ''}
        ${mine ? '<button type="button" class="msg-action-btn msg-action-danger" data-action="delete" title="Delete">&#128465;</button>' : ''}
      </div>`;
  }

  function bubbleHTML(m, currentUserId, resolveSenderName) {
    const { id: senderId, name: serverName } = extractSenderInfo(m.senderId);
    const mine = senderId != null && String(senderId) === String(currentUserId);
    const senderName = resolveName(senderId, mine, serverName, resolveSenderName);
    const time = new Date(m.createdAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

    if (m.deleted) {
      return `
        <div class="msg-row ${mine ? 'mine' : ''}" data-msg-id="${m.id}">
          <div class="msg-bubble msg-bubble-deleted">
            ${!mine ? `<div class="msg-sender">${escapeHtml(senderName)}</div>` : ''}
            <em>This message was deleted</em>
            <div class="msg-time">${time}</div>
          </div>
        </div>`;
    }

    const forwardedHtml = (m.forwardedFrom && m.forwardedFrom.text)
      ? `<div class="msg-forwarded-tag">&#8618; Forwarded from ${escapeHtml(m.forwardedFrom.senderName || 'Someone')}</div>`
      : '';

    const replyHtml = m.replyTo
      ? `<div class="msg-reply-quote">
           <span class="msg-reply-quote-name">${escapeHtml(m.replyTo.senderName || 'Someone')}</span>
           <span class="msg-reply-quote-text">${m.replyTo.deleted ? 'Message deleted' : escapeHtml((m.replyTo.text || '').slice(0, 80))}</span>
         </div>`
      : '';

    const editedTag = m.edited ? '<span class="msg-edited-tag">(edited)</span>' : '';

    return `
      <div class="msg-row ${mine ? 'mine' : ''}" data-msg-id="${m.id}">
        ${mine ? actionIconsHTML(mine) : ''}
        <div class="msg-bubble">
          ${!mine ? `<div class="msg-sender">${escapeHtml(senderName)}</div>` : ''}
          ${forwardedHtml}
          ${replyHtml}
          <div class="msg-text">${escapeHtml(m.text)}</div>
          <div class="msg-time">${time} ${editedTag}</div>
        </div>
        ${!mine ? actionIconsHTML(mine) : ''}
      </div>`;
  }

  function showForwardModal(targets, onSelect) {
    const backdrop = document.createElement('div');
    backdrop.className = 'confirm-modal-backdrop';
    backdrop.innerHTML = `
      <div class="confirm-modal forward-modal" role="dialog" aria-modal="true">
        <h3 class="confirm-modal-title">Forward message</h3>
        <div class="forward-target-list">
          ${targets.map((t) => `
            <button type="button" class="forward-target-item" data-id="${t.id}" data-scope="${t.scope}">
              <span class="forward-target-icon">${t.scope === 'group' ? '&#9635;' : '&#9825;'}</span>
              <span>${escapeHtml(t.name)}</span>
            </button>`).join('')}
        </div>
        <div class="confirm-modal-actions">
          <button type="button" class="btn btn-ghost" data-action="cancel">Cancel</button>
        </div>
      </div>`;
    document.body.appendChild(backdrop);

    function cleanup() { backdrop.remove(); }
    backdrop.querySelector('[data-action="cancel"]').addEventListener('click', cleanup);
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) cleanup(); });
    backdrop.querySelectorAll('.forward-target-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        onSelect({ scope: btn.dataset.scope, id: btn.dataset.id });
        cleanup();
      });
    });
  }

  async function getForwardTargets(excludeRoom) {
    const [groups, conversations] = await Promise.all([getGroups(), getConversations()]);
    const targets = [
      ...groups.map((g) => ({ scope: 'group', id: g.id, name: `${g.name} (group)` })),
      ...conversations
        .filter((c) => c.friend)
        .map((c) => ({ scope: 'direct', id: c.id, name: c.friend.name })),
    ];
    return targets.filter((t) => t.id !== excludeRoom);
  }

  /**
   * Mounts a full chat panel: fetches history, renders it, wires the send form
   * (with reply support), and listens for live new/edited/deleted messages.
   *
   * `resolveSenderName(userId)` is a fallback the caller supplies (e.g. from a
   * group's already-known member list, or a conversation's known friend) —
   * this is checked BEFORE the server-provided name, since it's already-loaded
   * data the caller knows is correct.
   */
  function mount({ containerEl, formEl, inputEl, currentUserId, room, scope, fetchHistory, resolveSenderName }) {
    let replyingTo = null;
    let lastMessages = [];

    async function refresh() {
      lastMessages = await fetchHistory();
      if (!lastMessages.length) {
        containerEl.innerHTML = '<p class="chat-empty">No messages yet — say hi 👋</p>';
      } else {
        containerEl.innerHTML = lastMessages.map((m) => bubbleHTML(m, currentUserId, resolveSenderName)).join('');
        containerEl.scrollTop = containerEl.scrollHeight;
      }
      wireBubbleActions();
    }

    function wireBubbleActions() {
      containerEl.querySelectorAll('.msg-row').forEach((row) => {
        const id = row.dataset.msgId;
        row.querySelectorAll('[data-action]').forEach((btn) => {
          btn.addEventListener('click', () => handleAction(btn.dataset.action, id, row));
        });
      });
    }

    function showReplyBanner(msg) {
      replyingTo = msg;
      let banner = formEl.querySelector('.chat-reply-banner');
      if (!banner) {
        banner = document.createElement('div');
        banner.className = 'chat-reply-banner';
        formEl.prepend(banner);
      }
      banner.innerHTML = `
        <span>Replying to <b>${escapeHtml(msg.senderName)}</b>: ${escapeHtml((msg.text || '').slice(0, 60))}</span>
        <button type="button" class="chat-reply-cancel" aria-label="Cancel reply">&#10005;</button>`;
      banner.querySelector('.chat-reply-cancel').addEventListener('click', clearReply);
      inputEl.focus();
    }

    function clearReply() {
      replyingTo = null;
      const banner = formEl.querySelector('.chat-reply-banner');
      if (banner) banner.remove();
    }

    async function handleAction(action, id, row) {
      const msg = lastMessages.find((m) => m.id === id);
      if (!msg) return;
      const { id: senderId, name: serverName } = extractSenderInfo(msg.senderId);
      const mine = senderId != null && String(senderId) === String(currentUserId);
      const senderName = resolveName(senderId, mine, serverName, resolveSenderName);

      if (action === 'reply') {
        showReplyBanner({ id: msg.id, senderName, text: msg.text });
      } else if (action === 'delete') {
        const ok = await confirmModal({ message: "Delete this message? This can't be undone.", confirmLabel: 'Delete message' });
        if (!ok) return;
        getSocket().emit('delete-message', { messageId: id });
      } else if (action === 'edit') {
        startInlineEdit(row, msg);
      } else if (action === 'forward') {
        const targets = await getForwardTargets(room);
        if (!targets.length) { showToast('No other groups or friends to forward to yet.'); return; }
        showForwardModal(targets, (target) => {
          getSocket().emit('forward-message', { messageId: msg.id, targetScope: target.scope, targetId: target.id });
          showToast('Message forwarded');
        });
      }
    }

    function startInlineEdit(row, msg) {
      const bubble = row.querySelector('.msg-bubble');
      const textEl = bubble.querySelector('.msg-text');
      if (!textEl) return;
      textEl.outerHTML = `
        <div class="msg-edit-box">
          <textarea class="msg-edit-textarea">${escapeHtml(msg.text)}</textarea>
          <div class="msg-edit-actions">
            <button type="button" class="btn btn-ghost btn-sm" data-edit-cancel>Cancel</button>
            <button type="button" class="btn btn-primary btn-sm" data-edit-save>Save</button>
          </div>
        </div>`;
      bubble.querySelector('[data-edit-cancel]').addEventListener('click', refresh);
      bubble.querySelector('[data-edit-save]').addEventListener('click', () => {
        const newText = bubble.querySelector('.msg-edit-textarea').value.trim();
        if (!newText) { showToast('Message cannot be empty.'); return; }
        getSocket().emit('edit-message', { messageId: msg.id, text: newText });
      });
    }

    formEl.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = inputEl.value.trim();
      if (!text) return;
      const payload = scope === 'group' ? { groupId: room, text } : { conversationId: room, text };
      if (replyingTo) payload.replyTo = replyingTo.id;
      getSocket().emit(scope === 'group' ? 'group-message' : 'direct-message', payload);
      inputEl.value = '';
      clearReply();
    });

    const socket = getSocket();
    const eventName = scope === 'group' ? 'group-message' : 'direct-message';
    const inThisRoom = (m) => (scope === 'group' ? m.groupId === room : m.conversationId === room);

    function onNewOrChanged(m) {
      if (!inThisRoom(m)) return;
      refresh();
    }
    socket.on(eventName, onNewOrChanged);
    socket.on('message-edited', onNewOrChanged);
    socket.on('message-deleted', onNewOrChanged);

    refresh();

    return {
      refresh,
      destroy() {
        socket.off(eventName, onNewOrChanged);
        socket.off('message-edited', onNewOrChanged);
        socket.off('message-deleted', onNewOrChanged);
      },
    };
  }

  return { mount, showForwardModal, getForwardTargets };
})();
window.ChatUI = ChatUI;
