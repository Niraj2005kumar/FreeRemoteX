const API_BASE = 'http://localhost:8000';

const loginTab = document.getElementById('loginTab');
const signupTab = document.getElementById('signupTab');
const loginForm = document.getElementById('loginForm');
const signupForm = document.getElementById('signupForm');
const message = document.getElementById('message');

// Tab switching
loginTab.addEventListener('click', () => {
  loginTab.classList.add('active');
  signupTab.classList.remove('active');
  loginForm.classList.remove('hidden');
  signupForm.classList.add('hidden');
  message.textContent = '';
});

signupTab.addEventListener('click', () => {
  signupTab.classList.add('active');
  loginTab.classList.remove('active');
  signupForm.classList.remove('hidden');
  loginForm.classList.add('hidden');
  message.textContent = '';
});

// SIGNUP
signupForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const name = document.getElementById('signupName').value;
  const email = document.getElementById('signupEmail').value;
  const password = document.getElementById('signupPassword').value;
  const language_preference = document.getElementById('signupLanguage').value;

  try {
    const res = await fetch(`${API_BASE}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password, language_preference }),
    });

    const data = await res.json();

    if (res.ok) {
      message.style.color = 'green';
      message.textContent = `Signup successful! Your Remote ID: ${data.remote_id}`;
    } else {
      message.style.color = 'red';
      message.textContent = data.detail || 'Signup failed';
    }
  } catch (err) {
    message.style.color = 'red';
    message.textContent = 'Server error. Is backend running?';
  }
});

// LOGIN
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;

  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();

    if (res.ok) {
      // Save token and user info for dashboard
      localStorage.setItem('token', data.access_token);
      localStorage.setItem('name', data.name);
      localStorage.setItem('remote_id', data.remote_id);

      message.style.color = 'green';
      message.textContent = 'Login successful! Redirecting...';

      setTimeout(() => {
        window.location.href = 'dashboard.html';
      }, 1000);
    } else {
      message.style.color = 'red';
      message.textContent = data.detail || 'Login failed';
    }
  } catch (err) {
    message.style.color = 'red';
    message.textContent = 'Server error. Is backend running?';
  }
});
