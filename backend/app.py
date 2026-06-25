from flask import Flask, request, jsonify
from supabase import create_client
from email_sender import send_confirmation_email
from dotenv import load_dotenv
import os

load_dotenv()

app = Flask(__name__) # turn server on

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY) #connects to supabase

@app.route("/confirm-booking", methods = ['POST'])

def confirm_booking():
    try:
        data = request.json
        booking_id = data.get('booking_id')
        # traverses in supabase to find booking_confirmation 
        response = supabase.table('Booking_confirmation (reference numbers)').select('*').eq("id", booking_id).single().execute()
        booking = response.data

        if not booking: #checks if booking wasnt found and returns an error message
            return jsonify({"Error": "Booking not found"}), 404
        
        send_confirmation_email(booking) # if booking found, send it to email function
        return jsonify({'message': 'Confirmation email sent!'}), 200 #sends a success message

    except Exception as e:
        return jsonify({"Error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True)