from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from supabase import create_client
from dotenv import load_dotenv
from datetime import datetime, date, timedelta
import hashlib
import os
import traceback

import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

load_dotenv()

app = Flask(__name__)
CORS(app)

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_KEY"]
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

FRONTEND_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "frontend")


@app.route("/register", methods=["POST"])
def register():
    try:
        data = request.json
        required = ["first_name", "last_name", "email", "password"]
        for field in required:
            if not data.get(field):
                return jsonify({"error": f"'{field}' is required."}), 400

        email = data["email"].strip().lower()
        password = data["password"].strip()

        dob_str = (data.get("dob") or "").strip()
        if not dob_str:
            return jsonify({"error": "Date of birth is required."}), 400
        try:
            dob = datetime.strptime(dob_str, "%Y-%m-%d").date()
        except ValueError:
            return jsonify({"error": "Invalid date of birth."}), 400

        today = date.today()
        cutoff = today.replace(year=today.year - 16)
        if dob > cutoff:
            return jsonify({"error": "You must be at least 16 years old to sign up."}), 400

        existing = supabase.table("users").select("id").eq("email", email).execute()
        if existing.data:
            return jsonify({"error": "An account with that email already exists."}), 409

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
        traceback.print_exc()
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
            .select("id, first_name, last_name, email, role")
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
            "role": (user.get("role") or "customer").strip().lower(),
        }), 200

    except Exception as e:
        print("Login error:", e)
        return jsonify({"error": "An unexpected error occurred."}), 500


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
        start_date = request.args.get("start_date")
        end_date = request.args.get("end_date")

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
        car_ids = [str(c["id"]) for c in cars]

        reservations_by_car = {}
        if car_ids:
            res_rows = (
                supabase.table("reservations")
                .select("car_id, PickUp_Date, Return_Date")
                .in_("car_id", car_ids)
                .execute()
                .data or []
            )
            for r in res_rows:
                reservations_by_car.setdefault(str(r["car_id"]), []).append({
                    "PickUp_Date": r["PickUp_Date"],
                    "Return_Date": r["Return_Date"],
                })

        def ranges_overlap(a_start, a_end, b_start, b_end):
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


