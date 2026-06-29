
/* POPUP TOGGLE */
function togglePopup(id) {
  const overlay = document.getElementById(id);
  overlay.classList.toggle('show');
}

/* VALIDATION HELPERS */
function validatePhone(phone) {
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 15;
}

function validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  if (!re.test(email)) return { ok: false, msg: 'Please enter a valid email address.' };

  const domain  = email.split('@')[1].toLowerCase();
  const blocked = ['test.com', 'example.com', 'fake.com', 'mailinator.com', 'tempmail.com'];
  if (blocked.includes(domain)) return { ok: false, msg: 'Please use a real email provider.' };

  return { ok: true, msg: '' };
}

function getPasswordStrength(password) {
  const checks = {
    length:  password.length >= 8,
    upper:   /[A-Z]/.test(password),
    lower:   /[a-z]/.test(password),
    number:  /[0-9]/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
  };
  const score = Object.values(checks).filter(Boolean).length;
  return { score, checks };
}

const STRENGTH_META = [
  { label: '',            color: '#e0e0e0' },
  { label: 'Very Weak',   color: '#e74c3c' },
  { label: 'Weak',        color: '#e67e22' },
  { label: 'Fair',        color: '#f1c40f' },
  { label: 'Strong',      color: '#2ecc71' },
  { label: 'Very Strong', color: '#27ae60' },
];

/* UI HELPERS */

function setFieldMsg(id, msg, type) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.className   = 'field-msg' + (type ? ' ' + type : '');
}

function setInputState(input, state) {
  input.classList.remove('is-valid', 'is-error');
  if (state) input.classList.add(state);
}

function setFormMsg(id, msg, type) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.className   = 'form-message' + (type ? ' ' + type : '');
}

function setLoading(btnId, loading) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled    = loading;
  btn.textContent = loading ? 'Please wait…' : btn.dataset.label;
}

