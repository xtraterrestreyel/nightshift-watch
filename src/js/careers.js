// Careers page: application form that sends straight to the Night Shift server.
import { CONFIG } from './config.js';
import { initThemeToggle } from './theme.js';
import { initMobileMenu } from './nav.js';
import { makeFlakes } from './effects.js';
import { captureRef, getRef } from './ref.js';
import { initVisitorCounter } from './counter.js';

initThemeToggle();
initMobileMenu();
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

// ---------- Position-based sections ----------
const leadership = document.getElementById('leadership');
const managerOnly = document.getElementById('managerOnly');
const refsAck = document.getElementById('refsAck');
const refsNote = document.getElementById('refsNote');
function currentRole() { const r = form.querySelector('input[name="role"]:checked'); return r ? r.value : ''; }
function isLeader() { return ['Team lead', 'Regional manager'].includes(currentRole()); }
function updateRole() {
  const leader = isLeader(), manager = currentRole() === 'Regional manager';
  leadership.hidden = !leader;
  managerOnly.hidden = !manager;
  refsAck.hidden = !leader;
  form.classList.toggle('is-leader', leader);
  refsNote.textContent = leader
    ? 'Required for this position: two professional references, such as a former manager or client.'
    : 'Optional for specialists. Two professional references, such as a former manager or client.';
  // Number the sections that come after the leadership section
  let n = leader ? 7 : 6;
  ['num-skills', 'num-setup', 'num-refs', 'num-why'].forEach(cls => {
    const h = form.querySelector('h3.' + cls);
    h.textContent = n + '. ' + h.textContent.replace(/^\d+\.\s*/, '');
    n++;
  });
  form.querySelectorAll('.role-card').forEach(c => c.classList.toggle('on', c.querySelector('input').checked));
}
form.querySelectorAll('input[name="role"]').forEach(r => r.addEventListener('change', updateRole));
updateRole();

function fieldLabel(el) {
  const fs = el.closest('fieldset');
  if (fs && fs.querySelector('legend')) return fs.querySelector('legend').textContent;
  const lab = el.closest('label');
  const span = lab && lab.querySelector('span');
  let text = span ? span.textContent : 'this question';
  const job = el.closest('.job');
  if (job) {
    const title = job.querySelector('.job-title').textContent.replace(/\s*\*\s*$/, '').replace(/\s*\(optional\)\s*$/, '');
    text = title + ', ' + text.replace(/\s*\*\s*$/, '').trim();
  }
  return text;
}
function isEmpty(el) {
  if (el.type === 'radio') return !form.querySelector(`input[name="${el.name}"]:checked`);
  if (el.type === 'checkbox') return !el.checked;
  return !String(el.value || '').trim();
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fail = (text, el) => {
    msg.className = 'form-msg error'; msg.textContent = text;
    if (el && el.focus) { el.focus({ preventScroll: true }); el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  };
  if (!currentRole()) return fail('Please choose the position you are applying for.', form.querySelector('input[name="role"]'));
  const leader = isLeader(), manager = currentRole() === 'Regional manager';

  // Check required answers in page order, including position-specific ones
  const checked = new Set();
  for (const el of form.querySelectorAll('input, select, textarea')) {
    const needed = el.required || (leader && el.hasAttribute('data-lead-req')) || (manager && el.hasAttribute('data-mgr-req'));
    if (!needed || el.type === 'hidden' || el.closest('[hidden]') || checked.has(el.name)) continue;
    checked.add(el.name);
    if (isEmpty(el)) return fail('Please complete: ' + fieldLabel(el).replace(/\s*\*\s*$/, '').trim(), el);
  }
  if (!form.querySelectorAll('input[name="days"]:checked').length) return fail('Please choose at least one day you can work.', form.querySelector('input[name="days"]'));
  const email = String(form.email.value).trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail('Check your email address.', form.email);
  if (leader && !form.refs_ok.checked) return fail('Please allow us to contact your references.', form.refs_ok);
  if (!form.ack.checked) return fail('Please check the box to confirm you understand the role.', form.ack);
  if (!apiBase) return fail('Applications are not connected yet. Please try again later.');

  const fd = new FormData(form);
  const payload = Object.fromEntries(fd);
  payload.days = fd.getAll('days').join(', ');
  payload.tools = fd.getAll('tools').join(', ');
  payload.ack = true;
  payload.refs_ok = leader ? true : false;
  payload.ref = String(payload.ref || '').trim().toUpperCase();

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

// Visitor counter and globe in the footer (same as every other page)
initVisitorCounter();