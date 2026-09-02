/* =========================================================
   LOGIN / REGISTER PAGE LOGIC
   ========================================================= */

async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errorEl = document.getElementById('loginError');
  errorEl.hidden = true;

  try {
    await apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    location.href = 'index.html';
  } catch (err) {
    errorEl.textContent = err.message || 'Login failed.';
    errorEl.hidden = false;
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const name = document.getElementById('registerName').value.trim();
  const email = document.getElementById('registerEmail').value.trim();
  const password = document.getElementById('registerPassword').value;
  const confirmPassword = document.getElementById('registerConfirm').value;
  const errorEl = document.getElementById('registerError');
  errorEl.hidden = true;

  if (password !== confirmPassword) {
    errorEl.textContent = 'Passwords do not match.';
    errorEl.hidden = false;
    return;
  }

  try {
    await apiFetch('/auth/register', { method: 'POST', body: JSON.stringify({ name, email, password }) });
    location.href = 'index.html';
  } catch (err) {
    errorEl.textContent = err.message || 'Registration failed.';
    errorEl.hidden = false;
  }
}

const loginForm = document.getElementById('loginForm');
if (loginForm) loginForm.addEventListener('submit', handleLogin);

const registerForm = document.getElementById('registerForm');
if (registerForm) registerForm.addEventListener('submit', handleRegister);

/* If already signed in, skip straight past the auth page */
(async () => {
  const user = await fetchCurrentUser();
  if (user) location.href = 'index.html';
})();
