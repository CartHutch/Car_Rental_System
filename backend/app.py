from flask import Flask, request, jsonify
from flask_cors import CORS
from supabase import create_client
import hashlib
import os

app = Flask(__name__)
CORS(app)

# ===== Supabase Connection (USE .ENV FOR THE ACTUAL KEYS) ======
SUPABASE_URL = "BLANK"
SUPABASE_KEY = "BLANK"

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)


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
        password = data["password"]

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

        return jsonify({"message": "Account created successfully."}), 201

    except Exception as e:
        print("Register error:", e)
        return jsonify({"error": "An unexpected error occurred."}), 500


@app.route("/login", methods=["POST"])
def login():
    try:
        data = request.json

        email    = (data.get("email") or "").strip().lower()
        password = (data.get("password") or "")

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
@app.route("/cars", methods=["GET"])
def get_cars():
    try:
        model = request.args.get("model")
        car_type = request.args.get("type")
        seats = request.args.get("seats")

        query = supabase.table("cars").select("*")

        if model:
            query = query.ilike("model", f"%{model}%")
        if car_type:
            query = query.eq("type", car_type)
        if seats:
            query = query.eq("seats", int(seats))

        cars = query.execute().data
        return jsonify(cars), 200

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


# ===== Main =====
if __name__ == "__main__":
    app.run(debug=True, port=5000)