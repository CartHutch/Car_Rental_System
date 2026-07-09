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

    status = booking.get('status', 'Confirmed')

    # This is the actual email body written in HTML, styled to match
    # RentalRide's branding (dark navy header, clean details table,
    # green status badge, light footer).
    html = f"""
    <html>
    <body style="margin:0; padding:0; background-color:#f2f4f8; font-family: 'Segoe UI', Arial, sans-serif;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f2f4f8; padding:32px 0;">
            <tr>
                <td align="center">
                    <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="background-color:#ffffff; border-radius:10px; overflow:hidden; box-shadow:0 2px 10px rgba(0,0,0,0.06);">

                        <!-- Header -->
                        <tr>
                            <td style="background-color:#0b1f4b; padding:28px 32px;">
                                <div style="color:#ffffff; font-size:22px; font-weight:700;">RentalRide</div>
                                <div style="color:#a9b6d6; font-size:13px; margin-top:4px;">Car Rental Management System</div>
                            </td>
                        </tr>

                        <!-- Body -->
                        <tr>
                            <td style="padding:32px;">
                                <h2 style="margin:0 0 16px; color:#0b1f4b; font-size:20px;">Booking Confirmed!</h2>

                                <p style="margin:0 0 12px; color:#222; font-size:14px; line-height:1.6;">
                                    Hi <strong>{booking['customer_name']}</strong>,
                                </p>
                                <p style="margin:0 0 20px; color:#222; font-size:14px; line-height:1.6;">
                                    Your booking has been confirmed. Here is a summary of your reservation details below.
                                </p>

                                <!-- Booking Details table -->
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

                        <!-- Footer -->
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

    # Attach the HTML to the email
    msg.attach(MIMEText(html, 'html'))

    # Connect to Gmail's server and send the email
    with smtplib.SMTP_SSL('smtp.gmail.com', 465) as server:

        # Log into Gmail using your credentials from .env
        server.login(sender, password)

        # Actually send the email
        server.sendmail(sender, recipient, msg.as_string())
