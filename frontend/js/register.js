document.addEventListener('DOMContentLoaded', () => {
  if (auth.redirectIfAuthenticated()) {
    return;
  }

  const form = document.getElementById('register-form');
  const nameInput = document.getElementById('name');
  const emailInput = document.getElementById('email');
  const remoteIdInput = document.getElementById('remote-id');
  const passwordInput = document.getElementById('password');
  const confirmPasswordInput = document.getElementById('confirm-password');
  const submitBtn = document.getElementById('submit-btn');
  const generateIdBtn = document.getElementById('generate-id-btn');

  const nameError = document.getElementById('name-error');
  const emailError = document.getElementById('email-error');
  const remoteIdError = document.getElementById('remote-id-error');
  const passwordError = document.getElementById('password-error');
  const confirmPasswordError = document.getElementById(
    'confirm-password-error',
  );

  // Helper to generate a standardized Remote ID
  function generateRandomRemoteId() {
    const num = Math.floor(10000 + Math.random() * 90000);
    return `RX-${num}`;
  }

  // Prepopulate Remote ID with random recommendation
  if (remoteIdInput && !remoteIdInput.value) {
    remoteIdInput.value = generateRandomRemoteId();
  }

  if (generateIdBtn) {
    generateIdBtn.addEventListener('click', () => {
      remoteIdInput.value = generateRandomRemoteId();
      remoteIdInput.classList.remove('is-invalid');
      remoteIdError.textContent = '';
      UI.showToast('Generated fresh Remote ID', 'info', 'Remote ID', 2000);
    });
  }

  // Password visibility togglers
  document.querySelectorAll('.toggle-pw-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');
      const targetInput = document.getElementById(targetId);
      if (!targetInput) return;

      const isPassword = targetInput.getAttribute('type') === 'password';
      targetInput.setAttribute('type', isPassword ? 'text' : 'password');
    });
  });

  // Clear validation errors on typing
  const fields = [
    { input: nameInput, error: nameError },
    { input: emailInput, error: emailError },
    { input: remoteIdInput, error: remoteIdError },
    { input: passwordInput, error: passwordError },
    { input: confirmPasswordInput, error: confirmPasswordError },
  ];

  fields.forEach(({ input, error }) => {
    input.addEventListener('input', () => {
      input.classList.remove('is-invalid');
      error.textContent = '';
    });
  });

  // Form Submission
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    let isValid = true;
    const nameVal = nameInput.value.trim();
    const emailVal = emailInput.value.trim();
    const remoteIdVal = remoteIdInput.value.trim().toUpperCase();
    const passwordVal = passwordInput.value;
    const confirmPasswordVal = confirmPasswordInput.value;

    // Validate Name
    if (!nameVal) {
      nameInput.classList.add('is-invalid');
      nameError.textContent = 'Full name is required';
      isValid = false;
    }

    // Validate Email
    if (!emailVal) {
      emailInput.classList.add('is-invalid');
      emailError.textContent = 'Email address is required';
      isValid = false;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) {
      emailInput.classList.add('is-invalid');
      emailError.textContent = 'Please enter a valid email address';
      isValid = false;
    }

    // Validate Remote ID
    if (!remoteIdVal) {
      remoteIdInput.classList.add('is-invalid');
      remoteIdError.textContent = 'Remote ID is required';
      isValid = false;
    } else if (!/^[A-Za-z0-9_-]{3,24}$/.test(remoteIdVal)) {
      remoteIdInput.classList.add('is-invalid');
      remoteIdError.textContent =
        'Remote ID must be 3-24 characters (letters, numbers, dash)';
      isValid = false;
    }

    // Validate Password
    if (!passwordVal) {
      passwordInput.classList.add('is-invalid');
      passwordError.textContent = 'Password is required';
      isValid = false;
    } else if (passwordVal.length < 6) {
      passwordInput.classList.add('is-invalid');
      passwordError.textContent = 'Password must be at least 6 characters';
      isValid = false;
    }

    // Validate Password Confirmation
    if (!confirmPasswordVal) {
      confirmPasswordInput.classList.add('is-invalid');
      confirmPasswordError.textContent = 'Please confirm your password';
      isValid = false;
    } else if (passwordVal !== confirmPasswordVal) {
      confirmPasswordInput.classList.add('is-invalid');
      confirmPasswordError.textContent = 'Passwords do not match';
      isValid = false;
    }

    if (!isValid) return;

    try {
      UI.setButtonLoading(submitBtn, true, 'Creating account...');

      await API.register({
        name: nameVal,
        email: emailVal,
        remote_id: remoteIdVal,
        password: passwordVal,
      });

      UI.showToast(
        'Registration successful! Redirecting to login...',
        'success',
        'Account Created',
      );

      setTimeout(() => {
        window.location.href = 'login.html';
      }, 1200);
    } catch (error) {
      console.error('Registration error:', error);
      const message =
        error.message || 'Registration failed. Please check your information.';
      UI.showToast(message, 'error', 'Registration Error');

      if (message.toLowerCase().includes('email')) {
        emailInput.classList.add('is-invalid');
        emailError.textContent = message;
      } else if (message.toLowerCase().includes('remote id')) {
        remoteIdInput.classList.add('is-invalid');
        remoteIdError.textContent = message;
      }
    } finally {
      UI.setButtonLoading(submitBtn, false);
    }
  });
});
