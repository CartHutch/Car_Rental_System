const API_URL = "http://127.0.0.1:5001/cars";
const FILTERS_URL = "http://127.0.0.1:5001/filters";

async function loadFilterOptions() {
    try {
        const res = await fetch(FILTERS_URL);
        const filters = await res.json();

        fillSelect("filterType", filters.types);
        fillSelect("filterSeats", filters.seats);
        fillSelect("filterLocation", filters.locations);
    } catch (err) {
        console.error(err);
    }
}

function fillSelect(id, values) {
    const select = document.getElementById(id);
    values.forEach(value => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value;
        select.appendChild(option);
    });
}

async function loadCars(search = "") {
    const params = new URLSearchParams();

    if (search) params.append("model", search);

    const type = document.getElementById("filterType").value;
    const seats = document.getElementById("filterSeats").value;
    const location = document.getElementById("filterLocation").value;

    if (type) params.append("type", type);
    if (seats) params.append("seats", seats);
    if (location) params.append("location", location);

    const url = params.toString() ? `${API_URL}?${params}` : API_URL;

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

// apply filters
document.getElementById("applyFilters").addEventListener("click", () => {
    const search = document.getElementById("searchInput").value;
    loadCars(search);
});

// clear filters
document.getElementById("clearFilters").addEventListener("click", () => {
    document.getElementById("filterType").value = "";
    document.getElementById("filterSeats").value = "";
    document.getElementById("filterLocation").value = "";
    document.getElementById("searchInput").value = "";
    loadCars();
});

// initial load
loadFilterOptions();
loadCars();