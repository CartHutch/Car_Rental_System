function isAuthorizedAdmin() {
  const userId = sessionStorage.getItem('user_id');
  const role = (sessionStorage.getItem('role') || '').trim().toLowerCase();
  return !!userId && role === 'admin';
}

function gateAdminAccess() {
  if (!isAuthorizedAdmin()) return; // restricted screen stays visible

  document.getElementById('restrictedScreen').hidden = true;
  document.getElementById('adminApp').hidden = false;
  initAdminDashboard();
}

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

function formatCost(amount) {
  const n = Number(amount) || 0;
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

const SHORT_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function formatShortDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  return `${SHORT_MONTHS[m - 1]} ${d}, ${y}`;
}

function userLabel(u) {
  return `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email || `User ${u.id}`;
}

function carLabel(c) {
  return c.model || `Car ${c.id}`;
}

function highlightMatch(text, query) {
  if (!query) return escapeHtml(text);
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return escapeHtml(text);
  const before = escapeHtml(text.slice(0, idx));
  const match  = escapeHtml(text.slice(idx, idx + query.length));
  const after  = escapeHtml(text.slice(idx + query.length));
  return `${before}<mark>${match}</mark>${after}`;
}

/* ── Dashboard state ── */
const POLL_INTERVAL_MS = 5000;

let allUsers = [];
let selectedUsers = [];   // [{ id, label }]
let allCars = [];
let selectedCars = [];    // [{ id, label }]
let rangeMode = 'all';    // 'all' | 'custom'
let rentalChart = null;
let carPieChart = null;
let typePieChart = null;
let pollTimer = null;
let fetchInFlight = false;

function initAdminDashboard() {
  document.getElementById('logoutBtn').addEventListener('click', () => {
    sessionStorage.clear();
    window.location.href = 'index.html';
  });

  setupUserCombobox();
  setupCarCombobox();
  setupRangeFilter();
  setupInfoPopovers();

  fetchAndRenderStats();
  pollTimer = setInterval(fetchAndRenderStats, POLL_INTERVAL_MS);
}

/* ── Metric explanations, shown on hover of the "i" info icons ── */
const METRIC_INFO = {
  totalRentals: 'How many bookings you\u2019ve had in this selection (cancellations don\u2019t count). Your best read on how busy the business has been.',
  totalRevenue: 'What this selection has earned you in total. Booking\u2019s daily rate × how many days it ran.',
  customersIncluded: 'How many of your customers actually booked something in this selection, versus your total customer base. A big gap between the two means most of your sign-ups aren\u2019t renting yet.',
  carsIncluded: 'How many cars from your fleet got booked in this selection, versus your full fleet size.',
  avgDuration: 'The average length of a booking, in days. Useful for knowing whether you\u2019re mostly doing quick day rentals or longer stretches.',
  avgRevenue: 'What a typical booking is worth to you. Total Revenue split evenly across Total Rentals.',
  topCar: 'Your best performing vehicle in this selection and what it brought in is worth knowing if you\u2019re deciding which cars to add more of.',
  dailyRevenue: 'Your estimated earnings for each day. A booking counts toward every day it\u2019s out, from pick-up to return. Good for spotting your busiest stretches.',
  revenueByCar: 'Which specific vehicles are earning you the most (top 6, everything else grouped into "Other cars"). Helps spot which cars to keep, replace, or buy more of.',
  revenueByType: 'Which kind of vehicle (SUV, Sedan, Truck, and etc.) is bringing in the most money, so you know what to expand your fleet with.',
};

function setupInfoPopovers() {
  const popover = document.getElementById('infoPopover');
  const popoverText = document.getElementById('infoPopoverText');
  let openIcon = null;
  let hideTimer = null;

  function positionPopover(icon) {
    const rect = icon.getBoundingClientRect();
    const popRect = popover.getBoundingClientRect();
    let left = rect.left;
    if (left + popRect.width > window.innerWidth - 16) {
      left = window.innerWidth - popRect.width - 16;
    }
    popover.style.top = `${rect.bottom + 8}px`;
    popover.style.left = `${Math.max(16, left)}px`;
  }

  function showPopover(icon) {
    clearTimeout(hideTimer);
    if (openIcon && openIcon !== icon) openIcon.classList.remove('info-icon--active');
    openIcon = icon;
    icon.classList.add('info-icon--active');
    popoverText.textContent = METRIC_INFO[icon.dataset.info] || '';
    popover.hidden = false;
    positionPopover(icon);
  }

  function scheduleHide() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      popover.hidden = true;
      if (openIcon) openIcon.classList.remove('info-icon--active');
      openIcon = null;
    }, 120);
  }

  document.querySelectorAll('.info-icon').forEach(icon => {
    icon.addEventListener('mouseenter', () => showPopover(icon));
    icon.addEventListener('mouseleave', scheduleHide);
    icon.addEventListener('focus', () => showPopover(icon));
    icon.addEventListener('blur', scheduleHide);
    // Tap-to-toggle for touch devices, where hover doesn't apply.
    icon.addEventListener('click', e => {
      e.stopPropagation();
      if (openIcon === icon && !popover.hidden) {
        scheduleHide();
      } else {
        showPopover(icon);
      }
    });
  });

  popover.addEventListener('mouseenter', () => clearTimeout(hideTimer));
  popover.addEventListener('mouseleave', scheduleHide);

  window.addEventListener('scroll', () => { if (openIcon) positionPopover(openIcon); }, true);
}

async function setupUserCombobox() {
  const requesterId = sessionStorage.getItem('user_id');
  const { ok, data } = await API.getAdminUsers(requesterId);
  if (ok) allUsers = data || [];

  const combobox    = document.getElementById('userCombobox');
  const searchInput = document.getElementById('userSearchInput');
  const dropdown    = document.getElementById('userDropdown');
  const allChip     = document.getElementById('allUsersChip');

  allChip.addEventListener('click', () => {
    if (!selectedUsers.length) return;
    selectedUsers = [];
    renderChips();
    fetchAndRenderStats();
  });

  function renderDropdown(query) {
    const q = query.trim().toLowerCase();

    const available = allUsers.filter(u => !selectedUsers.some(s => String(s.id) === String(u.id)));
    const matches = q
      ? available.filter(u => `${userLabel(u)} ${u.email || ''}`.toLowerCase().includes(q))
      : available;

    if (!matches.length) {
      dropdown.innerHTML = '<li class="user-dropdown-empty">No matching customers</li>';
      dropdown.hidden = false;
      return;
    }

    dropdown.innerHTML = matches.slice(0, 30).map(u => `
      <li class="user-dropdown-item" data-id="${escapeHtml(String(u.id))}">
        <span class="user-dropdown-name">${highlightMatch(userLabel(u), query.trim())}</span>
        <span class="user-dropdown-email">${escapeHtml(u.email || '')}</span>
      </li>
    `).join('');
    dropdown.hidden = false;

    dropdown.querySelectorAll('.user-dropdown-item').forEach(li => {
      li.addEventListener('click', () => {
        const user = allUsers.find(u => String(u.id) === li.dataset.id);
        if (user) {
          selectedUsers.push({ id: user.id, label: userLabel(user) });
          renderChips();
          fetchAndRenderStats();
        }
        searchInput.value = '';
        dropdown.hidden = true;
      });
    });
  }

  searchInput.addEventListener('focus', () => renderDropdown(searchInput.value));
  searchInput.addEventListener('input', () => renderDropdown(searchInput.value));

  document.addEventListener('click', e => {
    if (!combobox.contains(e.target)) dropdown.hidden = true;
  });

  renderChips();
}

function renderChips() {
  const chipsWrap = document.getElementById('userChips');
  const allChip   = document.getElementById('allUsersChip');

  allChip.classList.toggle('user-chip--all-active', selectedUsers.length === 0);
  chipsWrap.querySelectorAll('.user-chip--selected').forEach(c => c.remove());

  selectedUsers.forEach(u => {
    const chip = document.createElement('span');
    chip.className = 'user-chip user-chip--selected';
    chip.innerHTML = `${escapeHtml(u.label)} <button type="button" class="user-chip-remove" aria-label="Remove ${escapeHtml(u.label)}">✕</button>`;
    chip.querySelector('.user-chip-remove').addEventListener('click', () => {
      selectedUsers = selectedUsers.filter(su => String(su.id) !== String(u.id));
      renderChips();
      fetchAndRenderStats();
    });
    chipsWrap.appendChild(chip);
  });
}

/* ── Car multi-select combobox (same interaction model as the customer
   combobox above) ── */
async function setupCarCombobox() {
  const requesterId = sessionStorage.getItem('user_id');
  const { ok, data } = await API.getAdminCars(requesterId);
  if (ok) allCars = data || [];

  const combobox    = document.getElementById('carCombobox');
  const searchInput = document.getElementById('carSearchInput');
  const dropdown    = document.getElementById('carDropdown');
  const allChip     = document.getElementById('allCarsChip');

  allChip.addEventListener('click', () => {
    if (!selectedCars.length) return;
    selectedCars = [];
    renderCarChips();
    fetchAndRenderStats();
  });

  function renderDropdown(query) {
    const q = query.trim().toLowerCase();

    const available = allCars.filter(c => !selectedCars.some(s => String(s.id) === String(c.id)));
    const matches = q
      ? available.filter(c => `${carLabel(c)} ${c.type || ''} ${c.location || ''}`.toLowerCase().includes(q))
      : available;

    if (!matches.length) {
      dropdown.innerHTML = '<li class="user-dropdown-empty">No matching cars</li>';
      dropdown.hidden = false;
      return;
    }

    dropdown.innerHTML = matches.slice(0, 30).map(c => `
      <li class="user-dropdown-item" data-id="${escapeHtml(String(c.id))}">
        <span class="user-dropdown-name">${highlightMatch(carLabel(c), query.trim())}</span>
        <span class="user-dropdown-email">${escapeHtml(c.location || '')}</span>
      </li>
    `).join('');
    dropdown.hidden = false;

    dropdown.querySelectorAll('.user-dropdown-item').forEach(li => {
      li.addEventListener('click', () => {
        const car = allCars.find(c => String(c.id) === li.dataset.id);
        if (car) {
          selectedCars.push({ id: car.id, label: carLabel(car) });
          renderCarChips();
          fetchAndRenderStats();
        }
        searchInput.value = '';
        dropdown.hidden = true;
      });
    });
  }

  searchInput.addEventListener('focus', () => renderDropdown(searchInput.value));
  searchInput.addEventListener('input', () => renderDropdown(searchInput.value));

  document.addEventListener('click', e => {
    if (!combobox.contains(e.target)) dropdown.hidden = true;
  });

  renderCarChips();
}

function renderCarChips() {
  const chipsWrap = document.getElementById('carChips');
  const allChip   = document.getElementById('allCarsChip');

  allChip.classList.toggle('user-chip--all-active', selectedCars.length === 0);
  chipsWrap.querySelectorAll('.user-chip--selected').forEach(c => c.remove());

  selectedCars.forEach(c => {
    const chip = document.createElement('span');
    chip.className = 'user-chip user-chip--selected';
    chip.innerHTML = `${escapeHtml(c.label)} <button type="button" class="user-chip-remove" aria-label="Remove ${escapeHtml(c.label)}">✕</button>`;
    chip.querySelector('.user-chip-remove').addEventListener('click', () => {
      selectedCars = selectedCars.filter(sc => String(sc.id) !== String(c.id));
      renderCarChips();
      fetchAndRenderStats();
    });
    chipsWrap.appendChild(chip);
  });
}

/* ── Duration filter ── */
function setupRangeFilter() {
  const pills      = document.querySelectorAll('.range-pill');
  const rangeDates = document.getElementById('rangeDates');
  const startInput = document.getElementById('statsStartDate');
  const endInput   = document.getElementById('statsEndDate');

  pills.forEach(pill => {
    pill.addEventListener('click', () => {
      if (pill.classList.contains('range-pill--active')) return;

      pills.forEach(p => p.classList.remove('range-pill--active'));
      pill.classList.add('range-pill--active');
      rangeMode = pill.dataset.range;
      rangeDates.hidden = rangeMode !== 'custom';

      if (rangeMode === 'all') {
        startInput.value = '';
        endInput.value   = '';
        fetchAndRenderStats();
      }
    });
  });

  [startInput, endInput].forEach(input => {
    input.addEventListener('change', () => {
      if (rangeMode === 'custom' && startInput.value && endInput.value) {
        fetchAndRenderStats();
      }
    });
  });

  startInput.addEventListener('change', () => {
    endInput.min = startInput.value;
  });
}

/* ── Fetch + render ── */
async function fetchAndRenderStats() {
  if (fetchInFlight) return; // don't stack overlapping polls
  fetchInFlight = true;

  const requesterId = sessionStorage.getItem('user_id');
  const userIds     = selectedUsers.map(u => u.id);
  const carIds      = selectedCars.map(c => c.id);
  const startDate    = rangeMode === 'custom' ? document.getElementById('statsStartDate').value : '';
  const endDate      = rangeMode === 'custom' ? document.getElementById('statsEndDate').value   : '';

  if (rangeMode === 'custom' && (!startDate || !endDate)) {
    fetchInFlight = false;
    return;
  }

  const { ok, data } = await API.getAdminRentalStats({ requesterId, userIds, carIds, startDate, endDate });
  fetchInFlight = false;

  if (!ok) return;

  renderScopeLine(startDate, endDate);
  renderSummary(data.totals || {});
  renderChart(data.series || []);
  carPieChart = renderPieChart('revenueByCarChart', 'carPieEmpty', data.revenue_by_car || [], carPieChart);
  typePieChart = renderPieChart('revenueByTypeChart', 'typePieEmpty', data.revenue_by_type || [], typePieChart);
}

function renderScopeLine(startDate, endDate) {
  const parts = [];
  parts.push(selectedUsers.length
    ? `${selectedUsers.length} customer${selectedUsers.length > 1 ? 's' : ''}`
    : 'All Customers');
  parts.push(selectedCars.length
    ? `${selectedCars.length} car${selectedCars.length > 1 ? 's' : ''}`
    : 'All Cars');
  parts.push(rangeMode === 'custom' && startDate && endDate
    ? `${formatShortDate(startDate)} – ${formatShortDate(endDate)}`
    : 'All Time');
  document.getElementById('statsScope').textContent = `Showing: ${parts.join(' · ')}`;
}

function renderSummary(totals) {
  document.getElementById('statTotalRentals').textContent = totals.total_rentals ?? 0;
  document.getElementById('statTotalRevenue').textContent = formatCost(totals.total_revenue ?? 0);
  document.getElementById('statUniqueUsers').innerHTML =
    `${totals.unique_users ?? 0} <span class="stat-value-suffix">/ ${totals.total_customers_db ?? 0} total</span>`;
  document.getElementById('statUniqueCars').innerHTML =
    `${totals.unique_cars ?? 0} <span class="stat-value-suffix">/ ${totals.total_cars_db ?? 0} in fleet</span>`;
  document.getElementById('statAvgDuration').textContent  = `${totals.avg_duration_days ?? 0} days`;
  document.getElementById('statAvgRevenue').textContent   = formatCost(totals.avg_revenue_per_rental ?? 0);
  document.getElementById('statTopCar').textContent       = totals.top_car
    ? `${totals.top_car} (${formatCost(totals.top_car_revenue ?? 0)})`
    : '—';
}

function renderChart(series) {
  const canvas  = document.getElementById('rentalChart');
  const loading = document.getElementById('chartLoading');
  const empty   = document.getElementById('chartEmpty');

  loading.hidden = true;

  if (!series.length) {
    canvas.hidden = true;
    empty.hidden  = false;
    return;
  }
  empty.hidden  = true;
  canvas.hidden = false;

  const labels = series.map(p => formatShortDate(p.date));
  const totals = series.map(p => p.total_cost);

  // afterBody tooltip callback looks this up by dataIndex to show which
  // cars/customers were actually active on the hovered day.
  const dayDetails = series;

  function tooltipDetailLines(ctx) {
    const day = dayDetails[ctx[0]?.dataIndex];
    if (!day) return [];
    const lines = [];
    if (day.cars && day.cars.length) {
      const more = day.cars_more ? ` +${day.cars_more} more` : '';
      lines.push(`Cars: ${day.cars.join(', ')}${more}`);
    } else {
      lines.push('Cars: none active');
    }
    if (day.customers && day.customers.length) {
      const more = day.customers_more ? ` +${day.customers_more} more` : '';
      lines.push(`Customers: ${day.customers.join(', ')}${more}`);
    }
    return lines;
  }

  if (!rentalChart) {
    rentalChart = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Daily Rental Revenue',
            data: totals,
            borderColor: '#1e8449',
            backgroundColor: 'rgba(30,132,73,0.08)',
            yAxisID: 'yCost',
            tension: 0.3,
            fill: true,
            pointRadius: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 300 },
        interaction: { mode: 'index', intersect: false },
        scales: {
          yCost: {
            type: 'linear',
            position: 'left',
            beginAtZero: true,
            title: { display: true, text: 'Revenue' },
            ticks: { callback: v => `$${v}` },
          },
        },
        plugins: {
          legend: {
            position: 'top',
            onClick: () => {},
          },
          tooltip: {
            callbacks: {
              label: ctx => `Revenue: ${formatCost(ctx.parsed.y)}`,
              afterBody: tooltipDetailLines,
            },
          },
        },
      },
    });
    rentalChart._dayDetails = dayDetails;
  } else {
    rentalChart.data.labels = labels;
    rentalChart.data.datasets[0].data = totals;
    rentalChart._dayDetails = dayDetails;
    rentalChart.options.plugins.tooltip.callbacks.afterBody = tooltipDetailLines;
    rentalChart.update();
  }
}

/* ── Revenue breakdown pie/doughnut charts (used for both the
   per-car and per-type breakdowns — same shape, different data) ── */
const PIE_COLORS = ['#09193a', '#1e8449', '#c0392b', '#e67e22', '#8e44ad', '#1a56db', '#9a9fb0'];

function renderPieChart(canvasId, emptyId, items, existingChart) {
  const canvas = document.getElementById(canvasId);
  const empty  = document.getElementById(emptyId);
  if (!canvas) return existingChart;

  const filtered = items.filter(i => i.value > 0);

  if (!filtered.length) {
    canvas.hidden = true;
    empty.hidden  = false;
    if (existingChart) existingChart.destroy();
    return null;
  }
  empty.hidden  = true;
  canvas.hidden = false;

  const labels = filtered.map(i => i.label);
  const values = filtered.map(i => i.value);
  const colors = labels.map((_, i) => PIE_COLORS[i % PIE_COLORS.length]);

  if (existingChart) {
    existingChart.data.labels = labels;
    existingChart.data.datasets[0].data = values;
    existingChart.data.datasets[0].backgroundColor = colors;
    existingChart.update();
    return existingChart;
  }

  return new Chart(canvas.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data: values, backgroundColor: colors, borderWidth: 2, borderColor: '#ffffff' }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 300 },
      plugins: {
        legend: { position: 'right', labels: { boxWidth: 12, font: { size: 11 } } },
        tooltip: {
          callbacks: {
            label: ctx => `${ctx.label}: ${formatCost(ctx.parsed)}`,
          },
        },
      },
    },
  });
}

gateAdminAccess();