def _compute_days(pickup, ret):
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

        user_id = data.get("user_id")
        if not user_id:
            return jsonify({"error": "You must be logged in to make a reservation."}), 401

        user_check = supabase.table("users").select("id").eq("id", user_id).execute().data or []
        if not user_check:
            return jsonify({"error": "You must be logged in to make a reservation."}), 401

        car_id = str(data["car_id"]).strip()

        if data["Return_Date"] <= data["PickUp_Date"]:
            return jsonify({"error": "Return date must be after pick-up date."}), 400

        existing = (
            supabase.table("reservations")
            .select("PickUp_Date, Return_Date")
            .eq("car_id", car_id)
            .execute()
            .data or []
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

        try:
            _send_booking_confirmation(reservation)
        except Exception:
            traceback.print_exc()

        return jsonify({"message": "Reservation confirmed!", "reservation": reservation}), 201

    except Exception as e:
        print("Reservation error:", e)
        return jsonify({"error": "An unexpected error occurred."}), 500


@app.route("/api/reservations/<record_id>", methods=["GET", "DELETE"])
def reservation_by_id(record_id):
    if request.method == "DELETE":
        return _cancel_reservation(record_id)
    return _get_user_reservations(record_id)


def _cancel_reservation(reservation_id):
    try:
        user_id = request.args.get("user_id")

        existing = (
            supabase.table("reservations")
            .select("id, user_id, status")
            .eq("id", reservation_id)
            .execute()
            .data or []
        )

        if not existing:
            return jsonify({"error": "Reservation not found."}), 404

        if user_id and str(existing[0].get("user_id")) != str(user_id):
            return jsonify({"error": "You are not authorized to cancel this reservation."}), 403

        if existing[0].get("status") == "cancelled":
            return jsonify({"message": "Reservation already cancelled."}), 200

        # Mark as cancelled — keeps the row in the database so it shows in history
        supabase.table("reservations").update({"status": "cancelled"}).eq("id", reservation_id).execute()

        print(f"Reservation {reservation_id} marked as cancelled.")
        return jsonify({"message": "Reservation cancelled."}), 200

    except Exception as e:
        print("Cancel reservation error:", e)
        traceback.print_exc()
        return jsonify({"error": "An unexpected error occurred."}), 500


def _get_user_reservations(user_id):
    try:
        res_rows = (
            supabase.table("reservations")
            .select("*")
            .eq("user_id", user_id)
            .execute()
            .data or []
        )

        car_rows = supabase.table("cars").select("*").execute().data or []
        cars_by_id = {str(c["id"]): c for c in car_rows}

        today_str = date.today().isoformat()

        upcoming, history = [], []
        for r in res_rows:
            car = cars_by_id.get(str(r.get("car_id")), {})
            pickup, ret = r.get("PickUp_Date"), r.get("Return_Date")
            price = float(car.get("price") or 0)
            days = _compute_days(pickup, ret)
            total_cost = round(price * days, 2)

            status = r.get("status") or "confirmed"

            entry = {
                "reservation_id": r.get("id"),
                "car_id": r.get("car_id"),
                "model": car.get("model"),
                "image_url": car.get("image_url"),
                "type": car.get("type"),
                "seats": car.get("seats"),
                "price": car.get("price"),
                "PickUp_Date": pickup,
                "Return_Date": ret,
                "Pickup_Location": r.get("Pickup_Location"),
                "Return_Location": r.get("Return_Location"),
                "total_cost": total_cost,
                "status": status,
            }

            if status == "cancelled" or (ret and ret < today_str):
                history.append(entry)
            else:
                upcoming.append(entry)

        upcoming.sort(key=lambda e: e["PickUp_Date"] or "")
        history.sort(key=lambda e: e["Return_Date"] or "", reverse=True)

        return jsonify({"upcoming": upcoming, "history": history}), 200

    except Exception as e:
        print("Get user reservations error:", e)
        return jsonify({"error": "Failed to fetch reservations."}), 500


def _build_booking_payload(reservation):
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


def send_confirmation_email(booking):
    sender = os.getenv("GMAIL_ADDRESS")
    password = os.getenv("GMAIL_APP_PASSWORD")
    recipient = booking["customer_email"]

    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"Booking Confirmation - {booking['vehicle_name']}"
    msg["From"] = sender
    msg["To"] = recipient

    status = booking.get("status", "Confirmed")

    html = f"""
    <html>
    <body style="margin:0; padding:0; background-color:#f2f4f8; font-family: 'Segoe UI', Arial, sans-serif;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f2f4f8; padding:32px 0;">
            <tr>
                <td align="center">
                    <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="background-color:#ffffff; border-radius:10px; overflow:hidden; box-shadow:0 2px 10px rgba(0,0,0,0.06);">
                        <tr>
                            <td style="background-color:#0b1f4b; padding:28px 32px;">
                                <div style="color:#ffffff; font-size:22px; font-weight:700;">RentalRide</div>
                                <div style="color:#a9b6d6; font-size:13px; margin-top:4px;">Car Rental Management System</div>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding:32px;">
                                <h2 style="margin:0 0 16px; color:#0b1f4b; font-size:20px;">Booking Confirmed!</h2>
                                <p style="margin:0 0 12px; color:#222; font-size:14px; line-height:1.6;">
                                    Hi <strong>{booking['customer_name']}</strong>,
                                </p>
                                <p style="margin:0 0 20px; color:#222; font-size:14px; line-height:1.6;">
                                    Your booking has been confirmed. Here is a summary of your reservation details below.
                                </p>
                                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e4e7ee; border-radius:8px; overflow:hidden;">
                                    <tr>
                                        <td colspan="2" style="background-color:#0b1f4b; color:#ffffff; font-size:13px; font-weight:700; padding:10px 16px;">
                                            Booking Details
                                        </td>
                                    </tr>
                                    <tr style="background-color:#f6f8fc;">
                                        <td style="padding:12px 16px; font-size:13px; font-weight:700; color:#0b1f4b; width:40%;">Vehicle</td>
                                        <td style="padding:12px 16px; font-size:13px; color:#222;">{booking['vehicle_name']}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding:12px 16px; font-size:13px; font-weight:700; color:#0b1f4b;">Pickup Location</td>
                                        <td style="padding:12px 16px; font-size:13px; color:#222;">{booking['pickup_location']}</td>
                                    </tr>
                                    <tr style="background-color:#f6f8fc;">
                                        <td style="padding:12px 16px; font-size:13px; font-weight:700; color:#0b1f4b;">Start Date</td>
                                        <td style="padding:12px 16px; font-size:13px; color:#222;">{booking['start_date']}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding:12px 16px; font-size:13px; font-weight:700; color:#0b1f4b;">End Date</td>
                                        <td style="padding:12px 16px; font-size:13px; color:#222;">{booking['end_date']}</td>
                                    </tr>
                                    <tr style="background-color:#f6f8fc;">
                                        <td style="padding:12px 16px; font-size:13px; font-weight:700; color:#0b1f4b;">Total Price</td>
                                        <td style="padding:12px 16px; font-size:13px; color:#222;">${booking['total_price']}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding:12px 16px; font-size:13px; font-weight:700; color:#0b1f4b;">Status</td>
                                        <td style="padding:12px 16px;">
                                            <span style="background-color:#e5f7ec; color:#1e8449; font-size:12px; font-weight:700; padding:4px 12px; border-radius:12px; display:inline-block;">
                                                {status}
                                            </span>
                                        </td>
                                    </tr>
                                </table>
                                <p style="margin:24px 0 0; color:#444; font-size:13px; line-height:1.6;">
                                    If you have any questions about your booking, please don't hesitate to reach out to us.
                                </p>
                                <p style="margin:12px 0 0; color:#444; font-size:13px; line-height:1.6;">
                                    Thank you for choosing <strong>RentalRide</strong>!
                                </p>
                            </td>
                        </tr>
                        <tr>
                            <td style="background-color:#f6f8fc; padding:18px 32px; text-align:center; border-top:1px solid #e4e7ee;">
                                <p style="margin:0; color:#9099ab; font-size:11px;">
                                    This is an automated confirmation email. Please do not reply directly to this message.
                                </p>
                                <p style="margin:4px 0 0; color:#9099ab; font-size:11px;">
                                    &copy; 2026 RentalRide — Car Rental Management System
                                </p>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    </body>
    </html>
    """

    msg.attach(MIMEText(html, "html"))

    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
        server.login(sender, password)
        server.sendmail(sender, recipient, msg.as_string())


def _send_booking_confirmation(reservation):
    booking = _build_booking_payload(reservation)
    if not booking["customer_email"]:
        print("Booking confirmation skipped: no email on file for this user.")
        return
    send_confirmation_email(booking)


def send_cancellation_email(booking):
    sender = os.getenv("GMAIL_ADDRESS")
    password = os.getenv("GMAIL_APP_PASSWORD")
    recipient = booking["customer_email"]

    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"Reservation Cancelled - {booking['vehicle_name']}"
    msg["From"] = sender
    msg["To"] = recipient

    html = f"""
    <html>
    <body style="margin:0; padding:0; background-color:#f2f4f8; font-family: 'Segoe UI', Arial, sans-serif;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f2f4f8; padding:32px 0;">
            <tr>
                <td align="center">
                    <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="background-color:#ffffff; border-radius:10px; overflow:hidden; box-shadow:0 2px 10px rgba(0,0,0,0.06);">
                        <tr>
                            <td style="background-color:#0b1f4b; padding:28px 32px;">
                                <div style="color:#ffffff; font-size:22px; font-weight:700;">RentalRide</div>
                                <div style="color:#a9b6d6; font-size:13px; margin-top:4px;">Car Rental Management System</div>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding:32px;">
                                <h2 style="margin:0 0 16px; color:#0b1f4b; font-size:20px;">Reservation Cancelled</h2>
                                <p style="margin:0 0 12px; color:#222; font-size:14px; line-height:1.6;">
                                    Hi <strong>{booking['customer_name']}</strong>,
                                </p>
                                <p style="margin:0 0 20px; color:#222; font-size:14px; line-height:1.6;">
                                    We're sorry, but the vehicle for your upcoming reservation has become unavailable
                                    and your booking has been cancelled. No charges apply. Please accept our
                                    apologies for the inconvenience — feel free to book another vehicle any time.
                                </p>
                                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e4e7ee; border-radius:8px; overflow:hidden;">
                                    <tr>
                                        <td colspan="2" style="background-color:#0b1f4b; color:#ffffff; font-size:13px; font-weight:700; padding:10px 16px;">
                                            Cancelled Reservation
                                        </td>
                                    </tr>
                                    <tr style="background-color:#f6f8fc;">
                                        <td style="padding:12px 16px; font-size:13px; font-weight:700; color:#0b1f4b; width:40%;">Vehicle</td>
                                        <td style="padding:12px 16px; font-size:13px; color:#222;">{booking['vehicle_name']}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding:12px 16px; font-size:13px; font-weight:700; color:#0b1f4b;">Pickup Location</td>
                                        <td style="padding:12px 16px; font-size:13px; color:#222;">{booking['pickup_location']}</td>
                                    </tr>
                                    <tr style="background-color:#f6f8fc;">
                                        <td style="padding:12px 16px; font-size:13px; font-weight:700; color:#0b1f4b;">Start Date</td>
                                        <td style="padding:12px 16px; font-size:13px; color:#222;">{booking['start_date']}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding:12px 16px; font-size:13px; font-weight:700; color:#0b1f4b;">End Date</td>
                                        <td style="padding:12px 16px; font-size:13px; color:#222;">{booking['end_date']}</td>
                                    </tr>
                                    <tr style="background-color:#f6f8fc;">
                                        <td style="padding:12px 16px; font-size:13px; font-weight:700; color:#0b1f4b;">Status</td>
                                        <td style="padding:12px 16px;">
                                            <span style="background-color:#fbe7e4; color:#c0392b; font-size:12px; font-weight:700; padding:4px 12px; border-radius:12px; display:inline-block;">
                                                Cancelled
                                            </span>
                                        </td>
                                    </tr>
                                </table>
                                <p style="margin:24px 0 0; color:#444; font-size:13px; line-height:1.6;">
                                    If you have any questions, please don't hesitate to reach out to us.
                                </p>
                            </td>
                        </tr>
                        <tr>
                            <td style="background-color:#f6f8fc; padding:18px 32px; text-align:center; border-top:1px solid #e4e7ee;">
                                <p style="margin:0; color:#9099ab; font-size:11px;">
                                    This is an automated message. Please do not reply directly to this message.
                                </p>
                                <p style="margin:4px 0 0; color:#9099ab; font-size:11px;">
                                    &copy; 2026 RentalRide — Car Rental Management System
                                </p>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    </body>
    </html>
    """

    msg.attach(MIMEText(html, "html"))

    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
        server.login(sender, password)
        server.sendmail(sender, recipient, msg.as_string())


@app.route("/confirm-booking", methods=["POST"])
def confirm_booking():
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


def _is_admin(requester_id):
    if not requester_id:
        return False
    row = (
        supabase.table("users")
        .select("role")
        .eq("id", requester_id)
        .execute()
        .data or []
    )
    return bool(row) and (row[0].get("role") == "admin")


@app.route("/api/admin/users", methods=["GET"])
def admin_list_users():
    try:
        requester_id = request.args.get("requester_id")
        if not _is_admin(requester_id):
            return jsonify({"error": "Not authorized."}), 403

        rows = (
            supabase.table("users")
            .select("id, first_name, last_name, email, role")
            .order("first_name")
            .execute()
            .data or []
        )

        customers = [r for r in rows if (r.get("role") or "").lower() != "admin"]
        return jsonify(customers), 200

    except Exception as e:
        print("Admin list users error:", e)
        return jsonify({"error": "Failed to fetch users."}), 500


@app.route("/api/admin/cars", methods=["GET"])
def admin_list_cars():
    """Full car list for the admin dashboard's car search/select filter and
    the inventory page. 'status' reflects manual admin overrides (available/
    maintenance), except it's forced to 'rented' whenever the car has an
    active, non-cancelled reservation covering today — that part isn't
    something an admin toggles, it's just true right now.
    """
    try:
        requester_id = request.args.get("requester_id")
        if not _is_admin(requester_id):
            return jsonify({"error": "Not authorized."}), 403

        today_str = date.today().isoformat()

        # Sweep: a car marked for deferred deletion (its rental ended) gets
        # actually removed once its delete_after date has passed.
        overdue = (
            supabase.table("cars")
            .select("id")
            .lt("delete_after", today_str)
            .execute()
            .data or []
        )
        for row in overdue:
            supabase.table("cars").delete().eq("id", row["id"]).execute()

        rows = (
            supabase.table("cars")
            .select("id, model, type, location, price, seats, image_url, status, delete_after")
            .order("model")
            .execute()
            .data or []
        )

        active_res = (
            supabase.table("reservations")
            .select("car_id, status")
            .lte("PickUp_Date", today_str)
            .gte("Return_Date", today_str)
            .execute()
            .data or []
        )
        rented_car_ids = {
            str(r["car_id"]) for r in active_res
            if (r.get("status") or "").lower() != "cancelled"
        }

        for row in rows:
            if str(row["id"]) in rented_car_ids:
                row["status"] = "rented"

        return jsonify(rows), 200

    except Exception as e:
        print("Admin list cars error:", e)
        return jsonify({"error": "Failed to fetch cars."}), 500


@app.route("/api/admin/cars/<car_id>/status", methods=["PATCH"])
def admin_update_car_status(car_id):
    try:
        data = request.json or {}
        requester_id = data.get("requester_id")
        if not _is_admin(requester_id):
            return jsonify({"error": "Not authorized."}), 403

        status = (data.get("status") or "").strip().lower()
        if status not in ("available", "maintenance"):
            return jsonify({"error": "Invalid status. 'rented' is set automatically and can't be assigned manually."}), 400

        result = supabase.table("cars").update({"status": status}).eq("id", car_id).execute()
        if not result.data:
            return jsonify({"error": "Car not found."}), 404

        return jsonify(result.data[0]), 200

    except Exception as e:
        print("Admin update car status error:", e)
        return jsonify({"error": "Failed to update car status."}), 500


@app.route("/api/admin/cars/<car_id>", methods=["DELETE"])
def admin_delete_car(car_id):
    """Deleting a car is only ever instant when nothing is riding on it:
      - If it's currently out on an active rental, the row is spared and
        stamped with delete_after (its return date) instead — the next
        /api/admin/cars call sweeps it away once that date has passed.
      - If it has upcoming (not-yet-started) reservations, the caller must
        pass confirm_cancel_future=true; those reservations get cancelled
        and their customers emailed before the car is removed.
    """
    try:
        requester_id = request.args.get("requester_id")
        if not _is_admin(requester_id):
            return jsonify({"error": "Not authorized."}), 403

        confirm_cancel_future = request.args.get("confirm_cancel_future", "").strip().lower() == "true"
        today_str = date.today().isoformat()

        reservations = (
            supabase.table("reservations")
            .select("id, user_id, car_id, PickUp_Date, Return_Date, status")
            .eq("car_id", car_id)
            .execute()
            .data or []
        )
        reservations = [r for r in reservations if (r.get("status") or "").lower() != "cancelled"]

        active = [r for r in reservations if r["PickUp_Date"] <= today_str <= r["Return_Date"]]
        future = [r for r in reservations if r["PickUp_Date"] > today_str]

        if future and not confirm_cancel_future:
            return jsonify({
                "requires_confirmation": True,
                "future_count": len(future),
                "message": (
                    f"This car has {len(future)} upcoming reservation"
                    f"{'s' if len(future) != 1 else ''}. Deleting it will cancel "
                    "them and email the affected customers."
                ),
            }), 409

        for r in future:
            supabase.table("reservations").update({"status": "cancelled"}).eq("id", r["id"]).execute()
            try:
                booking = _build_booking_payload(r)
                if booking["customer_email"]:
                    send_cancellation_email(booking)
            except Exception:
                traceback.print_exc()

        if active:
            delete_after = active[0]["Return_Date"]
            supabase.table("cars").update({"delete_after": delete_after}).eq("id", car_id).execute()
            return jsonify({
                "message": f"This car is currently rented — it will be automatically removed after {delete_after}.",
                "delete_after": delete_after,
            }), 200

        result = supabase.table("cars").delete().eq("id", car_id).execute()
        if not result.data:
            return jsonify({"error": "Car not found."}), 404

        return jsonify({"message": "Car deleted."}), 200

    except Exception as e:
        print("Admin delete car error:", e)
        return jsonify({"error": "Failed to delete car."}), 500


@app.route("/api/admin/rental-stats", methods=["GET"])
def admin_rental_stats():
    try:
        requester_id = request.args.get("requester_id")
        if not _is_admin(requester_id):
            return jsonify({"error": "Not authorized."}), 403

        user_ids_param = request.args.get("user_ids", "").strip()
        selected_ids = [u.strip() for u in user_ids_param.split(",") if u.strip()]
        car_ids_param = request.args.get("car_ids", "").strip()
        selected_car_ids = [c.strip() for c in car_ids_param.split(",") if c.strip()]
        start_date = request.args.get("start_date") or None
        end_date = request.args.get("end_date") or None

        query = supabase.table("reservations").select(
            "id, user_id, car_id, PickUp_Date, Return_Date, status"
        )
        if selected_ids:
            query = query.in_("user_id", selected_ids)
        if selected_car_ids:
            query = query.in_("car_id", selected_car_ids)

        reservations = query.execute().data or []

        car_rows = supabase.table("cars").select("id, price, model, type").execute().data or []
        price_by_car = {str(c["id"]): float(c.get("price") or 0) for c in car_rows}
        model_by_car = {str(c["id"]): c.get("model") or f"Car {c['id']}" for c in car_rows}
        type_by_car = {str(c["id"]): c.get("type") or "Other" for c in car_rows}


        user_rows = supabase.table("users").select("id, first_name, last_name, email, role").execute().data or []
        name_by_user = {
            str(u["id"]): (f"{u.get('first_name') or ''} {u.get('last_name') or ''}".strip() or u.get("email") or f"User {u['id']}")
            for u in user_rows
        }

        def ranges_overlap(a_start, a_end, b_start, b_end):
            return a_start <= b_end and b_start <= a_end


        scoped = []
        for r in reservations:
            if (r.get("status") or "").lower() == "cancelled":
                continue
            pickup, ret = r.get("PickUp_Date"), r.get("Return_Date")
            if not pickup or not ret:
                continue
            if start_date and end_date and not ranges_overlap(pickup, ret, start_date, end_date):
                continue

            days = _compute_days(pickup, ret)
            price = price_by_car.get(str(r.get("car_id")), 0)
            scoped.append({
                **r,
                "_days": days,
                "_total_cost": round(price * days, 2),
            })


        if start_date and end_date:
            span_start, span_end = start_date, end_date
        elif scoped:
            span_start = min(r["PickUp_Date"] for r in scoped)
            span_end = max(r["Return_Date"] for r in scoped)
        else:
            span_start = span_end = None

        series = []
        if span_start and span_end:
            cur = datetime.strptime(span_start, "%Y-%m-%d").date()
            last = datetime.strptime(span_end, "%Y-%m-%d").date()
            while cur <= last:
                key = cur.isoformat()
                active = [r for r in scoped if r["PickUp_Date"] <= key <= r["Return_Date"]]

                active_car_ids_today = {str(r.get("car_id")) for r in active}
                active_cars = sorted({model_by_car.get(cid, f"Car {cid}") for cid in active_car_ids_today})
                active_customers = sorted({name_by_user.get(str(r.get("user_id")), f"User {r.get('user_id')}") for r in active})
                series.append({
                    "date": key,
                    "total_cost": round(sum(r["_total_cost"] for r in active), 2),
                    "cars": active_cars[:8],
                    "cars_more": max(0, len(active_cars) - 8),
                    "customers": active_customers[:8],
                    "customers_more": max(0, len(active_customers) - 8),
                })
                cur += timedelta(days=1)

        involved_user_ids = {r.get("user_id") for r in scoped}

        unique_customer_count = len(set(selected_ids)) if selected_ids else len(involved_user_ids)
 
        involved_car_ids = {r.get("car_id") for r in scoped}
        unique_car_count = len(set(selected_car_ids)) if selected_car_ids else len(involved_car_ids)

        total_rentals = len(scoped)
        avg_duration = round(sum(r["_days"] for r in scoped) / total_rentals, 1) if total_rentals else 0
        avg_revenue_per_rental = round(sum(r["_total_cost"] for r in scoped) / total_rentals, 2) if total_rentals else 0


        revenue_by_car = {}
        for r in scoped:
            cid = str(r.get("car_id"))
            revenue_by_car[cid] = revenue_by_car.get(cid, 0) + r["_total_cost"]
        top_car_id, top_car_revenue = (
            max(revenue_by_car.items(), key=lambda kv: kv[1]) if revenue_by_car else (None, 0)
        )
        top_car_label = model_by_car.get(top_car_id) if top_car_id else None

        car_breakdown_sorted = sorted(revenue_by_car.items(), key=lambda kv: kv[1], reverse=True)
        top_n, rest = car_breakdown_sorted[:6], car_breakdown_sorted[6:]
        revenue_by_car_chart = [
            {"label": model_by_car.get(cid, f"Car {cid}"), "value": round(val, 2)}
            for cid, val in top_n
        ]
        if rest:
            revenue_by_car_chart.append({"label": "Other cars", "value": round(sum(v for _, v in rest), 2)})

        revenue_by_type = {}
        for cid, val in revenue_by_car.items():
            t = type_by_car.get(cid, "Other")
            revenue_by_type[t] = revenue_by_type.get(t, 0) + val
        revenue_by_type_chart = [
            {"label": t, "value": round(v, 2)}
            for t, v in sorted(revenue_by_type.items(), key=lambda kv: kv[1], reverse=True)
        ]

        total_customers_db = len([u for u in user_rows if (u.get("role") or "").lower() != "admin"])
        total_cars_db = len(car_rows)

        totals = {
            "total_rentals": total_rentals,
            "total_revenue": round(sum(r["_total_cost"] for r in scoped), 2),
            "unique_users": unique_customer_count,
            "unique_cars": unique_car_count,
            "total_customers_db": total_customers_db,
            "total_cars_db": total_cars_db,
            "avg_duration_days": avg_duration,
            "avg_revenue_per_rental": avg_revenue_per_rental,
            "top_car": top_car_label,
            "top_car_revenue": round(top_car_revenue, 2),
        }

        return jsonify({
            "series": series,
            "totals": totals,
            "revenue_by_car": revenue_by_car_chart,
            "revenue_by_type": revenue_by_type_chart,
        }), 200

    except Exception as e:
        print("Admin rental stats error:", e)
        traceback.print_exc()
        return jsonify({"error": "Failed to fetch rental stats."}), 500


@app.route("/home")
@app.route("/home.html")
def home():
    return send_from_directory(FRONTEND_DIR, "home.html")


@app.route("/admin")
@app.route("/admin.html")
def admin():
    return send_from_directory(FRONTEND_DIR, "admin.html")


@app.route("/inventory")
@app.route("/inventory.html")
def inventory():
    return send_from_directory(FRONTEND_DIR, "inventory.html")


@app.route("/")
def index():
    return send_from_directory(FRONTEND_DIR, "index.html")


@app.route("/<path:filename>")
def frontend_files(filename):
    return send_from_directory(FRONTEND_DIR, filename)


if __name__ == "__main__":
    app.run(debug=True, port=5000)