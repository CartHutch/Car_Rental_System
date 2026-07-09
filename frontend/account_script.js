/* HEADER — show logged-in user's first name */
(function initHeaderUser() {
  const firstName = sessionStorage.getItem('first_name');
  const nameEl = document.getElementById('userFirstName');
  if (nameEl) nameEl.textContent = firstName || 'Account';
})();

document.getElementById('logoutBtn').addEventListener('click', () => {
  sessionStorage.clear();
  window.location.href = 'index.html';
});

/* HELPERS */
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
  return `${formatDate(startStr)} - ${formatDate(endStr)}`;
}

function formatCost(amount) {
  const n = Number(amount) || 0;
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

/* RENDER A SINGLE RESERVATION ROW (matches the CAR / RENTAL DATES / LOCATION / TOTAL COST layout) */
function buildReservationRow(res) {
  const row = document.createElement('div');
  row.className = 'res-row';

  const imgHTML = res.image_url
    ? `<img class="res-car-img" src="${escapeHtml(res.image_url)}" alt="${escapeHtml(res.model || '')}" loading="lazy">`
    : `<div class="res-car-img-placeholder">
         <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">
           <rect x="2" y="7" width="20" height="12" rx="2"/>
           <path d="M16 7l-1.5-3h-5L8 7"/>
           <circle cx="6.5" cy="19" r="1.5"/>
           <circle cx="17.5" cy="19" r="1.5"/>
         </svg>
       </div>`;

  const detailsId = `details-${res.reservation_id}`;

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
  `;

  row.querySelector('.res-details-link').addEventListener('click', (e) => {
    const btn = e.currentTarget;
    const panel = document.getElementById(btn.dataset.target);
    const isHidden = panel.hidden;
    panel.hidden = !isHidden;
    btn.textContent = isHidden ? 'Hide Details' : 'Details';
  });

  return row;
}

function emptyStateHTML(message) {
  return `
    <div class="res-empty">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
      <p>${escapeHtml(message)}</p>
    </div>`;
}

function renderList(containerId, reservations, emptyMessage) {
  const list = document.getElementById(containerId);
  list.innerHTML = '';
  if (!reservations.length) {
    list.innerHTML = emptyStateHTML(emptyMessage);
    return;
  }
  reservations.forEach(res => list.appendChild(buildReservationRow(res)));
}

/* LOAD RESERVATIONS */
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

  renderList('upcomingList', data.upcoming || [], "You don't have any upcoming reservations.");
  renderList('historyList', data.history || [], 'No past rentals yet.');
}

loadReservations();