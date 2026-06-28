from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

@app.route("/api/reservations", methods=["POST"])
def create_reservation():
    try:
        data = request.json
        new_reservation = {
            "user_id": data.get("user_id"),
            "PickUp_Date": data.get("PickUp_Date"),
            "Return_Date": data.get("Return_Date"),
            "Pickup_Location": data.get("Pickup_Location"),
            "Return_Location": data.get("Return_Location"),
            "car_id": data.get("car_id")
        }
        print("Received reservation:", new_reservation)
        return jsonify({"message": "Reservation received!"}), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 400

if __name__ == "__main__":
    app.run(debug=True, port=5000)

