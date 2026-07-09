from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from supabase import create_client
from email_sender import send_confirmation_email
from dotenv import load_dotenv
from datetime import datetime, date
import hashlib
import os
import traceback

load_dotenv()

app = Flask(__name__)
CORS(app)

# ===== Supabase Connection ======
SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_KEY"]
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# frontend/ lives one level up from this file (backend/app.py -> ../frontend)
FRONTEND_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "frontend")


# ===== AUTH for Login / Sign Up ======
@app.route("/register", methods=["POST"])
def register():
    try:
        data = request.json
        required = ["first_name", "last_name", "email", "password"]
        for field in required:
            if not data.get(field):
                return jsonify({"error": f"'{field}' is required."}), 400

        email = data["email"].strip().lower()
        # Strip password too, so a stray leading/trailing space (e.g. from
        # autofill) can't create a hash mismatch between signup and login.
        password = data["password"].strip()

        # Check if email already exists
        existing = supabase.table("users").select("id").eq("email", email).execute()
        if existing.data:
            return jsonify({"error": "An account with that email already exists."}), 409

        # Hash password (use bcrypt in production using supabase)
        password_hash = hashlib.sha256(password.encode()).hexdigest()

        new_user = {
            "first_name": data.get("first_name", "").strip(),
            "last_name": data.get("last_name", "").strip(),
            "email": email,
            "password": password_hash,
            "phone_number": data.get("phone_number", "").strip(),
            "street": data.get("street", "").strip(),
            "city": data.get("city", "").strip(),
            "province": data.get("province", "").strip(),
            "country": data.get("country", "").strip(),
            "postal_code": data.get("postal_code", "").strip(),
            "dob": data.get("dob") or None,
        }

        result = supabase.table("users").insert(new_user).execute()
        if not result.data:
            return jsonify({"error": "Registration failed. Please try again."}), 500

        user = result.data[0]
        return jsonify({
            "message": "Account created successfully.",
            "user_id": user["id"],
            "first_name": user["first_name"],
            "last_name": user["last_name"],
        }), 201

    except Exception as e:
        traceback.print_exc()  # This prints the full error details to your terminal
        return jsonify({"error": str(e)}), 500


@app.route("/login", methods=["POST"])
def login():
    try:
        data = request.json
        email = (data.get("email") or "").strip().lower()
        password = (data.get("password") or "").strip()

        if not email or not password:
            return jsonify({"error": "Email and password are required."}), 400

        password_hash = hashlib.sha256(password.encode()).hexdigest()

        result = (
            supabase.table("users")
            .select("id, first_name, last_name, email")
            .eq("email", email)
            .eq("password", password_hash)
            .execute()
        )

        if not result.data:
            return jsonify({"error": "Invalid email or password."}), 401

        user = result.data[0]
        return jsonify({
            "message": "Login successful.",
            "user_id": user["id"],
            "first_name": user["first_name"],
            "last_name": user["last_name"],
        }), 200

    except Exception as e:
        print("Login error:", e)
        return jsonify({"error": "An unexpected error occurred."}), 500


# ===== Cars Search =====
@app.route("/locations", methods=["GET"])
def get_locations():
    try:
        rows = supabase.table("cars").select("location").execute().data or []
        cities = sorted({r["location"] for r in rows if r.get("location")})
        return jsonify(cities), 200
    except Exception as e:
        print("Get locations error:", e)
        return jsonify({"error": "Failed to fetch locations."}), 500


@app.route("/cars", methods=["GET"])
def get_cars():
    try:
        model = request.args.get("model")
        car_type = request.args.get("type")
        seats = request.args.get("seats")
        location = request.args.get("location")
        start_date = request.args.get("start_date")  # requested pick-up date
        end_date = request.args.get("end_date")  # requested return date

        query = supabase.table("cars").select("*")
        if model:
            query = query.ilike("model", f"%{model}%")
        if car_type:
            query = query.eq("type", car_type)
        if seats:
            query = query.eq("seats", int(seats))
        if location:
            query = query.ilike("location", f"%{location}%")

        cars = query.execute().data or []
        # Normalize to strings so this always matches how reservations.car_id
        # is looked up/stored elsewhere (see create_reservation / get_user_reservations).
        car_ids = [str(c["id"]) for c in cars]

        # Pull existing reservations for these cars so we can (a) filter out
        # cars that collide with the requested date range, and (b) attach
        # each car's booked ranges to the response for the UI to show.
        reservations_by_car = {}
        if car_ids:
            res_rows = (
                supabase.table("reservations")
                .select("car_id, PickUp_Date, Return_Date")
                .in_("car_id", car_ids)
                .execute()
                .data
                or []
            )
            for r in res_rows:
                reservations_by_car.setdefault(str(r["car_id"]), []).append({
                    "PickUp_Date": r["PickUp_Date"],
                    "Return_Date": r["Return_Date"],
                })

        def ranges_overlap(a_start, a_end, b_start, b_end):
            # Two [start, end) date ranges collide if they intersect at all.
            return a_start < b_end and b_start < a_end

        result_cars = []
        for c in cars:
            car_reservations = reservations_by_car.get(str(c["id"]), [])
            c["reservations"] = car_reservations
            if start_date and end_date:
                collides = any(
                    ranges_overlap(start_date, end_date, r["PickUp_Date"], r["Return_Date"])
                    for r in car_reservations
                )
                if collides:
                    continue
            result_cars.append(c)

        return jsonify(result_cars), 200

    except Exception as e:
        print("Get cars error:", e)
        return jsonify({"error": "Failed to fetch cars."}), 500


