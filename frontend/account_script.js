/* ── Header ── */
(function initHeaderUser() {
  const firstName = sessionStorage.getItem('first_name');
  const nameEl = document.getElementById('userFirstName');
  if (nameEl) nameEl.textContent = firstName || 'Account';
})();

document.getElementById('logoutBtn').addEventListener('click', () => {
  sessionStorage.clear();
  window.location.href = 'index.html';
});

/* ── Helpers ── */
function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(`${dateStr}T00:00:00`);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateRange(startStr, endStr) {
  return `${formatDate(startStr)} — ${formatDate(endStr)}`;
}

function formatCost(amount) {
  const n = Number(amount) || 0;
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function getStatus(res) {
  const status = (res.status || '').toLowerCase();
  if (status === 'cancelled') return 'cancelled';
  const today = new Date().toISOString().split('T')[0];
  if (res.Return_Date && res.Return_Date < today) return 'completed';
  return status || 'confirmed';
}

function statusBadge(status) {
  const styles = {
    completed: 'background:#e5f7ec;color:#1e8449;',
    cancelled: 'background:#fdecea;color:#c0392b;',
    confirmed: 'background:#e8f0fe;color:#1a56db;',
  };
  const style = styles[status] || styles.confirmed;
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  return `<span style="display:inline-block;font-size:11px;font-weight:700;padding:3px 10px;border-radius:12px;text-transform:uppercase;letter-spacing:0.04em;${style}">${escapeHtml(label)}</span>`;
}

const CAR_PLACEHOLDER = `<div class="res-car-img-placeholder">
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">
    <rect x="2" y="7" width="20" height="12" rx="2"/>
    <path d="M16 7l-1.5-3h-5L8 7"/>
    <circle cx="6.5" cy="19" r="1.5"/>
    <circle cx="17.5" cy="19" r="1.5"/>
  </svg>
</div>`;

function emptyStateHTML(message) {
  return `<div class="res-empty">
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <rect x="3" y="4" width="18" height="18" rx="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/>
      <line x1="8" y1="2" x2="8" y2="6"/>
      <line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
    <p>${escapeHtml(message)}</p>
  </div>`;
}

/* ── Build UPCOMING row (has cancel button) ── */
function buildUpcomingRow(res) {
  const row = document.createElement('div');
  row.className = 'res-row';

  const imgHTML = res.image_url
    ? `<img class="res-car-img" src="${escapeHtml(res.image_url)}" alt="${escapeHtml(res.model || '')}" loading="lazy">`
    : CAR_PLACEHOLDER;

  const detailsId = `up-${res.reservation_id}`;

  row.innerHTML = `
    <div class="res-col res-col--car">
      ${imgHTML}
      <div class="res-car-info">
        <h3 class="res-car-model">${escapeHtml(res.model || 'Vehicle')}</h3>
        <button type="button" class="res-details-link" data-target="${detailsId}">Details</button>
        <div class="res-details-panel" id="${detailsId}" hidden>
          <p><span>Type:</span> ${escapeHtml(res.type || '—')}</p>
          <p><span>Seats:</span> ${escapeHtml(String(res.seats ?? '—'))}</p>
          <p><span>Reservation ID:</span> ${escapeHtml(String(res.reservation_id ?? '—'))}</p>
        </div>
      </div>
    </div>
    <div class="res-col res-col--dates">${formatDateRange(res.PickUp_Date, res.Return_Date)}</div>
    <div class="res-col res-col--location">
      <div class="res-loc-row"><span class="res-loc-label">Pickup:</span><span class="res-loc-value">${escapeHtml(res.Pickup_Location || '—')}</span></div>
      <div class="res-loc-row"><span class="res-loc-label">Drop-off:</span><span class="res-loc-value">${escapeHtml(res.Return_Location || '—')}</span></div>
    </div>
    <div class="res-col res-col--cost">${formatCost(res.total_cost)}</div>
    <div class="res-col res-col--actions">
      <button type="button" class="btn-cancel-res" data-reservation-id="${escapeHtml(String(res.reservation_id ?? ''))}">Cancel</button>
    </div>
  `;

  row.querySelector('.res-details-link').addEventListener('click', e => {
    const btn = e.currentTarget;
    const panel = document.getElementById(btn.dataset.target);
    const isHidden = panel.hidden;
    panel.hidden = !isHidden;
    btn.textContent = isHidden ? 'Hide Details' : 'Details';
  });

  row.querySelector('.btn-cancel-res').addEventListener('click', () => {
    openCancelModal(res, row);
  });

  return row;
}

/* ── Build HISTORY row (has status badge) ── */
function buildHistoryRow(res) {
  const row = document.createElement('div');
  row.className = 'res-row history-row';
  row.dataset.status = getStatus(res);

  const imgHTML = res.image_url
    ? `<img class="res-car-img" src="${escapeHtml(res.image_url)}" alt="${escapeHtml(res.model || '')}" loading="lazy">`
    : CAR_PLACEHOLDER;

  const detailsId = `hist-${res.reservation_id}`;

  row.innerHTML = `
    <div class="res-col res-col--car">
      ${imgHTML}
      <div class="res-car-info">
        <h3 class="res-car-model">${escapeHtml(res.model || 'Vehicle')}</h3>
        <button type="button" class="res-details-link" data-target="${detailsId}">Details</button>
        <div class="res-details-panel" id="${detailsId}" hidden>
          <p><span>Type:</span> ${escapeHtml(res.type || '—')}</p>
          <p><span>Seats:</span> ${escapeHtml(String(res.seats ?? '—'))}</p>
          <p><span>Daily Rate:</span> ${res.price ? formatCost(res.price) + '/day' : '—'}</p>
          <p><span>Reservation ID:</span> ${escapeHtml(String(res.reservation_id ?? '—'))}</p>
        </div>
      </div>
    </div>
    <div class="res-col res-col--dates">${formatDateRange(res.PickUp_Date, res.Return_Date)}</div>
    <div class="res-col res-col--location">
      <div class="res-loc-row"><span class="res-loc-label">Pickup:</span><span class="res-loc-value">${escapeHtml(res.Pickup_Location || '—')}</span></div>
      <div class="res-loc-row"><span class="res-loc-label">Drop-off:</span><span class="res-loc-value">${escapeHtml(res.Return_Location || '—')}</span></div>
    </div>
    <div class="res-col res-col--cost">${formatCost(res.total_cost)}</div>
    <div class="res-col res-col--status">${statusBadge(getStatus(res))}</div>
  `;

  row.querySelector('.res-details-link').addEventListener('click', e => {
    const btn = e.currentTarget;
    const panel = document.getElementById(btn.dataset.target);
    const isHidden = panel.hidden;
    panel.hidden = !isHidden;
    btn.textContent = isHidden ? 'Hide Details' : 'Details';
  });

  return row;
}

/* ── History filter ── */
let allHistoryRows = [];

function applyFilter(filter) {
  const list = document.getElementById('historyList');
  list.innerHTML = '';

  const filtered = filter === 'all'
    ? allHistoryRows
    : allHistoryRows.filter(r => r.dataset.status === filter);

  if (!filtered.length) {
    list.innerHTML = emptyStateHTML(
      filter === 'all' ? 'No past rentals yet.' : `No ${filter} rentals found.`
    );
    return;
  }

  filtered.forEach(r => list.appendChild(r));
}

document.querySelectorAll('.hf-pill').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.hf-pill').forEach(b => b.classList.remove('hf-pill--active'));
    btn.classList.add('hf-pill--active');
    applyFilter(btn.dataset.filter);
  });
});

