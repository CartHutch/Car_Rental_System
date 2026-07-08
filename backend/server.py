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
    location = request.args.get("location")
 
    query = supabase.table("cars").select("*")
 
    if model:
        query = query.ilike("model", f"%{model}%")
 
    if car_type:
        query = query.eq("type", car_type)
 
    if seats:
        query = query.eq("seats", seats)
 
    if location:
        query = query.eq("location", location)
 
    cars = query.execute().data
    return jsonify(cars)
 
 
@app.route("/filters")
def get_filters():
    rows = supabase.table("cars").select("type, seats, location").execute().data
 
    types = sorted({r["type"] for r in rows if r.get("type")})
    seats = sorted({r["seats"] for r in rows if r.get("seats") is not None})
    locations = sorted({r["location"] for r in rows if r.get("location")})
 
    return jsonify({
        "types": types,
        "seats": seats,
        "locations": locations
    })
 
 
if __name__ == "__main__":
    app.run(debug=True, port=5001)