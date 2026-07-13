// Page state
let selectedCar = null;

function isLoggedIn() {
  return !!sessionStorage.getItem('user_id');
}

/* HEADER — show logged-in user's first name, or prompt to sign in */
(function initHeaderUser() {
  const firstName = sessionStorage.getItem('first_name');
  const nameEl = document.getElementById('userFirstName');
  if (nameEl) nameEl.textContent = isLoggedIn() && firstName ? `Hello, ${firstName}` : 'Sign In';

  const banner = document.getElementById('guestBanner');
  if (banner) banner.hidden = isLoggedIn();

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) logoutBtn.hidden = !isLoggedIn();
})();

document.getElementById('accountBtn').addEventListener('click', () => {
  // Guests get sent to the login/signup page instead of the account page.
  window.location.href = isLoggedIn() ? 'account.html' : 'index.html';
});

/* LOGOUT */
document.getElementById('logoutBtn').addEventListener('click', () => {
  sessionStorage.clear();
  window.location.href = 'index.html';
});

/* UI HELPERS */
function setFieldMsg(id, msg, type) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.className   = 'field-msg' + (type ? ' ' + type : '');
}

function setInputState(input, state) {
  if (!input) return;
  input.classList.remove('is-valid', 'is-error');
  if (state) input.classList.add(state);
}

function setFormMsg(id, msg, type) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.className   = 'form-message' + (type ? ' ' + type : '');
}

function setLoading(btnId, loading) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled    = loading;
  btn.textContent = loading ? 'Please wait…' : btn.dataset.label;
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#39;');
}

/* ==== BROWSE CARS -> LOAD & RENDER ==== */
async function loadCars(filters = {}) {
  const grid    = document.getElementById('carGrid');
  const counter = document.getElementById('resultsCount');

  grid.innerHTML = `
    <div class="grid-loading">
      <div class="spinner"></div>
      <p>Loading available cars…</p>
    </div>`;
  counter.textContent = '';

  // API CALL (via api.js) — startDate/endDate ask the backend to exclude
  // any car whose existing reservations collide with the chosen range.
  const { ok, data } = await API.getCars(filters);

  if (!ok) {
    grid.innerHTML = `
      <div class="grid-empty">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <p>${escapeHtml(data.error || 'Could not reach the server.')}</p>
      </div>`;
    return;
  }

  const cars  = Array.isArray(data) ? data : [];
  const count = cars.length;
  counter.textContent = count === 0
    ? 'No cars match your search.'
    : `${count} car${count !== 1 ? 's' : ''} found`;

  renderCars(cars);
}

