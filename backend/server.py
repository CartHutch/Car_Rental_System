import os
from dotenv import load_dotenv
from flask import Flask, request, jsonify
from supabase import create_client

# Load variables from .env file
load_dotenv()

app = Flask(__name__)

# Initialize Supabase
url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not url or not key:
    raise ValueError("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in your .env file!")

supabase = create_client(url, key)

@app.route('/register', methods=['POST'])
def register():
    data = request.json
    email = data.get('email', '').strip()
    password = data.get('password', '')

    try:
        # Create user via Admin API (bypasses email confirmation)
        auth_response = supabase.auth.admin.create_user({
            "email": email,
            "password": password,
            "email_confirm": True 
        })
        
        user_id = auth_response.user.id

        # Insert user profile into 'users' table
        supabase.table("users").insert({
            "id": user_id,
            "first_name": data.get('first_name'),
            "last_name": data.get('last_name'),
            "email": email,
            "phone_number": data.get('phone_number'),
            "role": "customer"
        }).execute()
        
        return jsonify({"message": "Registration successful!"}), 201
        
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@app.route('/login', methods=['POST'])
def login():
    data = request.json
    email = data.get('email', '').strip()
    password = data.get('password', '')

    try:
        # Check if the user exists and the password is correct
        response = supabase.auth.sign_in_with_password({
            "email": email, 
            "password": password
        })
        
        return jsonify({
            "message": "Login successful!",
            "user_id": response.user.id
        }), 200
        
    except Exception as e:
        # Return a 401 error if credentials don't match
        return jsonify({"error": "Invalid email or password"}), 401

if __name__ == '__main__':
    app.run(debug=True)