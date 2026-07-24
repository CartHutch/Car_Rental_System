const form = document.getElementById('addCarForm');
const messageEl = document.getElementById('adminMessage');
const submitBtn = document.getElementById('submitBtn');

const fields = {
  model: document.getElementById('model'),
  type: document.getElementById('type'),
  seats: document.getElementById('seats'),
  price: document.getElementById('price'),
  location: document.getElementById('location'),
  imageUrl: document.getElementById('imageUrl'),
  imageFile: document.getElementById('imageFile'),
};

const fileDrop = document.getElementById('fileDrop');
const fileDropText = document.getElementById('fileDropText');
let uploadedImageDataUrl = '';

function isAuthorizedAdmin() {
  const userId = sessionStorage.getItem('user_id');
  const role = (sessionStorage.getItem('role') || '').trim().toLowerCase();
  return !!userId && role === 'admin';
}

if (!isAuthorizedAdmin()) {
  window.location.replace('/');
} else {
  document.getElementById('adminAddCarApp').hidden = false;
  document.getElementById('logoutBtn').addEventListener('click', () => {
    sessionStorage.clear();
    window.location.href = '/';
  });
}

const preview = {
  image: document.getElementById('previewImage'),
  model: document.getElementById('previewModel'),
  meta: document.getElementById('previewMeta'),
  price: document.getElementById('previewPrice'),
};

function setMessage(text, type = '') {
  messageEl.textContent = text;
  messageEl.className = 'admin-message' + (type ? ` ${type}` : '');
}

function setLoading(isLoading) {
  submitBtn.disabled = isLoading;
  submitBtn.textContent = isLoading ? 'Adding...' : submitBtn.dataset.label;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getPayload() {
  return {
    requester_id: sessionStorage.getItem('user_id'),
    model: fields.model.value.trim(),
    type: fields.type.value.trim(),
    seats: fields.seats.value,
    price: fields.price.value,
    location: fields.location.value.trim(),
    image_url: uploadedImageDataUrl || fields.imageUrl.value.trim(),
  };
}

function validatePayload(payload) {
  if (!payload.model || !payload.type || !payload.seats || !payload.location || !payload.price) {
    return 'Please fill in every required field.';
  }

  if (Number(payload.seats) <= 0 || !Number.isInteger(Number(payload.seats))) {
    return 'Seats must be a whole number greater than 0.';
  }

  if (Number(payload.price) < 0) {
    return 'Daily price cannot be negative.';
  }

  if (!Number.isInteger(Number(payload.price))) {
    return 'Daily price must be a whole dollar amount.';
  }

  return '';
}

function placeholderImage() {
  preview.image.innerHTML = `
    <svg width="54" height="54" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3">
      <rect x="2" y="7" width="20" height="12" rx="2"/>
      <path d="M16 7l-1.5-3h-5L8 7"/>
      <circle cx="6.5" cy="19" r="1.5"/>
      <circle cx="17.5" cy="19" r="1.5"/>
    </svg>`;
}

function updatePreview() {
  const payload = getPayload();
  const price = Number(payload.price || 0);

  preview.model.textContent = payload.model || 'Vehicle model';
  preview.meta.textContent = [
    payload.type || 'Type',
    payload.location || 'Location',
    payload.seats ? `${payload.seats} seats` : 'Seats',
  ].join(' · ');
  preview.price.innerHTML = `$${price.toFixed(2)} <span>/ day</span>`;

  if (payload.image_url) {
    preview.image.innerHTML = `<img src="${escapeHtml(payload.image_url)}" alt="">`;
  } else {
    placeholderImage();
  }
}

Object.values(fields).forEach(field => {
  field.addEventListener('input', updatePreview);
  field.addEventListener('change', updatePreview);
});

function handleImageFile(file) {
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    setMessage('Please choose an image file.', 'error');
    fields.imageFile.value = '';
    return;
  }

  if (file.size > 1024 * 1024) {
    setMessage('Please choose an image smaller than 1 MB.', 'error');
    fields.imageFile.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    uploadedImageDataUrl = reader.result;
    fields.imageUrl.value = '';
    fileDropText.textContent = file.name;
    setMessage('');
    updatePreview();
  };
  reader.readAsDataURL(file);
}

fields.imageFile.addEventListener('change', () => {
  handleImageFile(fields.imageFile.files[0]);
});

fields.imageUrl.addEventListener('input', () => {
  if (!fields.imageUrl.value.trim()) return;
  uploadedImageDataUrl = '';
  fields.imageFile.value = '';
  fileDropText.textContent = 'Drag an image here or click to choose one';
});

['dragenter', 'dragover'].forEach(eventName => {
  fileDrop.addEventListener(eventName, event => {
    event.preventDefault();
    fileDrop.classList.add('is-dragging');
  });
});

['dragleave', 'drop'].forEach(eventName => {
  fileDrop.addEventListener(eventName, event => {
    event.preventDefault();
    fileDrop.classList.remove('is-dragging');
  });
});

fileDrop.addEventListener('drop', event => {
  handleImageFile(event.dataTransfer.files[0]);
});

form.addEventListener('reset', () => {
  setTimeout(() => {
    uploadedImageDataUrl = '';
    fileDropText.textContent = 'Drag an image here or click to choose one';
    setMessage('');
    updatePreview();
  }, 0);
});

form.addEventListener('submit', async event => {
  event.preventDefault();
  setMessage('');

  if (!isAuthorizedAdmin()) {
    setMessage('Administrator access is required.', 'error');
    return;
  }

  const payload = getPayload();
  const validationError = validatePayload(payload);
  if (validationError) {
    setMessage(validationError, 'error');
    return;
  }

  setLoading(true);
  const { ok, data } = await API.createCar(payload);
  setLoading(false);

  if (!ok) {
    setMessage(data.error || 'Could not add vehicle.', 'error');
    return;
  }

  window.location.href = '/inventory';
});

updatePreview();
