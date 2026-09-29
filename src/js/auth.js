import { CONFIG } from './config.js';

// BACKEND: this is demo-only login stored in the browser.
// Replace with real accounts (for example Supabase Auth) before selling.
const KEY = 'coldcheck.session';

function save(session) {
  try { localStorage.setItem(KEY, JSON.stringify(session)); } catch (e) { /* storage blocked */ }
}

export function getSession() {
  try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; }
}

export function login(email, password) {
  if (email && password === CONFIG.demoPassword) {
    save({ email: email.trim(), demo: true, at: Date.now() });
    return true;
  }
  return false;
}

export function startDemo() {
  save({ email: 'demo@cookdkitchen.com', demo: true, at: Date.now() });
}

export function logout() {
  try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
}