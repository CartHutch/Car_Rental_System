const BASE_URL = 'https://car-rental-system-23td.onrender.com';

/* ===== Low Level Helpers =====
   - Internal wrapper around fetch.
   - Returns { ok, status, data } never throws.
   - Callers check "ok" and read "data" or "data.error"
*/
async function _request(url, options = {}) {
  try {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    let data;
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      data = await res.json();
    } else {
      data = { message: await res.text() };
    }
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    console.error('[API] Network error:', err);
    return {
      ok: false,
      status: 0,
      data: { error: 'Could not reach the server. Make sure your backend is running.' },
    };
  }
}

const API = {
  /* AUTH for login */

  /**
   * POST /register
   * @param {{ first_name, last_name, email, phone_number, password,
   *           street, city, province, country, postal_code, dob }} payload
   */
  register(payload) {
    return _request(`${BASE_URL}/register`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /**
   * POST /login
   * @param {{ email, password }} payload
   * @returns {{ ok, status, data: { user_id, first_name, last_name } }}
   */
  login(payload) {
    return _request(`${BASE_URL}/login`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /* Account info */

  /**
   * GET /api/users/:id
   * @param {string|number} userId
   */
  getUser(userId) {
    return _request(`${BASE_URL}/api/users/${userId}`);
  },

  /**
   * GET /api/reservations/:user_id — a user's reservations, already split
   * into "upcoming" and "history" and joined with each car's model/image/price.
   * @param {string|number} userId
   * @returns {{ ok, status, data: { upcoming: Reservation[], history: Reservation[] } }}
   */
  getUserReservations(userId) {
    return _request(`${BASE_URL}/api/reservations/${userId}`);
  },

  /**
   * DELETE /api/reservations/:reservation_id — cancels a single reservation.
   * Passing userId scopes the cancel so a user can only cancel their own booking.
   * @param {string|number} reservationId
   * @param {string|number} [userId]
   * @returns {{ ok, status, data: { message } | { error } }}
   */
  cancelReservation(reservationId, userId) {
    const qs = userId ? `?user_id=${encodeURIComponent(userId)}` : '';
    return _request(`${BASE_URL}/api/reservations/${reservationId}${qs}`, {
      method: 'DELETE',
    });
  },

  /* Cars Search */

  /**
   * GET /locations — distinct list of car pickup/drop-off cities, for the
   * location typeahead filter.
   * @returns {{ ok, status, data: string[] }}
   */
  getLocations() {
    return _request(`${BASE_URL}/locations`);
  },

  /**
   * GET /cars (with optional filters)
   * Passing startDate/endDate also asks the backend to omit any car whose
   * existing reservations collide with that range, and every returned car
   * carries a 'reservations' array (its own already-booked date ranges) so
   * the UI can render "already booked" tags regardless of filtering.
   * @param {{ model?: string, type?: string, seats?: string|number,
   *           location?: string, startDate?: string, endDate?: string }} filters
   * @returns {{ ok, status, data: Car[] }}
   */
  getCars({ model = '', type = '', seats = '', location = '', startDate = '', endDate = '' } = {}) {
    const params = new URLSearchParams();
    if (model) params.append('model', model);
    if (type) params.append('type', type);
    if (seats) params.append('seats', seats);
    if (location) params.append('location', location);
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);
    const qs = params.toString();
    const url = qs ? `${BASE_URL}/cars?${qs}` : `${BASE_URL}/cars`;
    return _request(url);
  },

  /* Car Reservation */

  /**
   * POST /api/reservations
   * @param {{ user_id, car_id, PickUp_Date, Return_Date,
   *           Pickup_Location, Return_Location }} payload
   */
  createReservation(payload) {
    return _request(`${BASE_URL}/api/reservations`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /* Admin */

  /**
   * GET /api/admin/users — full user list for the admin dashboard's
   * user search/select filter. Requires the caller to already be an admin.
   * @param {string|number} requesterId
   * @returns {{ ok, status, data: {id, first_name, last_name, email}[] }}
   */
  getAdminUsers(requesterId) {
    const qs = new URLSearchParams({ requester_id: requesterId }).toString();
    return _request(`${BASE_URL}/api/admin/users?${qs}`);
  },

  /**
   * GET /api/admin/cars — full car list for the admin dashboard's car
   * search/select filter.
   * @param {string|number} requesterId
   * @returns {{ ok, status, data: {id, model, type, location, price}[] }}
   */
  getAdminCars(requesterId) {
    const qs = new URLSearchParams({ requester_id: requesterId }).toString();
    return _request(`${BASE_URL}/api/admin/cars?${qs}`);
  },

  /**
   * GET /api/admin/rental-stats — daily total_cost series (with per-day
   * active car/customer names for hover detail), optionally scoped to
   * specific users, specific cars, and/or a date range. Also returns
   * revenue breakdowns by car and by car type for pie charts, and totals
   * that include both the filtered counts and the all-time DB counts.
   * @param {{ requesterId, userIds?: (string|number)[], carIds?: (string|number)[], startDate?: string, endDate?: string }} opts
   * @returns {{ ok, status, data: { series: object[], totals: object, revenue_by_car: {label,value}[], revenue_by_type: {label,value}[] } }}
   */
  getAdminRentalStats({ requesterId, userIds = [], carIds = [], startDate = '', endDate = '' } = {}) {
    const params = new URLSearchParams({ requester_id: requesterId });
    if (userIds.length) params.append('user_ids', userIds.join(','));
    if (carIds.length) params.append('car_ids', carIds.join(','));
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);
    return _request(`${BASE_URL}/api/admin/rental-stats?${params.toString()}`);
  },

  /**
   * POST /api/admin/cars
   * @param {{ requester_id, model, type, seats, location, price, image_url }} payload
   */
  createCar(payload) {
    return _request(`${BASE_URL}/api/admin/cars`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /**
   * PATCH /api/admin/cars/:id/status — cycles a car's inventory status
   * (available / rented / maintenance). Admin only.
   * @param {string|number} carId
   * @param {'available'|'rented'|'maintenance'} status
   * @param {string|number} requesterId
   */
  updateCarStatus(carId, status, requesterId) {
    return _request(`${BASE_URL}/api/admin/cars/${carId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, requester_id: requesterId }),
    });
  },

  /**
   * DELETE /api/admin/cars/:id — removes a car from inventory. Admin only.
   * If the car has upcoming (not-yet-started) reservations, the backend
   * responds 409 with { requires_confirmation, future_count, message } —
   * call again with confirmCancelFuture: true to proceed (this cancels
   * those reservations and emails the affected customers). If the car is
   * currently out on an active rental, it isn't deleted yet — the backend
   * schedules it via delete_after and responds 200 with that date instead.
   * @param {string|number} carId
   * @param {string|number} requesterId
   * @param {{ confirmCancelFuture?: boolean }} [opts]
   */
  deleteCar(carId, requesterId, { confirmCancelFuture = false } = {}) {
    const params = new URLSearchParams({ requester_id: requesterId });
    if (confirmCancelFuture) params.append('confirm_cancel_future', 'true');
    return _request(`${BASE_URL}/api/admin/cars/${carId}?${params.toString()}`, {
      method: 'DELETE',
    });
  },
};