# ===== Cars Reservations =====
def _compute_days(pickup, ret):
    """Shared helper: number of rental days between two YYYY-MM-DD strings."""
    try:
        d1 = datetime.strptime(pickup, "%Y-%m-%d")
        d2 = datetime.strptime(ret, "%Y-%m-%d")
        return max((d2 - d1).days, 0)
    except (TypeError, ValueError):
        return 0


@app.route("/api/reservations", methods=["POST"])
def create_reservation():
    try:
        data = request.json
        required = ["car_id", "PickUp_Date", "Return_Date", "Pickup_Location", "Return_Location"]
        for field in required:
            if not data.get(field):
                return jsonify({"error": f"'{field}' is required."}), 400

        # Normalize car_id to a string so it always matches how we look it
        # up elsewhere (cars_by_id in get_user_reservations, reservations_by_car
        # in get_cars, etc). This is what prevents "car_id type drift" bugs.
        car_id = str(data["car_id"]).strip()

        # Basic date valid check
        if data["Return_Date"] <= data["PickUp_Date"]:
            return jsonify({"error": "Return date must be after pick-up date."}), 400

        # Prevent double-booking: reject if this car already has a
        # reservation that overlaps the requested date range.
        existing = (
            supabase.table("reservations")
            .select("PickUp_Date, Return_Date")
            .eq("car_id", car_id)
            .execute()
            .data
            or []
        )
        for r in existing:
            if data["PickUp_Date"] < r["Return_Date"] and r["PickUp_Date"] < data["Return_Date"]:
                return jsonify({"error": "This car is already booked for part of that date range."}), 409

        new_reservation = {
            "user_id": data.get("user_id"),
            "car_id": car_id,
            "PickUp_Date": data.get("PickUp_Date"),
            "Return_Date": data.get("Return_Date"),
            "Pickup_Location": data.get("Pickup_Location"),
            "Return_Location": data.get("Return_Location"),
        }

        result = supabase.table("reservations").insert(new_reservation).execute()
        if not result.data:
            return jsonify({"error": "Failed to save reservation."}), 500

        reservation = result.data[0]

        # Sends booking confirmation email right after a successful booking
        # Any failure here should never block the reservation itself from
        # succeeding, so it's wrapped in its own try/except.
        try:
            _send_booking_confirmation(reservation)
        except Exception:
            traceback.print_exc()

        return jsonify({"message": "Reservation confirmed!", "reservation": reservation}), 201

    except Exception as e:
        print("Reservation error:", e)
        return jsonify({"error": "An unexpected error occurred."}), 500


@app.route("/api/reservations/<reservation_id>", methods=["DELETE"])
def cancel_reservation(reservation_id):
    try:
        user_id = request.args.get("user_id")

        query = supabase.table("reservations").select("id, user_id").eq("id", reservation_id)
        existing = query.execute().data or []
        if not existing:
            return jsonify({"error": "Reservation not found."}), 404

        if user_id and str(existing[0].get("user_id")) != str(user_id):
            return jsonify({"error": "You are not authorized to cancel this reservation."}), 403
        
        # Perform the deletion
        result = supabase.table("reservations").delete().eq("id", reservation_id).execute()

        # Check if an error occurred during the Supabase operation
        if hasattr(result, 'error') and result.error:
            print("Database error:", result.error)
            return jsonify({"error": "Failed to cancel reservation due to a database error."}), 500

        # If there is no error, the deletion is successful
        return jsonify({"message": "Reservation cancelled."}), 200

    except Exception as e:
        print("Cancel reservation error:", e)
        return jsonify({"error": "An unexpected error occurred."}), 500


