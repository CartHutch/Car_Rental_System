const BASE_URL = 'http://127.0.0.1:5000';  // single backend - app.py

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
      ok:     false,
      status: 0,
      data:   { error: 'Could not reach the server. Make sure your backend is running.' },
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
      body:   JSON.stringify(payload),
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
      body:   JSON.stringify(payload),
    });
  },

  /* Cars Search */

  /**
   * GET /cars  (with optional filters)
   * @param {{ model?: string, type?: string, seats?: string|number }} filters
   * @returns {{ ok, status, data: Car[] }}
   */
  getCars({ model = '', type = '', seats = '' } = {}) {
    const params = new URLSearchParams();
    if (model) params.append('model', model);
    if (type)  params.append('type',  type);
    if (seats) params.append('seats', seats);

    const qs  = params.toString();
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
      body:   JSON.stringify(payload),
    });
  },

};