function renderCars(cars) {
  const grid = document.getElementById('carGrid');
  grid.innerHTML = '';

  if (!cars.length) {
    grid.innerHTML = `
      <div class="grid-empty">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <p>No cars found. Try adjusting your filters.</p>
      </div>`;
    return;
  }

  cars.forEach(car => {
    const card = document.createElement('article');
    card.className = 'car-card';

    const imgHTML = car.image_url
      ? `<img class="car-card__img" src="${escapeHtml(car.image_url)}" alt="${escapeHtml(car.model)}" loading="lazy">`
      : `<div class="car-card__img-placeholder">
           <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">
             <rect x="2" y="7" width="20" height="12" rx="2"/>
             <path d="M16 7l-1.5-3h-5L8 7"/>
             <circle cx="6.5" cy="19" r="1.5"/>
             <circle cx="17.5" cy="19" r="1.5"/>
           </svg>
         </div>`;

    card.innerHTML = `
      ${imgHTML}
      <div class="car-card__body">
        <h3 class="car-card__model">${escapeHtml(car.model)}</h3>
        <p class="car-card__meta">
          ${escapeHtml(car.type || '—')}
          <span class="car-card__meta-dot"></span>
          ${escapeHtml(car.location || '—')}
          <span class="car-card__meta-dot"></span>
          ${car.seats ? car.seats + ' seats' : '—'}
        </p>
        <p class="car-card__price">
          $${parseFloat(car.price || 0).toFixed(2)}<span>/ day</span>
        </p>
        <p class="car-card__id">ID: ${escapeHtml(String(car.id ?? ''))}</p>
      </div>
      <div class="car-card__footer">
        <button
          class="btn-reserve-card"
          data-car-id="${escapeHtml(String(car.id ?? ''))}"
          data-car-model="${escapeHtml(car.model)}"
          data-car-price="${car.price || 0}"
          data-car-seats="${escapeHtml(String(car.seats ?? ''))}"
          data-car-type="${escapeHtml(car.type || '')}"
          data-car-location="${escapeHtml(car.location || '')}">
          Reserve This Car
        </button>
      </div>`;

    grid.appendChild(card);
  });

  // Wire up Reserve buttons -> open modal
  grid.querySelectorAll('.btn-reserve-card').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!isLoggedIn()) {
        openAuthRequiredModal();
        return;
      }

      const filterStart = document.getElementById('filterStartDate').value;
      const filterEnd   = document.getElementById('filterEndDate').value;

      if (!filterStart || !filterEnd) {
        showNoticeModal(
          'Select Your Dates',
          'Please choose a pick-up and return date in the filters above before reserving a car.'
        );
        return;
      }

      selectedCar = {
        id:       btn.dataset.carId,
        model:    btn.dataset.carModel,
        price:    parseFloat(btn.dataset.carPrice) || 0,
        seats:    btn.dataset.carSeats,
        type:     btn.dataset.carType,
        location: btn.dataset.carLocation,
      };
      openReserveModal();
    });
  });
}

/* FILTER FORM (model / type / seats / date range) */
document.getElementById('filterForm').addEventListener('submit', e => {
  e.preventDefault();
  applyFilters();
});

function applyFilters() {
  const startDate = document.getElementById('filterStartDate').value;
  const endDate   = document.getElementById('filterEndDate').value;

  loadCars({
    model:     document.getElementById('searchModel').value.trim(),
    type:      document.getElementById('filterType').value,
    seats:     document.getElementById('filterSeats').value,
    location:  document.getElementById('filterLocation').value.trim(),
    startDate: startDate,
    endDate:   endDate,
  });
}

document.getElementById('clearFilters').addEventListener('click', () => {
  document.getElementById('searchModel').value     = '';
  document.getElementById('filterType').value      = '';
  document.getElementById('filterSeats').value     = '';
  document.getElementById('filterLocation').value  = '';
  document.getElementById('filterStartDate').value = '';
  document.getElementById('filterEndDate').value   = '';
  loadCars();
});

/* Keep filter end-date min in sync with start-date, and re-run the search
   automatically once both dates are set so the grid never shows cars that
   are actually unavailable for the currently-selected range. */
document.getElementById('filterStartDate').addEventListener('change', function () {
  document.getElementById('filterEndDate').min = this.value;
  if (document.getElementById('filterEndDate').value) applyFilters();
});

document.getElementById('filterEndDate').addEventListener('change', () => {
  if (document.getElementById('filterStartDate').value) applyFilters();
});

/* ==== LOCATION COMBOBOX (typeahead city search) ==== */

let allCities = [];

async function loadCities() {
  const { ok, data } = await API.getLocations();
  allCities = ok && Array.isArray(data) ? data : [];
}

function highlightMatch(city, query) {
  if (!query) return escapeHtml(city);
  const idx = city.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return escapeHtml(city);
  const before = escapeHtml(city.slice(0, idx));
  const match  = escapeHtml(city.slice(idx, idx + query.length));
  const after  = escapeHtml(city.slice(idx + query.length));
  return `${before}<mark>${match}</mark>${after}`;
}

function renderLocationDropdown(query) {
  const dropdown = document.getElementById('locationDropdown');
  const q = query.trim().toLowerCase();

  const matches = q
    ? allCities.filter(c => c.toLowerCase().includes(q))
    : allCities;

  if (!matches.length) {
    dropdown.innerHTML = `<li class="location-option--empty">No matching cities</li>`;
  } else {
    dropdown.innerHTML = matches
      .map(city => `<li class="location-option" data-city="${escapeHtml(city)}">${highlightMatch(city, query.trim())}</li>`)
      .join('');
  }

  dropdown.hidden = false;
}