/* ── Load all reservations ── */
async function loadReservations() {
  const userId = sessionStorage.getItem('user_id');
  if (!userId) {
    window.location.href = 'index.html';
    return;
  }

  const { ok, data } = await API.getUserReservations(userId);

  if (!ok) {
    const msg = (data && data.error) || 'Could not load your reservations.';
    document.getElementById('upcomingList').innerHTML = emptyStateHTML(msg);
    document.getElementById('historyList').innerHTML = emptyStateHTML(msg);
    return;
  }

  const upcoming = data.upcoming || [];
  const history = data.history || [];

  /* Upcoming */
  const upList = document.getElementById('upcomingList');
  upList.innerHTML = '';
  if (!upcoming.length) {
    upList.innerHTML = emptyStateHTML("You don't have any upcoming reservations.");
  } else {
    upcoming.forEach(res => upList.appendChild(buildUpcomingRow(res)));
  }

  /* History summary strip */
  if (history.length) {
    // Cancelled reservations shouldn't count toward money actually spent.
    const totalSpent = history
      .filter(r => getStatus(r) !== 'cancelled')
      .reduce((s, r) => s + (Number(r.total_cost) || 0), 0);
    const completed = history.filter(r => getStatus(r) === 'completed').length;
    const cancelled = history.filter(r => getStatus(r) === 'cancelled').length;

    document.getElementById('hsTotalRentals').textContent = history.length;
    document.getElementById('hsTotalSpent').textContent = formatCost(totalSpent);
    document.getElementById('hsCompleted').textContent = completed;
    document.getElementById('hsCancelled').textContent = cancelled;
    document.getElementById('historySummary').hidden = false;
  }

  /* History rows */
  allHistoryRows = history.map(buildHistoryRow);
  applyFilter('all');
}

