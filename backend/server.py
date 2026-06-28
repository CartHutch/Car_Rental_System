from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

@app.route('/register', methods=['POST'])
def register():
    try:
        data = request.json
        user_data = {
            "email": data.get('email'),
            "password": data.get('password'),
            "first_name": data.get('first_name'),
            "last_name": data.get('last_name'),
            "phone_number": data.get('phone_number'),
            "street": data.get('street'),
            "city": data.get('city'),
            "province": data.get('province'),
            "country": data.get('country'),
            "postal_code": data.get('postal_code'),
            "dob": data.get('dob')
        }
        
        print("Received registration data:", user_data)
        
        return jsonify({"message": "Registration successful!"}), 201

    except Exception as e:
        return jsonify({"error": str(e)}), 400

@app.route('/login', methods=['POST'])
def login():
    try:
        data = request.json
        return jsonify({"message": "Login successful", "user_id": "123"}), 200
        
    except Exception as e:
        return jsonify({"error": str(e)}), 401

if __name__ == '__main__':
    app.run(debug=True, port=5000)