@app.route("/api/reservations/<user_id>", methods=["GET"])
def get_user_reservations(user_id):
    """
    Returns { "upcoming": [...], "history": [...] } for the given user.
    Each reservation is joined with its car's model/image/price so the
    My Reservations page can render everything in one request.
    """
    try:
        res_rows = (
            supabase.table("reservations")
            .select("*")
            .eq("user_id", user_id)
            .execute()
            .data
            or []
        )

        # Fetch all cars and index by str(id) rather than filtering with
        # .in_("id", car_ids) — if car_id is stored as text on the
        # reservations table but "id" is an integer on cars (or vice versa),
        # Postgrest's in_() can silently return zero matches. Comparing as
        # strings sidesteps that mismatch entirely.
        car_rows = supabase.table("cars").select("*").execute().data or []
        cars_by_id = {str(c["id"]): c for c in car_rows}

        today_str = date.today().isoformat()

        upcoming, history = [], []
        for r in res_rows:
            # Cast the reservation's car_id to str too, so it actually
            # matches the string keys in cars_by_id above.
            car = cars_by_id.get(str(r.get("car_id")), {})
            pickup, ret = r.get("PickUp_Date"), r.get("Return_Date")
            price = float(car.get("price") or 0)
            days = _compute_days(pickup, ret)
            total_cost = round(price * days, 2)

            entry = {
                "reservation_id": r.get("id"),
                "car_id": r.get("car_id"),
                "model": car.get("model"),
                "image_url": car.get("image_url"),
                "type": car.get("type"),
                "seats": car.get("seats"),
                "PickUp_Date": pickup,
                "Return_Date": ret,
                "Pickup_Location": r.get("Pickup_Location"),
                "Return_Location": r.get("Return_Location"),
                "total_cost": total_cost,
            }

            if ret and ret < today_str:
                history.append(entry)
            else:
                upcoming.append(entry)

        upcoming.sort(key=lambda e: e["PickUp_Date"] or "")
        history.sort(key=lambda e: e["Return_Date"] or "", reverse=True)

        return jsonify({"upcoming": upcoming, "history": history}), 200

    except Exception as e:
        print("Get user reservations error:", e)
        return jsonify({"error": "Failed to fetch reservations."}), 500


# ===== Booking Confirmation =====
def _build_booking_payload(reservation):
    """
    Builds the dict that email_sender.send_confirmation_email expects,
    using ONLY real data joined from reservations + cars + users.
    reservation must at least have: id, user_id, car_id, PickUp_Date,
    Return_Date, Pickup_Location.
    """
    car = supabase.table("cars").select("*").eq("id", reservation["car_id"]).single().execute().data or {}
    user = supabase.table("users").select("*").eq("id", reservation["user_id"]).single().execute().data or {}

    pickup = reservation.get("PickUp_Date")
    ret = reservation.get("Return_Date")
    days = _compute_days(pickup, ret)
    price = float(car.get("price") or 0)
    total_price = round(price * days, 2)

    customer_name = f"{user.get('first_name', '')} {user.get('last_name', '')}".strip() or "Customer"

    return {
        "customer_name": customer_name,
        "customer_email": user.get("email"),
        "vehicle_name": car.get("model") or "Vehicle",
        "pickup_location": reservation.get("Pickup_Location"),
        "start_date": pickup,
        "end_date": ret,
        "total_price": total_price,
        "status": "Confirmed",
    }

def _send_booking_confirmation(reservation):
    booking = _build_booking_payload(reservation)
    if not booking["customer_email"]:
        print("Booking confirmation skipped: no email on file for this user.")
        return
    send_confirmation_email(booking)


@app.route("/confirm-booking", methods=["POST"])
def confirm_booking():
    """
    Manually (re)send a confirmation email for an existing reservation.
    Body: { "reservation_id": <id> }
    """
    try:
        data = request.json or {}
        reservation_id = data.get("reservation_id") or data.get("booking_id")
        if not reservation_id:
            return jsonify({"error": "'reservation_id' is required."}), 400

        response = (
            supabase.table("reservations")
            .select("*")
            .eq("id", reservation_id)
            .single()
            .execute()
        )
        reservation = response.data

        if not reservation:
            return jsonify({"error": "Booking not found."}), 404

        booking = _build_booking_payload(reservation)
        if not booking["customer_email"]:
            return jsonify({"error": "No email on file for this user."}), 400

        send_confirmation_email(booking)
        return jsonify({"message": "Confirmation email sent!"}), 200

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


# ===== Frontend routes =====
@app.route("/home")
@app.route("/home.html")
def home():
    return send_from_directory(FRONTEND_DIR, "home.html")


@app.route("/")
def index():
    return send_from_directory(FRONTEND_DIR, "index.html")


@app.route("/<path:filename>")
def frontend_files(filename):
    return send_from_directory(FRONTEND_DIR, filename)


# ===== Main =====
if __name__ == "__main__":
    app.run(debug=True, port=5000)
