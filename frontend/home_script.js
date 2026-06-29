// Page state
let selectedCar = null;

/* Tab Switching */
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.tab;
    document.querySelectorAll('.tab-btn').forEach(b => {
      b.classList.remove('active');
      b.setAttribute('aria-selected', 'false');
    });
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    btn.setAttribute('aria-selected', 'true');
    document.getElementById(`tab-${target}`).classList.add('active');
  });
});

function switchToTab(tabName) {
  document.querySelector(`.tab-btn[data-tab="${tabName}"]`).click();
}

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

  // API CALL (via api.js)
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
          data-car-price="${car.price || 0}">
          Reserve This Car
        </button>
      </div>`;

    grid.appendChild(card);
  });

  // Wire up Reserve buttons
  grid.querySelectorAll('.btn-reserve-card').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedCar = {
        id:    btn.dataset.carId,
        model: btn.dataset.carModel,
        price: parseFloat(btn.dataset.carPrice) || 0,
      };

      document.getElementById('res-carId').value = selectedCar.id;
      setInputState(document.getElementById('res-carId'), 'is-valid');

      document.getElementById('selectedCarName').textContent =
        `${selectedCar.model} (ID: ${selectedCar.id}) — $${selectedCar.price.toFixed(2)}/day`;
      document.getElementById('selectedCarBanner').hidden = false;

      updateCostEstimate();
      switchToTab('reserve');
    });
  });
}

/* FILTER FORM*/
document.getElementById('filterForm').addEventListener('submit', e => {
  e.preventDefault();
  loadCars({
    model: document.getElementById('searchModel').value.trim(),
    type:  document.getElementById('filterType').value,
    seats: document.getElementById('filterSeats').value,
  });
});

document.getElementById('clearFilters').addEventListener('click', () => {
  document.getElementById('searchModel').value = '';
  document.getElementById('filterType').value  = '';
  document.getElementById('filterSeats').value = '';
  loadCars();
});

/* COST ESTIMATE */

function updateCostEstimate() {
  const pickupVal = document.getElementById('res-pickup-date').value;
  const returnVal = document.getElementById('res-return-date').value;
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

['res-pickup-date', 'res-return-date'].forEach(id =>
  document.getElementById(id).addEventListener('change', updateCostEstimate)
);

/* Keep return-date min in sync */
document.getElementById('res-pickup-date').addEventListener('change', function () {
  document.getElementById('res-return-date').min = this.value;
});

/* CLEAR SELECTED CAR */

document.getElementById('clearCarBtn').addEventListener('click', () => {
  selectedCar = null;
  document.getElementById('res-carId').value              = '';
  document.getElementById('selectedCarBanner').hidden      = true;
  document.getElementById('costEstimate').hidden           = true;
  setInputState(document.getElementById('res-carId'), '');
});

/* RESERVATION FORM -> VALIDATION & SUBMIT */

document.getElementById('reserveForm').addEventListener('submit', async e => {
  e.preventDefault();
  setFormMsg('reserve-msg', '', '');

  const carId      = document.getElementById('res-carId').value.trim();
  const pickupDate = document.getElementById('res-pickup-date').value;
  const returnDate = document.getElementById('res-return-date').value;
  const pickupLoc  = document.getElementById('res-pickup-loc').value.trim();
  const returnLoc  = document.getElementById('res-return-loc').value.trim();
  const today      = new Date().toISOString().split('T')[0];

  let valid = true;

  if (!carId) {
    setFieldMsg('carId-msg', 'Please enter or select a Car ID.', 'error');
    setInputState(document.getElementById('res-carId'), 'is-error');
    valid = false;
  } else {
    setFieldMsg('carId-msg', '');
    setInputState(document.getElementById('res-carId'), 'is-valid');
  }

  if (!pickupDate) {
    setFieldMsg('pickupDate-msg', 'Pick-up date is required.', 'error');
    setInputState(document.getElementById('res-pickup-date'), 'is-error');
    valid = false;
  } else if (pickupDate < today) {
    setFieldMsg('pickupDate-msg', 'Pick-up date cannot be in the past.', 'error');
    setInputState(document.getElementById('res-pickup-date'), 'is-error');
    valid = false;
  } else {
    setFieldMsg('pickupDate-msg', '');
    setInputState(document.getElementById('res-pickup-date'), 'is-valid');
  }

  if (!returnDate) {
    setFieldMsg('returnDate-msg', 'Return date is required.', 'error');
    setInputState(document.getElementById('res-return-date'), 'is-error');
    valid = false;
  } else if (pickupDate && returnDate <= pickupDate) {
    setFieldMsg('returnDate-msg', 'Return date must be after pick-up date.', 'error');
    setInputState(document.getElementById('res-return-date'), 'is-error');
    valid = false;
  } else {
    setFieldMsg('returnDate-msg', '');
    setInputState(document.getElementById('res-return-date'), 'is-valid');
  }

  if (!pickupLoc) {
    setFieldMsg('pickupLoc-msg', 'Pick-up location is required.', 'error');
    setInputState(document.getElementById('res-pickup-loc'), 'is-error');
    valid = false;
  } else {
    setFieldMsg('pickupLoc-msg', '');
    setInputState(document.getElementById('res-pickup-loc'), 'is-valid');
  }

  if (!returnLoc) {
    setFieldMsg('returnLoc-msg', 'Return location is required.', 'error');
    setInputState(document.getElementById('res-return-loc'), 'is-error');
    valid = false;
  } else {
    setFieldMsg('returnLoc-msg', '');
    setInputState(document.getElementById('res-return-loc'), 'is-valid');
  }

  if (!valid) return;

  setLoading('reserve-btn', true);

  //API CALL (via api.js)
  const { ok, data } = await API.createReservation({
    user_id:         sessionStorage.getItem('user_id') || null,
    car_id:          carId,
    PickUp_Date:     pickupDate,
    Return_Date:     returnDate,
    Pickup_Location: pickupLoc,
    Return_Location: returnLoc,
  });

  if (ok) {
    setFormMsg('reserve-msg', "✓ Reservation confirmed! You're all set.", 'success');
    document.getElementById('reserveForm').reset();
    document.querySelectorAll('#reserveForm .form-input').forEach(i => setInputState(i, ''));
    document.querySelectorAll('#reserveForm .field-msg').forEach(m => {
      m.textContent = ''; m.className = 'field-msg';
    });
    document.getElementById('costEstimate').hidden      = true;
    document.getElementById('selectedCarBanner').hidden = true;
    selectedCar = null;
  } else {
    setFormMsg('reserve-msg', data.error || 'Reservation failed. Please try again.', 'error');
  }

  setLoading('reserve-btn', false);
});

const todayStr = new Date().toISOString().split('T')[0];
document.getElementById('res-pickup-date').min = todayStr;
document.getElementById('res-return-date').min = todayStr;

loadCars();