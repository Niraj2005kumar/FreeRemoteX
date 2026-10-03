/**
 * RemoteX - Login Controller
 */

document.addEventListener('DOMContentLoaded', () => {
  // Redirect to dashboard if user is already logged in
  if (auth.redirectIfAuthenticated()) {
    return;
  }

  const form = document.getElementById('login-form');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const submitBtn = document.getElementById('submit-btn');
  const togglePasswordBtn = document.getElementById('toggle-password-btn');

  const emailError = document.getElementById('email-error');
  const passwordError = document.getElementById('password-error');

  // Toggle password visibility
  if (togglePasswordBtn) {
    togglePasswordBtn.addEventListener('click', () => {
      const isPassword = passwordInput.getAttribute('type') === 'password';
      passwordInput.setAttribute('type', isPassword ? 'text' : 'password');

      const eyeOpen = togglePasswordBtn.querySelector('.eye-open');
      const eyeClosed = togglePasswordBtn.querySelector('.eye-closed');

      if (eyeOpen && eyeClosed) {
        if (isPassword) {
          eyeOpen.classList.add('sr-only');
          eyeClosed.classList.remove('sr-only');
        } else {
          eyeOpen.classList.remove('sr-only');
          eyeClosed.classList.add('sr-only');
        }
      }
    });
  }

  // Clear errors on input
  emailInput.addEventListener('input', () => {
    emailInput.classList.remove('is-invalid');
    emailError.textContent = '';
  });

  passwordInput.addEventListener('input', () => {
    passwordInput.classList.remove('is-invalid');
    passwordError.textContent = '';
  });

  // Handle Form Submission
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    let isValid = true;
    const emailVal = emailInput.value.trim();
    const passwordVal = passwordInput.value;

    // Validate email
    if (!emailVal) {
      emailInput.classList.add('is-invalid');
      emailError.textContent = 'Email is required';
      isValid = false;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) {
      emailInput.classList.add('is-invalid');
      emailError.textContent = 'Please enter a valid email address';
      isValid = false;
    }

    // Validate password
    if (!passwordVal) {
      passwordInput.classList.add('is-invalid');
      passwordError.textContent = 'Password is required';
      isValid = false;
    }

    if (!isValid) return;

    try {
      UI.setButtonLoading(submitBtn, true, 'Signing in...');

      const result = await api.login({
        email: emailVal,
        password: passwordVal
      });

      // Save token and preliminary user info
      auth.setToken(result.access_token);
      auth.setUser({
        remote_id: result.remote_id,
        email: emailVal
      });

      // Fetch complete user profile from /user/me
      try {
        const profile = await api.getProfile();
        auth.setUser(profile);
      } catch (profileErr) {
        console.warn('Could not immediately sync user profile:', profileErr);
      }

      UI.showToast('Login successful! Redirecting...', 'success', 'Authenticated');

      // Check for redirect param
      const urlParams = new URLSearchParams(window.location.search);
      const redirectUrl = urlParams.get('redirect') || 'dashboard.html';

      setTimeout(() => {
        window.location.href = redirectUrl;
      }, 500);

    } catch (error) {
      console.error('Login error:', error);
      const message = error.message || 'Invalid email or password';
      UI.showToast(message, 'error', 'Login Failed');

      passwordInput.classList.add('is-invalid');
      passwordError.textContent = message;
    } finally {
      UI.setButtonLoading(submitBtn, false);
    }
  });
});
