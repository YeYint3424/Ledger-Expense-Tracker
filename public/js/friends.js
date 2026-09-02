async function renderFriends() {
  const friends = await getFriends();
  const list = document.getElementById('friendList');
  const empty = document.getElementById('friendEmpty');

  if (!friends.length) {
    list.innerHTML = '';
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  list.innerHTML = friends.map((f) => `
    <div class="friend-card">
      <div class="friend-card-info">
        <span class="friend-card-name">${escapeHtml(f.name)}</span>
        <span class="friend-card-email">${escapeHtml(f.email)}</span>
      </div>
      <div class="friend-card-actions">
        <a class="btn btn-primary btn-sm" href="messages.html?friend=${f.userId}">Message</a>
        <button class="btn btn-icon danger btn-sm" data-unfriend="${f.userId}" title="Remove friend">🗑</button>
      </div>
    </div>`).join('');

  list.querySelectorAll('[data-unfriend]').forEach((btn) => {
    btn.addEventListener('click', () => handleUnfriend(btn.dataset.unfriend));
  });
}

async function renderRequests() {
  const { incoming, outgoing } = await getFriendRequests();

  const incomingList = document.getElementById('incomingList');
  const incomingEmpty = document.getElementById('incomingEmpty');
  if (!incoming.length) {
    incomingList.innerHTML = '';
    incomingEmpty.hidden = false;
  } else {
    incomingEmpty.hidden = true;
    incomingList.innerHTML = incoming.map((r) => `
      <div class="request-card">
        <div class="request-card-info">
          <span class="request-card-name">${escapeHtml(r.from.name)}</span>
          <span class="request-card-email">${escapeHtml(r.from.email)}</span>
        </div>
        <div class="request-card-actions">
          <button class="btn btn-primary btn-sm" data-accept="${r.id}">Confirm</button>
          <button class="btn btn-ghost btn-sm" data-decline="${r.id}">Decline</button>
        </div>
      </div>`).join('');
    incomingList.querySelectorAll('[data-accept]').forEach((btn) => btn.addEventListener('click', () => handleAccept(btn.dataset.accept)));
    incomingList.querySelectorAll('[data-decline]').forEach((btn) => btn.addEventListener('click', () => handleDecline(btn.dataset.decline)));
  }

  const outgoingList = document.getElementById('outgoingList');
  const outgoingEmpty = document.getElementById('outgoingEmpty');
  if (!outgoing.length) {
    outgoingList.innerHTML = '';
    outgoingEmpty.hidden = false;
  } else {
    outgoingEmpty.hidden = true;
    outgoingList.innerHTML = outgoing.map((r) => `
      <div class="request-card">
        <div class="request-card-info">
          <span class="request-card-name">${escapeHtml(r.to.name)}</span>
          <span class="request-card-email">${escapeHtml(r.to.email)}</span>
        </div>
        <span style="font-size:12.5px; color:var(--ink-500);">Waiting for confirmation…</span>
      </div>`).join('');
  }
}

document.getElementById('addFriendForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = document.getElementById('addFriendEmail');
  try {
    await sendFriendRequest(input.value.trim());
    input.value = '';
    showToast('Friend request sent');
    await renderRequests();
  } catch (err) {
    showToast(err.message || 'Failed to send request.');
  }
});

async function handleAccept(id) {
  try {
    await acceptFriendRequest(id);
    showToast('Friend added');
    await Promise.all([renderRequests(), renderFriends()]);
  } catch (err) {
    showToast(err.message || 'Failed to accept request.');
  }
}

async function handleDecline(id) {
  try {
    await declineFriendRequest(id);
    showToast('Request declined');
    await renderRequests();
  } catch (err) {
    showToast(err.message || 'Failed to decline request.');
  }
}

async function handleUnfriend(userId) {
  const ok = await confirmModal({
    title: 'Remove this friend?',
    message: 'Your message history will stay, but you can only reconnect by sending a new request.',
    confirmLabel: 'Remove friend',
  });
  if (!ok) return;
  try {
    await unfriend(userId);
    showToast('Friend removed');
    await renderFriends();
  } catch (err) {
    showToast(err.message || 'Failed to remove friend.');
  }
}

async function init() {
  const user = await requireAuthOrRedirect();
  if (!user) return;
  try {
    await Promise.all([renderFriends(), renderRequests()]);
  } catch (err) {
    showToast(err.message || 'Failed to load friends.');
  }
}

init();
