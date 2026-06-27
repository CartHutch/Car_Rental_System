# smtplib is Python's built in email sending library
import smtplib

# These two help us build the email with both HTML and plain text
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

# Again, loading .env so we can access Gmail credentials
from dotenv import load_dotenv
import os

load_dotenv()

# This function takes a booking (a row from Supabase) and sends an email
def send_confirmation_email(booking):

    # Read Gmail credentials from .env
    sender = os.getenv("GMAIL_ADDRESS")
    password = os.getenv("GMAIL_APP_PASSWORD")

    recipient = booking['customer_email']

    # Create the email object
    # 'alternative' means it can hold both plain text and HTML versions
    msg = MIMEMultipart('alternative')

    # Set the subject line, who it's from, and who it's going to
    msg['Subject'] = f"Booking Confirmation - {booking['vehicle_name']}"
    msg['From'] = sender
    msg['To'] = recipient

    # This is the actual email body written in HTML
    html = f"""
    <html>
    <body style="font-family: Arial, sans-serif; padding: 20px;">
        <h2>Booking Confirmed!</h2>
        <p>Hi {booking['customer_name']},</p>
        <p>Your booking has been confirmed. Here are your details:</p>
        <table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse;">
            <tr><td><b>Vehicle</b></td><td>{booking['vehicle_name']}</td></tr>
            <tr><td><b>Pickup Location</b></td><td>{booking['pickup_location']}</td></tr>
            <tr><td><b>Start Date</b></td><td>{booking['start_date']}</td></tr>
            <tr><td><b>End Date</b></td><td>{booking['end_date']}</td></tr>
            <tr><td><b>Total Price</b></td><td>${booking['total_price']}</td></tr>
            <tr><td><b>Status</b></td><td>{booking['status']}</td></tr>
        </table>
        <p>Thank you for choosing CartHutch!</p>
    </body>
    </html>
    """

    # Attach the HTML to the email
    msg.attach(MIMEText(html, 'html'))

    # Connect to Gmail's server and send the email
    with smtplib.SMTP_SSL('smtp.gmail.com', 465) as server:

        # Log into Gmail using your credentials from .env
        server.login(sender, password)

        # Actually send the email
        server.sendmail(sender, recipient, msg.as_string())