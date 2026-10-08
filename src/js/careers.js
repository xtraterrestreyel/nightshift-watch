// Careers page: application form that sends straight to the Night Shift server.
import { CONFIG } from './config.js';
import { initThemeToggle } from './theme.js';
import { makeFlakes } from './effects.js';
import { captureRef, getRef } from './ref.js';

initThemeToggle();
makeFlakes();
document.getElementById('year').textContent = new Date().getFullYear();

const form = document.getElementById('applyForm');
const msg = document.getElementById('applyMsg');
const apiBase = String(CONFIG.apiBaseUrl || '').replace(/\/+$/, '');

// Referral code from a rep's link, and the applicant's time zone
captureRef();
if (getRef()) form.ref.value = getRef();
let tz = '';
try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { /* ignore */ }
form.timezone.value = tz;

// Show the calling window in the applicant's own time
function tzOffsetMinutes(zone, date) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(date);
  const m = {}; parts.forEach(p => { m[p.type] = p.value; });
  return (Date.UTC(+m.year, +m.month - 1, +m.day, (+m.hour) % 24, +m.minute, +m.second) - date.getTime()) / 60000;
}
function centralToLocal(hour) {
  const now = new Date();
  const off = tzOffsetMinutes('America/Chicago', now);
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const m = {}; parts.forEach(p => { m[p.type] = p.value; });
  const utc = Date.UTC(+m.year, +m.month - 1, +m.day, hour, 0, 0) - off * 60000;
  return new Date(utc).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(':00', '').replace('AM', 'a.m.').replace('PM', 'p.m.');
}
try {
  if (tz && tz !== 'America/Chicago') {
    document.getElementById('windowHint').textContent = 'Restaurants are easiest to reach from 2 to 4 p.m. Central Time, which is ' + centralToLocal(14) + ' to ' + centralToLocal(16) + ' your time.';
  }
} catch (e) { /* keep the default hint */ }

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(form));
  const fail = (text, el) => {
    msg.className = 'form-msg error'; msg.textContent = text;
    if (el && el.focus) { el.focus(); el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  };
  // Check required fields in page order
  for (const el of form.querySelectorAll('[required]')) {
    if (el.type === 'radio') {
      if (!form.querySelector(`input[name="${el.name}"]:checked`)) {
        const legend = el.closest('fieldset').querySelector('legend').textContent.replace(' *', '');
        return fail('Please answer: ' + legend, el);
      }
    } else if (!String(el.value || '').trim()) {
      const label = (el.closest('label').querySelector('span') || {}).textContent || 'this field';
      return fail('Please complete: ' + label.replace(' *', ''), el);
    }
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(data.email).trim())) return fail('Check your email address.', form.email);
  if (!form.ack.checked) return fail('Please check the box to confirm you understand the role.', form.ack);
  if (!apiBase) return fail('Applications are not connected yet. Please try again later.');

  const payload = { ...data, ack: true, ref: String(data.ref || '').trim().toUpperCase() };
  const btn = form.querySelector('button[type="submit"]');
  btn.disabled = true; const label = btn.textContent; btn.textContent = 'Sending...';
  msg.className = 'form-msg'; msg.textContent = '';
  try {
    const res = await fetch(apiBase + '/api/apply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const out = await res.json().catch(() => ({}));
    if (!res.ok || !out.ok) throw new Error(out.error || 'We could not send your application just now. Please try again.');
    form.hidden = true;
    const done = document.getElementById('applyDone');
    done.hidden = false;
    done.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch (err) {
    fail(err.message);
  } finally {
    btn.disabled = false; btn.textContent = label;
  }
});