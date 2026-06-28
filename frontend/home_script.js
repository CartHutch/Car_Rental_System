const API_URL = "http://127.0.0.1:5001/cars";

async function loadCars(search = "") {
    let url = API_URL;

    if (search) {
        url += `?model=${search}`;
    }

    try {
        const res = await fetch(url);
        const cars = await res.json();

        const grid = document.querySelector(".car-grid");
        grid.innerHTML = "";

        if (!cars || cars.length === 0) {
            grid.innerHTML = "<p>No cars found</p>";
            return;
        }

        cars.forEach(car => {
            grid.innerHTML += `
                <div class="car-card">
                    <img src="${car.image_url}" />
                    <h3>${car.model}</h3>
                    <p>${car.type} - ${car.location} - ${car.seats} Seats</p>
                    <p class="price">$${car.price} / day</p>
                </div>
            `;
        });

    } catch (err) {
        console.error(err);
    }
}

// search submit
document.querySelector(".search-box").addEventListener("submit", (e) => {
    e.preventDefault();
    const search = document.getElementById("searchInput").value;
    loadCars(search);
});

// initial load
loadCars();