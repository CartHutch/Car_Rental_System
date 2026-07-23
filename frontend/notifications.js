function _notifKey() {
  const userId = sessionStorage.getItem('user_id');
  return userId ? `notifications_${userId}` : null;
}

function _escapeNotifHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function getNotifications() {
  const key = _notifKey();
  if (!key) return [];
  try {
    return JSON.parse(sessionStorage.getItem(key)) || [];
  } catch {
    return [];
  }
}

function addNotification(message) {
  const key = _notifKey();
  if (!key) return;
  const list = getNotifications();
  list.unshift({
    id: Date.now() + Math.random().toString(16).slice(2),
    message,
    time: new Date().toISOString(),
    read: false,
  });
  sessionStorage.setItem(key, JSON.stringify(list.slice(0, 50)));
  renderNotifications();
}

function markAllNotificationsRead() {
  const key = _notifKey();
  if (!key) return;
  const list = getNotifications().map(n => ({ ...n, read: true }));
  sessionStorage.setItem(key, JSON.stringify(list));
  renderNotifications();
}

function _formatNotifTime(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ' · ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function renderNotifications() {
  const badge = document.getElementById('notifBadge');
  const list = document.getElementById('notifList');
  if (!badge || !list) return;

  const notifs = getNotifications();
  const unread = notifs.filter(n => !n.read).length;

  badge.textContent = unread > 9 ? '9+' : String(unread);
  badge.hidden = unread === 0;

  if (!notifs.length) {
    list.innerHTML = '<div class="notif-empty">No notifications yet.</div>';
    return;
  }

  list.innerHTML = notifs.map(n => `
    <div class="notif-item${n.read ? '' : ' notif-item--unread'}">
      <p class="notif-msg">${_escapeNotifHtml(n.message)}</p>
      <span class="notif-time">${_formatNotifTime(n.time)}</span>
    </div>
  `).join('');
}

(function initNotifBell() {
  const bellBtn = document.getElementById('notifBellBtn');
  const dropdown = document.getElementById('notifDropdown');
  if (!bellBtn || !dropdown) return;

  renderNotifications();

  bellBtn.addEventListener('click', e => {
    e.stopPropagation();
    const isHidden = dropdown.hidden;
    dropdown.hidden = !isHidden;
    if (isHidden) markAllNotificationsRead();
  });

  document.addEventListener('click', e => {
    if (!dropdown.hidden && !dropdown.contains(e.target) && e.target !== bellBtn) {
      dropdown.hidden = true;
    }
  });
})();