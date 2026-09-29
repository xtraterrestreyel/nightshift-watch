import { login, startDemo, getSession } from './auth.js';
import { initThemeToggle } from './theme.js';
import { makeFlakes } from './effects.js';

initThemeToggle();

if (getSession()) window.location.replace('./dashboard.html');
makeFlakes();

const form = document.getElementById('loginForm');
const msg = document.getElementById('loginMsg');

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(form));
  if (login(String(data.email || ''), String(data.password || ''))) {
    window.location.href = './dashboard.html';
  } else {
    msg.className = 'form-msg error';
    msg.textContent = 'That email and password did not match. Check them and try again, or use the live demo.';
  }
});

document.getElementById('demoBtn').addEventListener('click', () => {
  startDemo();
  window.location.href = './dashboard.html';
});