document.addEventListener('DOMContentLoaded', () => {
  const pwdInput     = document.getElementById('signup-password');
  const confirmInput = document.getElementById('signup-confirm');
  const fill         = document.getElementById('strength-fill');
  const label        = document.getElementById('strength-label');

  const checkIds = {
    length:  'chk-length',
    upper:   'chk-upper',
    lower:   'chk-lower',
    number:  'chk-number',
    special: 'chk-special',
  };

  /* Password strength meter */
  if (pwdInput) {
    pwdInput.addEventListener('input', () => {
      const { score, checks } = getPasswordStrength(pwdInput.value);
      const meta = STRENGTH_META[score];

      fill.style.width           = (score / 5 * 100) + '%';
      fill.style.backgroundColor = meta.color;
      label.textContent          = meta.label;
      label.style.color          = meta.color;

      for (const [key, elId] of Object.entries(checkIds)) {
        const li = document.getElementById(elId);
        if (li) li.classList.toggle('met', checks[key]);
      }

      if (confirmInput && confirmInput.value) checkConfirmMatch();
    });
  }

  if (confirmInput) confirmInput.addEventListener('input', checkConfirmMatch);

  function checkConfirmMatch() {
    const matches = pwdInput.value === confirmInput.value;
    setInputState(confirmInput, confirmInput.value ? (matches ? 'is-valid' : 'is-error') : '');
    setFieldMsg('confirm-msg',
      confirmInput.value ? (matches ? '✓ Passwords match' : 'Passwords do not match') : '',
      matches ? 'ok' : 'error');
  }

  /* Phone live validation */
  const phoneInput = document.getElementById('signup-phone');
  if (phoneInput) {
    phoneInput.addEventListener('blur', () => {
      if (!phoneInput.value) return;
      const ok = validatePhone(phoneInput.value);
      setInputState(phoneInput, ok ? 'is-valid' : 'is-error');
      setFieldMsg('phone-msg',
        ok ? '✓ Looks good' : 'Enter a valid phone number (10–15 digits)',
        ok ? 'ok' : 'error');
    });
  }

  /* Email live validation */
  const emailInput = document.getElementById('signup-email');
  if (emailInput) {
    emailInput.addEventListener('blur', () => {
      if (!emailInput.value) return;
      const { ok, msg } = validateEmail(emailInput.value);
      setInputState(emailInput, ok ? 'is-valid' : 'is-error');
      setFieldMsg('email-msg', ok ? '✓ Looks good' : msg, ok ? 'ok' : 'error');
    });
  }

  /* Button default labels */
  const signupBtn = document.getElementById('signup-btn');
  const loginBtn  = document.getElementById('login-btn');
  if (signupBtn) signupBtn.dataset.label = signupBtn.textContent;
  if (loginBtn)  loginBtn.dataset.label  = loginBtn.textContent;

  /* SIGN-UP SUBMISSION */

  const signupForm = document.getElementById('signup-form');
  if (signupForm) {
    signupForm.addEventListener('submit', async e => {
      e.preventDefault();
      setFormMsg('signup-msg', '', '');

      const firstName = document.getElementById('signup-firstname').value.trim();
      const lastName  = document.getElementById('signup-lastname').value.trim();
      const email     = document.getElementById('signup-email').value.trim();
      const phone     = document.getElementById('signup-phone').value.trim();
      const password  = document.getElementById('signup-password').value;
      const confirm   = document.getElementById('signup-confirm').value;

      const { ok: emailOk, msg: emailMsg } = validateEmail(email);
      if (!emailOk) {
        setFormMsg('signup-msg', emailMsg, 'error');
        setInputState(document.getElementById('signup-email'), 'is-error');
        return;
      }

      if (!validatePhone(phone)) {
        setFormMsg('signup-msg', 'Please enter a valid phone number.', 'error');
        setInputState(document.getElementById('signup-phone'), 'is-error');
        return;
      }

      const { score } = getPasswordStrength(password);
      if (score < 3) {
        setFormMsg('signup-msg', 'Password is too weak. Please meet at least 3 of the 5 requirements shown.', 'error');
        return;
      }

      if (password !== confirm) {
        setFormMsg('signup-msg', 'Passwords do not match.', 'error');
        setInputState(document.getElementById('signup-confirm'), 'is-error');
        return;
      }

      setLoading('signup-btn', true);

      // API CALL (via api.js)
      const { ok, data } = await API.register({
        first_name:   firstName,
        last_name:    lastName,
        email,
        phone_number: phone,
        password,
        street:       document.getElementById('signup-street').value.trim(),
        city:         document.getElementById('signup-city').value.trim(),
        province:     document.getElementById('signup-province').value.trim(),
        country:      document.getElementById('signup-country').value.trim(),
        postal_code:  document.getElementById('signup-postal').value.trim(),
        dob:          document.getElementById('signup-dob').value,
      });

      if (ok) {
        setFormMsg('signup-msg', '✓ Account created! You can now log in.', 'success');
        signupForm.reset();

        fill.style.width  = '0%';
        label.textContent = '';
        document.querySelectorAll('.strength-checks li').forEach(li => li.classList.remove('met'));
        document.querySelectorAll('#signup-form .form-input').forEach(i => setInputState(i, ''));
      } else {
        setFormMsg('signup-msg', data.error || 'Registration failed. Please try again.', 'error');
      }

      setLoading('signup-btn', false);
    });
  }

  /* LOGIN SUBMISSION */
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async e => {
      e.preventDefault();
      setFormMsg('login-msg', '', '');

      const email    = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;

      setLoading('login-btn', true);

      // API CALL (via api.js)
      const { ok, data } = await API.login({ email, password });

      if (ok) {
        setFormMsg('login-msg', '✓ Login successful! Redirecting…', 'success');
        sessionStorage.setItem('user_id', data.user_id);
        window.location.href = '/home.html';
      } else {
        setFormMsg('login-msg', data.error || 'Invalid email or password.', 'error');
      }

      setLoading('login-btn', false);
    });
  }
});