const filterLocationInput = document.getElementById('filterLocation');
const locationDropdown    = document.getElementById('locationDropdown');

filterLocationInput.addEventListener('focus', () => renderLocationDropdown(filterLocationInput.value));
filterLocationInput.addEventListener('input', () => renderLocationDropdown(filterLocationInput.value));

locationDropdown.addEventListener('click', e => {
  const option = e.target.closest('.location-option');
  if (!option) return;
  filterLocationInput.value = option.dataset.city;
  locationDropdown.hidden = true;
});

document.addEventListener('click', e => {
  if (!document.getElementById('locationCombobox').contains(e.target)) {
    locationDropdown.hidden = true;
  }
});

loadCities();

/* ==== NOTICE MODAL (themed replacement for alert()) ==== */

function showNoticeModal(title, message) {
  document.getElementById('noticeModalTitle').textContent   = title;
  document.getElementById('noticeModalMessage').textContent = message;
  const overlay = document.getElementById('noticeModalOverlay');
  overlay.hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeNoticeModal() {
  document.getElementById('noticeModalOverlay').hidden = true;
  if (document.getElementById('reserveModalOverlay').hidden) {
    document.body.style.overflow = '';
  }
}

document.getElementById('noticeModalCloseBtn').addEventListener('click', closeNoticeModal);
document.getElementById('noticeModalOkBtn').addEventListener('click', closeNoticeModal);
document.getElementById('noticeModalOverlay').addEventListener('click', e => {
  if (e.target.id === 'noticeModalOverlay') closeNoticeModal();
});

/* ==== SIGN-IN REQUIRED MODAL (shown when a guest tries to reserve) ==== */

function openAuthRequiredModal() {
  const overlay = document.getElementById('authRequiredModalOverlay');
  overlay.hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeAuthRequiredModal() {
  document.getElementById('authRequiredModalOverlay').hidden = true;
  document.body.style.overflow = '';
}

document.getElementById('authRequiredCloseBtn').addEventListener('click', closeAuthRequiredModal);
document.getElementById('authRequiredGoBtn').addEventListener('click', () => {
  window.location.href = 'index.html';
});
document.getElementById('authRequiredModalOverlay').addEventListener('click', e => {
  if (e.target.id === 'authRequiredModalOverlay') closeAuthRequiredModal();
});

/* ==== RESERVE MODAL ==== */

function openReserveModal() {
  const overlay = document.getElementById('reserveModalOverlay');

  document.getElementById('res-carId').value = selectedCar.id;

  document.getElementById('selectedCarModel').textContent = selectedCar.model;
  document.getElementById('selectedCarMeta').textContent =
    `${selectedCar.type || '—'} · ${selectedCar.seats ? selectedCar.seats + ' seats' : '—'}`;
  document.getElementById('selectedCarPrice').textContent =
    `$${selectedCar.price.toFixed(2)} / day`;
  document.getElementById('selectedCarLocation').textContent =
    selectedCar.location ? `Pick-up & return at ${selectedCar.location}` : 'Pick-up & return location not available';

  // Dates come from the Browse Cars filters — the modal just displays them.
  const filterStart = document.getElementById('filterStartDate').value;
  const filterEnd   = document.getElementById('filterEndDate').value;

  document.getElementById('res-pickup-date-display').textContent = filterStart || '—';
  document.getElementById('res-return-date-display').textContent = filterEnd || '—';

  updateCostEstimate();

  overlay.hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeReserveModal() {
  const overlay = document.getElementById('reserveModalOverlay');
  overlay.hidden = true;
  document.body.style.overflow = '';

  selectedCar = null;
  document.getElementById('reserveForm').reset();
  document.getElementById('costEstimate').hidden = true;
  setFormMsg('reserve-msg', '', '');
  setFieldMsg('dates-msg', '', '');
}

document.getElementById('modalCloseBtn').addEventListener('click', closeReserveModal);

document.getElementById('reserveModalOverlay').addEventListener('click', e => {
  if (e.target.id === 'reserveModalOverlay') closeReserveModal();
});

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  const notice = document.getElementById('noticeModalOverlay');
  if (!notice.hidden) { closeNoticeModal(); return; }
  const authRequired = document.getElementById('authRequiredModalOverlay');
  if (!authRequired.hidden) { closeAuthRequiredModal(); return; }
  const overlay = document.getElementById('reserveModalOverlay');
  if (!overlay.hidden) closeReserveModal();
});

/* COST ESTIMATE */

function updateCostEstimate() {
  const pickupVal = document.getElementById('filterStartDate').value;
  const returnVal = document.getElementById('filterEndDate').value;
  const box       = document.getElementById('costEstimate');

  if (!pickupVal || !returnVal || !selectedCar) { box.hidden = true; return; }

  const days = Math.round(
    (new Date(returnVal) - new Date(pickupVal)) / (1000 * 60 * 60 * 24)
  );
  if (days <= 0) { box.hidden = true; return; }

  document.getElementById('estimateDays').textContent  = `${days} day${days !== 1 ? 's' : ''}`;
  document.getElementById('estimateRate').textContent  = `$${selectedCar.price.toFixed(2)} / day`;
  document.getElementById('estimateTotal').textContent = `$${(selectedCar.price * days).toFixed(2)}`;
  box.hidden = false;
}



/* RESERVATION FORM -> VALIDATION & SUBMIT */

document.getElementById('reserveForm').addEventListener('submit', async e => {
  e.preventDefault();
  setFormMsg('reserve-msg', '', '');

  // Defense in depth: re-check login right before submitting, in case the
  // session was cleared (e.g. logged out in another tab) while this modal
  // was open.
  if (!isLoggedIn()) {
    closeReserveModal();
    openAuthRequiredModal();
    return;
  }

  const carId      = document.getElementById('res-carId').value.trim();
  const pickupDate = document.getElementById('filterStartDate').value;
  const returnDate = document.getElementById('filterEndDate').value;
  const location   = (selectedCar && selectedCar.location) || '';
  const today      = new Date().toISOString().split('T')[0];

  let valid = true;

  if (!carId) {
    showNoticeModal('No Car Selected', 'Please select a car from Browse Cars first.');
    valid = false;
  }

  // Dates come from the Browse Cars filters (required before the modal can
  // even open), but re-validate here in case they were cleared meanwhile.
  if (!pickupDate || !returnDate) {
    setFieldMsg('dates-msg', 'Please set a pick-up and return date in the filters.', 'error');
    valid = false;
  } else if (pickupDate < today) {
    setFieldMsg('dates-msg', 'Pick-up date cannot be in the past.', 'error');
    valid = false;
  } else if (returnDate <= pickupDate) {
    setFieldMsg('dates-msg', 'Return date must be after pick-up date.', 'error');
    valid = false;
  } else {
    setFieldMsg('dates-msg', '');
  }

  if (!valid) return;

  setLoading('reserve-btn', true);

  const userId = sessionStorage.getItem('user_id');

  // API CALL (via api.js)
  const { ok, data } = await API.createReservation({
    user_id:         userId,
    car_id:          carId,
    PickUp_Date:     pickupDate,
    Return_Date:     returnDate,
    Pickup_Location: location,
    Return_Location: location,
  });

  if (ok) {
    setFormMsg('reserve-msg', "✓ Reservation confirmed! You're all set.", 'success');
    setLoading('reserve-btn', false);
    setTimeout(() => {
      closeReserveModal();
      applyFilters(); // refresh car list to reflect new booking
    }, 1200);
    return;
  } else {
    setFormMsg('reserve-msg', data.error || 'Reservation failed. Please try again.', 'error');
  }

  setLoading('reserve-btn', false);
});

const todayStr = new Date().toISOString().split('T')[0];
document.getElementById('filterStartDate').min = todayStr;
document.getElementById('filterEndDate').min   = todayStr;

loadCars();
