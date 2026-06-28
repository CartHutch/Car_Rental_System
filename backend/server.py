from flask import Flask, jsonify, request
from flask_cors import CORS
from supabase import create_client

app = Flask(__name__)
CORS(app)

url = "https://atukxoidnpwmrsivyyrm.supabase.co"
key = "sb_publishable_VfJ2iKRB_7Y0w9FfWChrFw_lpcPChtO"

supabase = create_client(url, key)


@app.route("/cars")
def get_cars():
    model = request.args.get("model")
    car_type = request.args.get("type")
    seats = request.args.get("seats")

    query = supabase.table("cars").select("*")

    if model:
        query = query.ilike("model", f"%{model}%")

    if car_type:
        query = query.eq("type", car_type)

    if seats:
        query = query.eq("seats", seats)

    cars = query.execute().data
    return jsonify(cars)


if __name__ == "__main__":
    app.run(debug=True, port=5001)