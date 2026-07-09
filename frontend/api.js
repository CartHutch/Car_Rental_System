const BASE_URL = 'http://127.0.0.1:5000'; // single backend - app.py

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
};