/* ── Cancel Modal ── */
let pendingCancel = null;

function openCancelModal(res, rowEl) {
  pendingCancel = { res, rowEl };
  document.getElementById('cancelModalMessage').textContent =
    `Are you sure you want to cancel your reservation for ${res.model || 'this vehicle'}? This can't be undone.`;
  const errorEl = document.getElementById('cancelModalError');
  errorEl.style.display = 'none';
  errorEl.textContent = '';
  document.getElementById('cancelModalOverlay').hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeCancelModal() {
  document.getElementById('cancelModalOverlay').hidden = true;
  document.body.style.overflow = '';
  pendingCancel = null;
}

document.getElementById('cancelModalCloseBtn').addEventListener('click', closeCancelModal);
document.getElementById('cancelModalKeepBtn').addEventListener('click', closeCancelModal);
document.getElementById('cancelModalOverlay').addEventListener('click', e => {
  if (e.target.id === 'cancelModalOverlay') closeCancelModal();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !document.getElementById('cancelModalOverlay').hidden) closeCancelModal();
});

document.getElementById('cancelModalConfirmBtn').addEventListener('click', async () => {
  if (!pendingCancel) return;

  const { res, rowEl } = pendingCancel;
  const reservationId = res.reservation_id;
  const confirmBtn = document.getElementById('cancelModalConfirmBtn');
  const errorEl = document.getElementById('cancelModalError');

  confirmBtn.disabled = true;
  confirmBtn.textContent = 'Cancelling…';
  errorEl.style.display = 'none';

  const userId = sessionStorage.getItem('user_id');
  const { ok, data } = await API.cancelReservation(reservationId, userId);

  confirmBtn.disabled = false;
  confirmBtn.textContent = 'Yes, Cancel It';

  if (!ok) {
    errorEl.textContent = (data && data.error) || 'Could not cancel. Please try again.';
    errorEl.style.display = 'block';
    return;
  }

  /* Remove from upcoming list */
  const list = rowEl.parentElement;
  rowEl.remove();
  if (list && !list.querySelector('.res-row')) {
    list.innerHTML = emptyStateHTML("You don't have any upcoming reservations.");
  }

  closeCancelModal();

  try {
    addNotification(`Cancellation for ${res.model || 'the car'} confirmed for ${formatDateRange(res.PickUp_Date, res.Return_Date)}.`);
    addNotification(`Refund sent for ${formatCost(res.total_cost)} (${res.model || 'the car'}).`);
  } catch (err) {
    console.error('Could not save notification:', err);
  }

  /* Reload so the cancelled booking moves to history immediately */
  await loadReservations();
});

loadReservations();