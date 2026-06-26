from flask import Flask
from supabase import create_client

app = Flask(__name__)

url = "https://atukxoidnpwmrsivyyrm.supabase.co"
key = "sb_publishable_VfJ2iKRB_7Y0w9FfWChrFw_lpcPChtO"

supabase = create_client(url, key)
@app.route("/")
def home():
    cars = supabase.table("cars").select("*").execute().data

    html = """
    <!DOCTYPE html>
    <html>
    <head>
        <title>Car Rental</title>
        <style>
            body {
                font-family: Arial;
                background: #f4f4f4;
                padding: 40px;
            }
            h1 {
                color: darkblue;
            }
            .car {
                background: white;
                padding: 20px;
                margin-bottom: 20px;
                border-radius: 10px;
                box-shadow: 0 0 8px lightgray;
            }
        </style>
    </head>
    <body>
        <h1>Available Cars</h1>
    """

    for car in cars:
        html += f"""
        <div class="car">
            <h3>{car['model']}</h3>
            <p>Type: {car['type']}</p>
            <p>Price: ${car['price']}/day</p>
            <p>Location: {car['location']}</p>
            <p>Seats: {car['seats']}</p>
        </div>
        """

    html += """
    </body>
    </html>
    """

    return html

if __name__ == "__main__":
    app.run(debug=True, port=5001)