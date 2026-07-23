/* ── Admin gate (same pattern as admin_script.js) ── */
function isAuthorizedAdmin() {
  const userId = sessionStorage.getItem('user_id');
  const role = (sessionStorage.getItem('role') || '').trim().toLowerCase();
  return !!userId && role === 'admin';
}

function gateAdminAccess() {
  if (!isAuthorizedAdmin()) return; // restricted screen stays visible

  document.getElementById('restrictedScreen').hidden = true;
  document.getElementById('inventoryApp').hidden = false;
  initInventory();
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const STATUS_META = {
  available:   { label: 'Available' },
  rented:      { label: 'Rented' },
  maintenance: { label: 'Maintenance' },
};
// 'rented' is computed by the backend from active reservations — it isn't
// something the toggle button cycles through manually.
const STATUS_ORDER = ['available', 'maintenance'];

const SORT_FILTERS = [
  { key: 'id',       label: 'ID' },
  { key: 'price',    label: 'Price' },
  { key: 'model',    label: 'Brand' },
  { key: 'location', label: 'Location' },
];

const ICONS = {
  toggle: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3.3a9 9 0 1 1-10 0"/><path d="M12 3v9" stroke-linecap="round"/></svg>',
  view: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/></svg>',
  edit: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
  del: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 14h10l1-14"/></svg>',
};

let cars = [];
let query = '';
let sort = null; // { key, dir: 1|-1 }
let requesterId = null;

function initInventory() {
  requesterId = sessionStorage.getItem('user_id');

  document.getElementById('logoutBtn').addEventListener('click', () => {
    sessionStorage.clear();
    window.location.href = 'index.html';
  });

  document.getElementById('invSearchInput').addEventListener('input', e => {
    query = e.target.value;
    render();
  });

  document.getElementById('addBtn').addEventListener('click', () => {
    console.log('Add vehicle'); // TODO: open add-vehicle form
  });

  loadCars();
}

async function loadCars() {
  const { ok, data } = await API.getAdminCars(requesterId);
  cars = ok && Array.isArray(data) ? data : [];
  render();
}

function visibleCars() {
  const q = query.trim().toLowerCase();
  let out = cars.filter(c => {
    if (!q) return true;
    return [c.id, c.model, c.type, c.location]
      .some(f => String(f ?? '').toLowerCase().includes(q));
  });

  if (sort) {
    out = out.slice().sort((a, b) => {
      let x = a[sort.key], y = b[sort.key];
      if (typeof x === 'string') x = x.toLowerCase();
      if (typeof y === 'string') y = y.toLowerCase();
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
  }

  return out;
}

function toggleSort(key) {
  if (!sort || sort.key !== key) sort = { key, dir: 1 };
  else if (sort.dir === 1) sort = { key, dir: -1 };
  else sort = null;
  render();
}

async function cycleStatus(carId) {
  const car = cars.find(c => String(c.id) === String(carId));
  if (!car || car.status === 'rented') return; // rented is computed, not toggleable

  const currentIndex = STATUS_ORDER.indexOf(car.status);
  const nextStatus = STATUS_ORDER[(currentIndex + 1) % STATUS_ORDER.length];
  const { ok, data } = await API.updateCarStatus(carId, nextStatus, requesterId);
  if (ok) {
    car.status = data.status;
    render();
  }
}

async function deleteCar(carId, label) {
  if (!confirm(`Remove ${label} from inventory? This can't be undone.`)) return;

  const { ok } = await API.deleteCar(carId, requesterId);
  if (ok) {
    cars = cars.filter(c => String(c.id) !== String(carId));
    render();
  }
}

function render() {
  const total = cars.length;
  const available = cars.filter(c => c.status === 'available').length;
  document.getElementById('invSubtitle').textContent = `${total} vehicle${total !== 1 ? 's' : ''} · ${available} available`;

  const filtersEl = document.getElementById('invFilters');
  filtersEl.innerHTML = SORT_FILTERS.map(f => {
    const active = sort && sort.key === f.key;
    const arrow = active ? (sort.dir === 1 ? '↑' : '↓') : '';
    return `<button class="inv-filter${active ? ' inv-filter--active' : ''}" data-key="${f.key}">${f.label} ${arrow}</button>`;
  }).join('');
  filtersEl.querySelectorAll('.inv-filter').forEach(btn =>
    btn.addEventListener('click', () => toggleSort(btn.dataset.key)));

  const rows = visibleCars();
  const rowsEl = document.getElementById('invRows');

  if (!rows.length) {
    rowsEl.innerHTML = `<div class="inv-empty">No vehicles match your search.</div>`;
  } else {
    rowsEl.innerHTML = rows.map(c => {
      const meta = STATUS_META[c.status] || STATUS_META.available;
      const thumb = c.image_url
        ? `<img class="inv-thumb" src="${escapeHtml(c.image_url)}" alt="${escapeHtml(c.model)}">`
        : `<div class="inv-thumb-placeholder">
             <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4">
               <rect x="2" y="7" width="20" height="12" rx="2"/><path d="M16 7l-1.5-3h-5L8 7"/>
               <circle cx="6.5" cy="19" r="1.5"/><circle cx="17.5" cy="19" r="1.5"/>
             </svg>
           </div>`;

      return `
        <div class="inv-row">
          ${thumb}
          <div class="inv-col-name">
            <div class="inv-name">${escapeHtml(c.model)}</div>
            <div class="inv-id">ID: ${escapeHtml(String(c.id))}</div>
          </div>
          <div class="inv-col-meta">
            <div class="inv-cat">${escapeHtml(c.type || '—')}${c.seats ? ` · ${c.seats} seats` : ''}</div>
            <div class="inv-loc">${escapeHtml(c.location || '—')}</div>
          </div>
          <div class="inv-col-price">
            <div class="inv-price">$${parseFloat(c.price || 0).toFixed(2)}</div>
            <div class="inv-per">per day</div>
          </div>
          <div class="inv-col-status">
            <span class="inv-pill inv-status-${c.status} inv-bg-${c.status}">
              <span class="inv-dot" style="background:currentColor"></span>${meta.label}
            </span>
          </div>
          <div class="inv-actions">
            <button class="inv-icon-btn inv-toggle" title="${c.status === 'rented' ? 'Currently rented — status is automatic' : 'Toggle status'}" data-act="toggle" data-id="${escapeHtml(String(c.id))}" ${c.status === 'rented' ? 'disabled' : ''}>${ICONS.toggle}</button>
            <button class="inv-icon-btn inv-view" title="View" data-act="view" data-id="${escapeHtml(String(c.id))}">${ICONS.view}</button>
            <button class="inv-icon-btn inv-edit" title="Edit" data-act="edit" data-id="${escapeHtml(String(c.id))}">${ICONS.edit}</button>
            <button class="inv-icon-btn inv-del" title="Delete" data-act="del" data-id="${escapeHtml(String(c.id))}" data-label="${escapeHtml(c.model)}">${ICONS.del}</button>
          </div>
        </div>`;
    }).join('');

    rowsEl.querySelectorAll('.inv-icon-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const act = btn.dataset.act;
        if (act === 'toggle') cycleStatus(id);
        else if (act === 'del') deleteCar(id, btn.dataset.label);
        else if (act === 'view') console.log('View', id); // TODO: open car details
        else if (act === 'edit') console.log('Edit', id); // TODO: open edit form
      });
    });
  }

  document.getElementById('invCount').textContent = `Showing ${rows.length} of ${total}`;
}

gateAdminAccess();
