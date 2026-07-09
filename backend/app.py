from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from supabase import create_client
from dotenv import load_dotenv
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

        email    = data["email"].strip().lower()
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
            "first_name":   data.get("first_name", "").strip(),
            "last_name":    data.get("last_name", "").strip(),
            "email":        email,
            "password":     password_hash,
            "phone_number": data.get("phone_number", "").strip(),
            "street":       data.get("street", "").strip(),
            "city":         data.get("city", "").strip(),
            "province":     data.get("province", "").strip(),
            "country":      data.get("country", "").strip(),
            "postal_code":  data.get("postal_code", "").strip(),
            "dob":          data.get("dob") or None,
        }

        result = supabase.table("users").insert(new_user).execute()

        if not result.data:
            return jsonify({"error": "Registration failed. Please try again."}), 500

        user = result.data[0]
        return jsonify({
            "message":    "Account created successfully.",
            "user_id":    user["id"],
            "first_name": user["first_name"],
            "last_name":  user["last_name"],
        }), 201

    except Exception as e:
        traceback.print_exc()  # This prints the full error details to your terminal
        return jsonify({"error": str(e)}), 500


@app.route("/login", methods=["POST"])
def login():
    try:
        data = request.json

        email    = (data.get("email") or "").strip().lower()
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
            "user_id":    user["id"],
            "first_name": user["first_name"],
            "last_name":  user["last_name"],
        }), 200

    except Exception as e:
        print("Login error:", e)
        return jsonify({"error": "An unexpected error occurred."}), 500



#  ===== Cars Search =====
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
        model      = request.args.get("model")
        car_type   = request.args.get("type")
        seats      = request.args.get("seats")
        location   = request.args.get("location")
        start_date = request.args.get("start_date")  # requested pick-up date
        end_date   = request.args.get("end_date")    # requested return date

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

        car_ids = [c["id"] for c in cars]

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
                reservations_by_car.setdefault(r["car_id"], []).append({
                    "PickUp_Date": r["PickUp_Date"],
                    "Return_Date": r["Return_Date"],
                })

        def ranges_overlap(a_start, a_end, b_start, b_end):
            # Two [start, end) date ranges collide if they intersect at all.
            return a_start < b_end and b_start < a_end

        result_cars = []
        for c in cars:
            car_reservations = reservations_by_car.get(c["id"], [])
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
@app.route("/api/reservations", methods=["POST"])
def create_reservation():
    try:
        data = request.json

        required = ["car_id", "PickUp_Date", "Return_Date", "Pickup_Location", "Return_Location"]
        for field in required:
            if not data.get(field):
                return jsonify({"error": f"'{field}' is required."}), 400

        # Basic date valid check
        if data["Return_Date"] <= data["PickUp_Date"]:
            return jsonify({"error": "Return date must be after pick-up date."}), 400

        # Prevent double-booking: reject if this car already has a
        # reservation that overlaps the requested date range.
        existing = (
            supabase.table("reservations")
            .select("PickUp_Date, Return_Date")
            .eq("car_id", data["car_id"])
            .execute()
            .data
            or []
        )
        for r in existing:
            if data["PickUp_Date"] < r["Return_Date"] and r["PickUp_Date"] < data["Return_Date"]:
                return jsonify({"error": "This car is already booked for part of that date range."}), 409

        new_reservation = {
            "user_id":          data.get("user_id"),
            "car_id":           data.get("car_id"),
            "PickUp_Date":      data.get("PickUp_Date"),
            "Return_Date":      data.get("Return_Date"),
            "Pickup_Location":  data.get("Pickup_Location"),
            "Return_Location":  data.get("Return_Location"),
        }

        result = supabase.table("reservations").insert(new_reservation).execute()

        if not result.data:
            return jsonify({"error": "Failed to save reservation."}), 500

        return jsonify({"message": "Reservation confirmed!", "reservation": result.data[0]}), 201

    except Exception as e:
        print("Reservation error:", e)
        return jsonify({"error": "An unexpected error occurred."}), 500

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
