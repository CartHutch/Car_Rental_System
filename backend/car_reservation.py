from flask import Flask, request, jsonify
from supabase import create_client
from dotenv import load_dotenv
import os

load_dotenv()
app = Flask(_name_)


url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_KEY")
supabase = create_client(url, key)

@app.route("/api/reservations", methods=["POST"])
def create_reservation():
    data = request.json

    new_reservation = {
        "user_id": data["user_id"],
        "PickUp_Date": data["PickUp_Date"],
        "Return_Date": data["Return_Date"],
        "Pickup_Location": data["Pickup_Location"],
        "Return_Location": data["Return_Location"]
    }

    result = supabase.table("Reservation").insert(new_reservation).execute()
    return jsonify(result.data), 201

