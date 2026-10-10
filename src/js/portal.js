// Night Shift team portal: owner, team leads, and business-to-business specialists.
import { CONFIG } from './config.js';
import { initThemeToggle } from './theme.js';
import { AGREEMENT } from './agreement.js';
import { drawQrCard } from './qrcard.js';
import { initVisitorCounter } from './counter.js';

const API = String(CONFIG.apiBaseUrl || '').replace(/\/+$/, '') + '/api/portal';
const TOKEN_KEY = 'nightshift.portal.token';
// Where this portal is open (used for invite links, so they work on the backup address too)
const HERE = location.origin + location.pathname.replace(/[^/]*$/, '');
// Referral links and QR codes always use the main address, even from the backup copy
const SITE = /\.pages\.dev$/.test(location.hostname) ? 'https://nightshift.watch/' : HERE;
const app = document.getElementById('app');
const SNOW = document.getElementById('snow').innerHTML;

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => Number(n || 0).toLocaleString('en-US');
const dateOnly = (s) => { if (!s) return ''; const d = new Date(String(s).replace(' ', 'T') + (String(s).includes('Z') || String(s).includes('+') ? '' : 'Z')); return isNaN(d) ? s : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); };
const ROLE_NAME = { owner: 'Owner', lead: 'Team lead', rep: 'Business-to-business specialist' };

let token = null;
try { token = localStorage.getItem(TOKEN_KEY); } catch (e) { /* ignore */ }
let me = null;
let page = null;
let cache = {};
let invitePrefill = null; // filled when the owner clicks Create invite on an application

// ---------- API ----------
async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  let res;
  try {
    res = await fetch(API + path, { method: opts.method || 'GET', headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
  } catch (e) { throw new Error('Could not reach the server. Check your connection and try again.'); }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && token && path !== '/login') { signOut(true); throw new Error('Your session ended. Please sign in again.'); }
  if (!res.ok || data.ok === false) throw new Error(data.error || 'Something went wrong.');
  return data;
}
function setToken(t) { token = t; try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch (e) { /* ignore */ } }
async function signOut(silent) {
  if (!silent && token) { try { await api('/logout', { method: 'POST' }); } catch (e) { /* ignore */ } }
  setToken(null); me = null; cache = {}; renderLogin();
}

// ---------- Small UI helpers ----------
function toast(msg, bad) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = 'toast show' + (bad ? ' bad' : '');
  clearTimeout(toast.timer); toast.timer = setTimeout(() => { t.className = 'toast'; }, 3200);
}
async function copy(text, label) {
  try { await navigator.clipboard.writeText(text); toast((label || 'Copied') + ' to your clipboard'); }
  catch (e) {
    const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); toast((label || 'Copied') + ' to your clipboard'); } catch (e2) { toast('Copy failed. Select the text and copy it manually.', true); }
    ta.remove();
  }
}
function busy(btn, on, text) {
  if (!btn) return;
  if (on) { btn.dataset.label = btn.textContent; btn.textContent = text || 'Working...'; btn.disabled = true; }
  else { btn.textContent = btn.dataset.label || btn.textContent; btn.disabled = false; }
}
function themeButton() {
  return '<button class="theme-toggle" type="button" data-theme-toggle aria-label="Switch to light mode"><svg class="sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4"/></svg><svg class="moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg></button>';
}
function statCard(label, value, note, cls) {
  return `<div class="stat ${cls || ''}"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(note || '')}</small></div>`;
}
function chart(daily, field, label) {
  const days = [];
  const map = {}; (daily || []).forEach(d => { map[d.day] = d; });
  for (let i = 29; i >= 0; i--) { const k = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10); days.push({ day: k, v: (map[k] && map[k][field]) || 0 }); }
  const max = Math.max(1, ...days.map(d => d.v));
  const total = days.reduce((a, d) => a + d.v, 0);
  return `<div class="card"><div class="card-head"><h2>${esc(label)}, last 30 days</h2><span class="chip">${fmt(total)} total</span></div>
    <div class="pchart">${days.map(d => `<i style="height:${Math.max(3, Math.round(d.v / max * 100))}%" title="${esc(d.day)}: ${d.v}"></i>`).join('')}</div>
    <div class="pchart-axis"><span>${esc(dateOnly(days[0].day))}</span><span>Today</span></div></div>`;
}
const quoteDetails = (q) => { try { return JSON.parse(q.quote_json || '{}'); } catch (e) { return {}; } };

// ---------- Sign in ----------
function authShell(inner) {
  app.innerHTML = `<div class="auth-wrap">
    <div class="auth-top"><a class="side-logo" href="index.html"><span class="mark" aria-hidden="true">${SNOW}</span><span><b>Night Shift</b><small>Team portal</small></span></a>${themeButton()}</div>
    ${inner}</div>`;
  initThemeToggle();
}
function renderLogin(message) {
  authShell(`<form class="card auth-card" id="loginForm" novalidate>
      <h1>Team sign in</h1>
      <p class="muted">For Night Shift owners, team leads, and business-to-business specialists.</p>
      <label class="field"><span>Email</span><input name="email" type="email" autocomplete="email" required></label>
      <label class="field"><span>Password</span><input name="password" type="password" autocomplete="current-password" required></label>
      <button class="btn-ice full" type="submit">Sign in</button>
      <p class="form-msg ${message ? 'error' : ''}" id="loginMsg" role="status">${esc(message || '')}</p>
      <p class="muted small">New to the team? You need a personal invitation link to register.</p>
    </form>`);
  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target; const btn = f.querySelector('button[type="submit"]'); const msg = document.getElementById('loginMsg');
    const d = Object.fromEntries(new FormData(f));
    busy(btn, true, 'Signing in...');
    try {
      const r = await api('/login', { method: 'POST', body: { email: d.email, password: d.password } });
      setToken(r.token); me = r.user; start();
    } catch (err) { msg.className = 'form-msg error'; msg.textContent = err.message; }
    finally { busy(btn, false); }
  });
}

// ---------- Registration from an invite ----------
async function renderRegister(inviteToken) {
  authShell('<div class="card auth-card"><p class="muted">Checking your invitation...</p></div>');
  let inv;
  try { inv = await (await fetch(API + '/invite?token=' + encodeURIComponent(inviteToken))).json(); }
  catch (e) { inv = { ok: false, error: 'Could not reach the server. Try again in a moment.' }; }
  if (!inv.ok) {
    authShell(`<div class="card auth-card"><h1>Invitation problem</h1><p>${esc(inv.error)}</p><a class="btn-quiet" href="portal.html">Go to sign in</a></div>`);
    return;
  }
  authShell(`<form class="card auth-card wide" id="regForm" novalidate>
      <h1>Welcome, ${esc(inv.name)}</h1>
      <p class="muted">You're invited to join Night Shift as a <b>${esc(ROLE_NAME[inv.role])}</b>${inv.team_name ? ` ${inv.role === 'lead' ? 'leading' : 'on'} <b>${esc(inv.team_name)}</b>` : ''}${inv.role === 'lead' && inv.seat_limit ? ` with ${esc(inv.seat_limit)} seats` : ''}.</p>
      <div class="grid2">
        <label class="field"><span>Your email</span><input name="email" type="email" autocomplete="email" required placeholder="${esc(inv.email_hint)}"><small class="cell-sub">Use the email this invite was sent to (${esc(inv.email_hint)}).</small></label>
        <label class="field"><span>Your full name</span><input name="name" value="${esc(inv.name)}" autocomplete="name" required></label>
      </div>
      <label class="field"><span>Choose your code name (3 to 10 letters)</span><input name="code_name" maxlength="10" autocomplete="off" required placeholder="TOBI"></label>
      <p class="code-preview">Your code will look like <b id="codePreview">TOBI####</b>. We add 4 unique numbers when you register.</p>
      <div class="grid2">
        <label class="field"><span>Password (at least 10 characters)</span><input name="password" type="password" autocomplete="new-password" required></label>
        <label class="field"><span>Confirm password</span><input name="password2" type="password" autocomplete="new-password" required></label>
      </div>
      <div class="agreement-box" tabindex="0">${agreementHtml()}</div>
      <label class="agree"><input type="checkbox" name="agree"> I have read and accept the ${esc(AGREEMENT.title)} (${esc(AGREEMENT.version)}).</label>
      <button class="btn-ice full" type="submit">Create my account</button>
      <p class="form-msg" id="regMsg" role="status"></p>
    </form>`);
  const f = document.getElementById('regForm');
  const codeIn = f.querySelector('input[name="code_name"]');
  codeIn.addEventListener('input', () => {
    codeIn.value = codeIn.value.toUpperCase().replace(/[^A-Z]/g, '');
    document.getElementById('codePreview').textContent = (codeIn.value || 'TOBI') + '####';
  });
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = f.querySelector('button[type="submit"]'); const msg = document.getElementById('regMsg');
    const d = Object.fromEntries(new FormData(f));
    const fail = (t) => { msg.className = 'form-msg error'; msg.textContent = t; };
    if (!d.code_name || d.code_name.length < 3) return fail('Your code name needs at least 3 letters.');
    if (String(d.password).length < 10) return fail('Choose a password with at least 10 characters.');
    if (d.password !== d.password2) return fail('The two passwords do not match.');
    if (!d.agree) return fail('Please read and accept the agreement to continue.');
    busy(btn, true, 'Creating your account...');
    try {
      const r = await api('/register', { method: 'POST', body: { token: inviteToken, email: d.email, name: d.name, code_name: d.code_name, password: d.password, agree: true } });
      setToken(r.token); me = r.user;
      history.replaceState(null, '', 'portal.html');
      toast('Welcome! Your code is ' + r.user.rep_code);
      start();
    } catch (err) { fail(err.message); }
    finally { busy(btn, false); }
  });
}
function agreementHtml() {
  return `<h3>${esc(AGREEMENT.title)}</h3><p class="muted small">${esc(AGREEMENT.version)}. ${esc(AGREEMENT.note)}</p>` +
    AGREEMENT.sections.map(s => `<h4>${esc(s.h)}</h4>${s.p.map(t => `<p>${esc(t)}</p>`).join('')}`).join('');
}

// ---------- App shell ----------
const NAV = {
  owner: [['overview', 'Overview'], ['applications', 'Applications'], ['people', 'People'], ['invites', 'Invites'], ['teams', 'Teams'], ['quotes', 'Quote requests'], ['leads', 'Leads']],
  lead: [['link', 'My link'], ['team', 'My team'], ['invites', 'Invites'], ['leads', 'Leads'], ['quotes', 'Quote requests'], ['agreement', 'Agreement']],
  rep: [['link', 'My link'], ['quotes', 'Quote requests'], ['leads', 'My leads'], ['agreement', 'Agreement']]
};
const ICON = {
  applications: '<path d="M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1z"/><path d="M8 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><path d="M8 12h8M8 16h5"/>',
  overview: '<rect x="3" y="3" width="7.5" height="9" rx="2"/><rect x="13.5" y="3" width="7.5" height="5.5" rx="2"/><rect x="13.5" y="11.5" width="7.5" height="9.5" rx="2"/><rect x="3" y="15" width="7.5" height="6" rx="2"/>',
  link: '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>',
  people: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.5a5 5 0 0 1 5.5 5"/>',
  team: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.5a5 5 0 0 1 5.5 5"/>',
  invites: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 6.5L12 13l8.5-6.5"/>',
  teams: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  quotes: '<path d="M7 3h8l4 4v14H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M15 3v4h4M9 12h7M9 16h7"/>',
  leads: '<path d="M6.5 3h3l1.5 4-2 1.5a12 12 0 0 0 6.5 6.5l1.5-2 4 1.5v3a2 2 0 0 1-2 2A17 17 0 0 1 4.5 5a2 2 0 0 1 2-2z"/>',
  agreement: '<path d="M7 3h8l4 4v14H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M9 13l2 2 4-4"/>'
};
function navButtons() {
  return NAV[me.role].map(([k, label]) => `<button type="button" data-page="${k}" ${page === k ? 'aria-current="page"' : ''}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICON[k]}</svg>${esc(label)}</button>`).join('');
}
function renderShell() {
  app.innerHTML = `<div class="shell">
    <aside class="sidebar">
      <a class="side-logo" href="index.html"><span class="mark" aria-hidden="true">${SNOW}</span><span><b>Night Shift</b><small>Team portal</small></span></a>
      <nav class="side-nav" aria-label="Portal">${navButtons()}</nav>
      <div class="side-foot">
        <div class="user"><span class="avatar">${esc((me.name || '?').charAt(0).toUpperCase())}</span><div><b>${esc(me.name)}</b><small>${esc(ROLE_NAME[me.role])}${me.rep_code ? ' &middot; ' + esc(me.rep_code) : ''}</small></div></div>
        <div class="side-actions">${themeButton()}<button class="btn-quiet" type="button" data-signout>Sign out</button></div>
      </div>
    </aside>
    <main class="main">
      <div class="mobile-brand"><span class="mark sm" aria-hidden="true">${SNOW}</span><b>Night Shift</b>${themeButton()}<button class="btn-quiet" type="button" data-signout>Sign out</button></div>
      <nav class="portal-mobile-nav" aria-label="Portal">${navButtons()}</nav>
      <header class="page-head"><div><h1 id="pageTitle"></h1><p id="pageSub"></p></div></header>
      <div id="pageBody" class="page"></div>
      <footer class="app-foot"><span>Night Shift team portal</span><span>Questions? ${esc(CONFIG.salesEmail || '')}</span></footer>
    </main>
  </div>`;
  initThemeToggle();
  app.querySelectorAll('[data-signout]').forEach(b => b.addEventListener('click', () => signOut()));
  app.querySelectorAll('[data-page]').forEach(b => b.addEventListener('click', () => go(b.dataset.page)));
}
function setHead(title, sub) { document.getElementById('pageTitle').textContent = title; document.getElementById('pageSub').textContent = sub || ''; }
function go(p) {
  page = p;
  app.querySelectorAll('[data-page]').forEach(b => { if (b.dataset.page === p) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  const body = document.getElementById('pageBody');
  body.innerHTML = '<div class="card"><p class="muted">Loading...</p></div>';
  window.scrollTo(0, 0);
  const pages = { applications: pageApplications, overview: pageOwnerOverview, people: pagePeople, invites: pageInvites, teams: pageTeams, quotes: pageQuotes, leads: pageLeads, link: pageLink, team: pageTeam, agreement: pageAgreement };
  (pages[p] || pageLink)(body).catch(err => { body.innerHTML = `<div class="card"><p class="form-msg error">${esc(err.message)}</p></div>`; });
}

// ---------- Data loaders ----------
async function loadRep(force) { if (force || !cache.rep) cache.rep = await api('/rep'); return cache.rep; }
async function loadTeam(force) { if (force || !cache.team) cache.team = await api('/team'); return cache.team; }
async function loadOwner(force) { if (force || !cache.owner) cache.owner = await api('/owner'); return cache.owner; }

// ---------- Rep and team lead: My link ----------
async function pageLink(body) {
  setHead('My link', 'Share it anywhere. Every visit, demo view, and quote request through it is credited to you.');
  const d = await loadRep(true);
  const code = me.rep_code;
  const siteLink = SITE + '?ref=' + code;
  const demoLink = SITE + 'dashboard.html?demo=1&ref=' + code;
  const t = d.totals;
  body.innerHTML = `
    <div class="card link-card">
      <div class="link-main">
        <span class="muted small">Your rep code</span>
        <div class="code-big">${esc(code)}</div>
        ${d.team ? `<p class="muted small">Team: <b>${esc(d.team.name)}</b>${d.team.lead_name ? ' &middot; Lead: ' + esc(d.team.lead_name) : ''}</p>` : ''}
        <label class="field"><span>Website link</span><div class="copy-row"><input readonly value="${esc(siteLink)}"><button class="btn-quiet" type="button" data-copy="${esc(siteLink)}">Copy</button></div></label>
        <label class="field"><span>Live demo link (good for texting owners)</span><div class="copy-row"><input readonly value="${esc(demoLink)}"><button class="btn-quiet" type="button" data-copy="${esc(demoLink)}">Copy</button></div></label>
        <p class="muted small">Visitors are credited to you for 90 days after they first use your link, even if they come back later. Owners can also type your code into the quote form.</p>
      </div>
      <div class="qr-box"><canvas id="qr" class="qr-card" aria-label="Night Shift QR code for your website link"></canvas><button class="btn-quiet" type="button" id="qrSave">Download QR code</button></div>
    </div>
    <div class="stats">
      ${statCard('Unique visitors', fmt(t.uniques), 'People who used your link')}
      ${statCard('Total visits', fmt(t.visits), 'Including return visits')}
      ${statCard('Demo views', fmt(t.demos), 'Opened the live demo')}
      ${statCard('Quote requests', fmt(t.quotes), 'Credited to your code', 'feature')}
    </div>
    ${chart(d.daily, 'uniques', 'Unique visitors')}
    <div class="card muted-card"><h2>Clients and commissions</h2><p class="muted">When sales open, your signed clients, upfront commissions, and monthly residuals will appear here.</p></div>`;
  body.querySelectorAll('[data-copy]').forEach(b => b.addEventListener('click', () => copy(b.dataset.copy, 'Link copied')));
  const canvas = document.getElementById('qr');
  await drawQrCard(canvas, { link: siteLink, code });
  document.getElementById('qrSave').addEventListener('click', () => {
    const a = document.createElement('a'); a.href = canvas.toDataURL('image/png'); a.download = 'night-shift-' + code + '-qr.png'; a.click();
  });
}

// ---------- Quote requests (rep, lead, owner) ----------
async function pageQuotes(body) {
  setHead('Quote requests', me.role === 'owner' ? 'Every request from the website, and who it is credited to.' : me.role === 'lead' ? 'Requests credited to you and your team.' : 'Requests credited to your code.');
  let quotes, users = [];
  if (me.role === 'owner') { const d = await loadOwner(true); quotes = d.quotes; users = d.users.filter(u => u.rep_code); }
  else if (me.role === 'lead') quotes = (await loadTeam(true)).team_quotes;
  else quotes = (await loadRep(true)).quotes;
  if (!quotes.length) { body.innerHTML = '<div class="card"><p class="muted">No quote requests yet. When someone requests a quote through your link or enters your code, it shows up here.</p></div>'; return; }
  const byCode = {}; users.forEach(u => { byCode[u.rep_code] = u.name; });
  body.innerHTML = `<div class="card"><div class="table-scroll"><table>
    <thead><tr><th>Date</th><th>Business</th><th>Contact</th><th>Quote</th><th>Location</th><th>Credited to</th></tr></thead>
    <tbody>${quotes.map(q => { const x = quoteDetails(q); return `<tr>
      <td>${esc(dateOnly(q.created_at))}</td>
      <td><b>${esc(q.restaurant)}</b><small class="cell-sub">${esc(q.notes || '')}</small></td>
      <td>${esc(q.name)}<small class="cell-sub"><a href="tel:${esc(q.phone)}">${esc(q.phone)}</a> &middot; <a href="mailto:${esc(q.email)}">${esc(q.email)}</a></small></td>
      <td>${esc(x.units || '?')} units<small class="cell-sub">${esc(x.upfront || '')} + ${esc(x.monitoring || '')}</small></td>
      <td>${esc([q.state, q.country].filter(Boolean).join(', '))}</td>
      <td>${me.role === 'owner'
        ? `<select class="mini-select" data-credit="${q.id}"><option value="">Not credited</option>${users.map(u => `<option value="${esc(u.rep_code)}" ${u.rep_code === q.ref_code ? 'selected' : ''}>${esc(u.name)} (${esc(u.rep_code)})</option>`).join('')}</select>`
        : esc(q.ref_code || '')}</td></tr>`; }).join('')}</tbody></table></div>
    ${me.role === 'owner' ? '<p class="log-note">Changing "Credited to" corrects who gets credit for a request.</p>' : ''}</div>`;
  body.querySelectorAll('[data-credit]').forEach(sel => sel.addEventListener('change', async () => {
    try { await api('/quotes/credit', { method: 'POST', body: { id: sel.dataset.credit, ref_code: sel.value } }); toast('Credit updated'); }
    catch (err) { toast(err.message, true); }
  }));
}

// ---------- Leads ----------
async function pageLeads(body) {
  const manager = me.role === 'owner' || me.role === 'lead';
  setHead(me.role === 'rep' ? 'My leads' : 'Leads', me.role === 'rep' ? 'Businesses assigned to you. Update the status after every call.' : 'Assign leads so no two people ever call the same business.');
  const d = await api('/leads');
  let people = [], teams = [];
  if (me.role === 'owner') { const o = await loadOwner(true); people = o.users.filter(u => u.role !== 'owner' && u.status === 'active'); teams = o.teams; }
  else if (me.role === 'lead') { const t = await loadTeam(true); people = [{ id: me.id, name: me.name + ' (you)' }, ...t.members.filter(m => m.status === 'active')]; }
  const nameOf = {}; people.forEach(p => { nameOf[p.id] = p.name; });
  const teamOf = {}; teams.forEach(t => { teamOf[t.id] = t.name; });
  const leads = d.leads;
  if (!leads.length) {
    body.innerHTML = `<div class="card"><p class="muted">${me.role === 'rep' ? 'No leads assigned to you yet. When calling begins, your leads will appear here.' : 'No leads here yet.'}</p></div>`;
    return;
  }
  const cities = [...new Set(leads.map(l => l.city).filter(Boolean))].sort();
  const state = { city: '', priority: '', status: '', assigned: '', q: '' };
  const filtered = () => leads.filter(l =>
    (!state.city || l.city === state.city) && (!state.priority || l.priority === state.priority) && (!state.status || l.status === state.status) &&
    (!state.assigned || (state.assigned === 'none' ? (!l.assigned_user_id && !l.assigned_team_id) : String(l.assigned_user_id) === state.assigned)) &&
    (!state.q || (l.name + ' ' + (l.type || '') + ' ' + (l.contact || '')).toLowerCase().includes(state.q.toLowerCase())));
  body.innerHTML = `
    ${callWindowBanner()}
    <div class="card filters">
      <input class="mini-input" data-f="q" placeholder="Search by business, type, or contact">
      <select class="mini-select" data-f="city"><option value="">All towns</option>${cities.map(c => `<option>${esc(c)}</option>`).join('')}</select>
      <select class="mini-select" data-f="priority"><option value="">All priorities</option><option>Top 30</option><option>Multi-location</option><option>Standard</option></select>
      <select class="mini-select" data-f="status"><option value="">All statuses</option>${d.statuses.map(s => `<option>${esc(s)}</option>`).join('')}</select>
      ${manager ? `<select class="mini-select" data-f="assigned"><option value="">Anyone</option><option value="none">Unassigned</option>${people.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select>` : ''}
    </div>
    ${manager ? `<div class="card assign-bar">
      <span id="selCount">0 selected</span>
      <select class="mini-select" id="assignTo"><option value="">Assign to...</option>
        ${me.role === 'owner' && teams.length ? `<optgroup label="Whole team">${teams.map(t => `<option value="team:${t.id}">${esc(t.name)}</option>`).join('')}</optgroup>` : ''}
        <optgroup label="Person">${people.map(p => `<option value="user:${p.id}">${esc(p.name)}</option>`).join('')}</optgroup>
        <option value="none">${me.role === 'owner' ? 'Unassign' : 'Back to team pool'}</option></select>
      <button class="btn-ice" type="button" id="assignBtn">Apply</button>
      <span class="sel-tools">
        <select class="mini-select" id="selN" aria-label="How many to select"><option>10</option><option selected>20</option><option>25</option><option>50</option><option>100</option></select>
        <button class="btn-quiet" type="button" id="selFirst">Select</button>
        <button class="btn-quiet" type="button" id="selAll">Select all shown</button>
      </span>
      <p class="sel-hint">Tip: filter first (for example Unassigned), then select the first 10 to 100 shown. Hold Shift and click two checkboxes to select everything between them.</p>
    </div>` : ''}
    <div class="card"><div class="table-scroll"><table class="leads-table">
      <thead><tr>${manager ? '<th><input type="checkbox" id="pickAll" aria-label="Select or clear all shown"></th>' : ''}<th>Business</th><th>Phone and who to ask for</th><th>Town and best time to call</th><th>Why call</th>${manager ? '<th>Assigned to</th>' : ''}<th>Status and notes</th></tr></thead>
      <tbody id="leadRows"></tbody></table></div><p class="log-note" id="leadCount"></p></div>`;
  const selected = new Set();
  const rows = document.getElementById('leadRows');
  function draw() {
    const list = filtered();
    rows.innerHTML = list.map(l => `<tr data-id="${l.id}">
      ${manager ? `<td><input type="checkbox" class="pick" ${selected.has(l.id) ? 'checked' : ''} aria-label="Select ${esc(l.name)}"></td>` : ''}
      <td><b>${esc(l.name)}</b><small class="cell-sub">${esc(l.type || '')}${l.priority && l.priority !== 'Standard' ? ' &middot; ' + esc(l.priority) : ''}${l.group_name ? ' &middot; ' + esc(l.group_name) : ''}</small></td>
      <td class="call-cell"><span class="phone">${esc(l.phone || '')}</span>
        <label class="ask-for"><span>Ask for</span><input class="mini-input contact" maxlength="120" value="${esc(l.contact || '')}" placeholder="Owner or manager"></label>
        <button class="btn-call" type="button" disabled title="Calling from the dashboard is coming soon">Call</button></td>
      <td class="town-cell">${esc(l.city || '')}<small class="cell-sub">${esc(l.address || '')}</small>
        <label class="ask-for"><span>Best time to call</span><textarea class="mini-input besttime" rows="2" maxlength="160" placeholder="2 to 4 p.m. Central">${esc(l.best_time || '')}</textarea></label></td>
      <td class="why">${esc(l.why || '')}</td>
      ${manager ? `<td>${esc(nameOf[l.assigned_user_id] || (l.assigned_team_id ? 'Team: ' + (teamOf[l.assigned_team_id] || 'your team') : 'Unassigned'))}</td>` : ''}
      <td class="status-cell"><select class="mini-select st">${d.statuses.map(s => `<option ${s === l.status ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>
        <textarea class="mini-input notes" rows="2" placeholder="Notes">${esc(l.notes || '')}</textarea>
        <button class="btn-quiet save" type="button">Save</button></td></tr>`).join('');
    document.getElementById('leadCount').textContent = list.length + ' of ' + leads.length + ' leads shown';
    syncSelection();
  }
  // Keep the selected count, the toggle button, and the header checkbox in step with the selection.
  function syncSelection() {
    if (!manager) return;
    const shown = filtered();
    const shownSelected = shown.filter(l => selected.has(l.id)).length;
    document.getElementById('selCount').textContent = selected.size + ' selected' + (selected.size && shownSelected !== selected.size ? ' (' + shownSelected + ' shown)' : '');
    document.getElementById('selAll').textContent = selected.size ? 'Clear selection' : 'Select all shown';
    const all = document.getElementById('pickAll');
    all.checked = shown.length > 0 && shownSelected === shown.length;
    all.indeterminate = shownSelected > 0 && shownSelected < shown.length;
  }
  let lastPicked = null;
  draw();
  body.querySelectorAll('[data-f]').forEach(el => el.addEventListener(el.tagName === 'INPUT' ? 'input' : 'change', () => { state[el.dataset.f] = el.value; draw(); }));
  rows.addEventListener('click', (e) => {
    if (!e.target.classList.contains('pick')) return;
    const id = parseInt(e.target.closest('tr').dataset.id, 10);
    const on = e.target.checked;
    if (e.shiftKey && lastPicked !== null) {
      // Shift-click: apply to every shown lead between the last click and this one
      const ids = filtered().map(l => l.id);
      const a = ids.indexOf(lastPicked), b = ids.indexOf(id);
      if (a !== -1 && b !== -1) {
        ids.slice(Math.min(a, b), Math.max(a, b) + 1).forEach(x => { if (on) selected.add(x); else selected.delete(x); });
        draw(); lastPicked = id; return;
      }
    }
    if (on) selected.add(id); else selected.delete(id);
    lastPicked = id;
    syncSelection();
  });
  rows.addEventListener('click', async (e) => {
    const b = e.target.closest('.save'); if (!b) return;
    const tr = b.closest('tr'); const id = parseInt(tr.dataset.id, 10);
    const status = tr.querySelector('.st').value, notes = tr.querySelector('.notes').value, contact = tr.querySelector('.contact').value, best_time = tr.querySelector('.besttime').value;
    busy(b, true, 'Saving');
    try {
      await api('/leads/update', { method: 'POST', body: { id, status, notes, contact, best_time } });
      const l = leads.find(x => x.id === id); l.status = status; l.notes = notes; l.contact = contact; l.best_time = best_time;
      toast('Lead updated');
    } catch (err) { toast(err.message, true); }
    finally { busy(b, false); }
  });
  if (manager) {
    document.getElementById('selAll').addEventListener('click', () => {
      if (selected.size) selected.clear(); else filtered().forEach(l => selected.add(l.id));
      lastPicked = null; draw();
    });
    document.getElementById('selFirst').addEventListener('click', () => {
      const n = parseInt(document.getElementById('selN').value, 10) || 20;
      selected.clear();
      filtered().slice(0, n).forEach(l => selected.add(l.id));
      lastPicked = null; draw();
      toast(Math.min(n, filtered().length) + ' leads selected');
    });
    document.getElementById('pickAll').addEventListener('change', (e) => {
      const shown = filtered();
      if (e.target.checked) shown.forEach(l => selected.add(l.id)); else shown.forEach(l => selected.delete(l.id));
      lastPicked = null; draw();
    });
    document.getElementById('assignBtn').addEventListener('click', async (e) => {
      const v = document.getElementById('assignTo').value;
      if (!selected.size) return toast('Select some leads first.', true);
      if (!v) return toast('Choose who to assign them to.', true);
      const body2 = { ids: [...selected] };
      if (v.startsWith('user:')) body2.user_id = v.slice(5);
      else if (v.startsWith('team:')) body2.team_id = v.slice(5);
      busy(e.target, true, 'Assigning...');
      try { const r = await api('/leads/assign', { method: 'POST', body: body2 }); toast(r.updated + ' leads updated'); selected.clear(); cache = {}; go('leads'); }
      catch (err) { toast(err.message, true); busy(e.target, false); }
    });
  }
}

// Best calling window (2 to 4 p.m. Central) shown in the viewer's own time zone.
function tzOffsetMinutes(tz, date) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(date);
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
function callWindowBanner() {
  let localTz = '';
  try { localTz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { /* ignore */ }
  let mine = '';
  try { if (localTz && localTz !== 'America/Chicago') mine = ` That's <b>${esc(centralToLocal(14))} to ${esc(centralToLocal(16))}</b> your time.`; } catch (e) { /* ignore */ }
  return `<div class="card call-window"><b>Best general calling window: 2 to 4 p.m. Central</b>, between lunch and dinner.${mine} Each lead below shows its own best time when it differs.</div>`;
}

// ---------- Invites (owner and team lead) ----------
async function pageInvites(body) {
  const owner = me.role === 'owner';
  let teams = [], invites = [], seatInfo = '';
  if (owner) { const d = await loadOwner(true); teams = d.teams; invites = d.invites; }
  else {
    const d = await loadTeam(true);
    if (!d.team) { body.innerHTML = '<div class="card"><p class="muted">You are not leading a team yet.</p></div>'; return; }
    invites = d.invites;
    const open = d.team.seat_limit - d.team.members_count - d.team.pending;
    seatInfo = `${d.team.members_count} of ${d.team.seat_limit} seats filled, ${d.team.pending} invite${d.team.pending === 1 ? '' : 's'} pending, ${Math.max(0, open)} open`;
  }
  setHead('Invites', owner ? 'Each invite works once, only for the email you enter, and expires in 7 days.' : seatInfo);
  body.innerHTML = `
    <form class="card" id="invForm" novalidate>
      <div class="card-head"><h2>Create an invite</h2></div>
      <div class="grid3">
        ${owner ? `<label class="field"><span>Role</span><select name="role" class="mini-select big"><option value="rep">Business-to-business specialist</option><option value="lead">Team lead</option></select></label>` : ''}
        <label class="field"><span>Their name</span><input name="name" required></label>
        <label class="field"><span>Their email</span><input name="email" type="email" required></label>
      </div>
      ${owner ? `<div class="grid3" id="repOpts">
        <label class="field"><span>Team (optional)</span><select name="team_id" class="mini-select big"><option value="">No team</option>${teams.map(t => `<option value="${t.id}">${esc(t.name)} (${t.members_count}/${t.seat_limit})</option>`).join('')}</select></label>
      </div>
      <div class="grid3" id="leadOpts" hidden>
        <label class="field"><span>Team name</span><input name="team_name" placeholder="Team 1"></label>
        <label class="field"><span>Seats (reps they can invite)</span><input name="seat_limit" type="number" min="1" max="50" value="10"></label>
      </div>` : ''}
      <label class="check-line"><input type="checkbox" name="send_email" checked> Email the invite to them from Night Shift (replies come to ${esc(CONFIG.salesEmail || 'the company inbox')})</label>
      <button class="btn-ice" type="submit">Create invite</button>
      <p class="form-msg" id="invMsg" role="status"></p>
      <div id="invResult"></div>
    </form>
    <div class="card"><div class="card-head"><h2>Invites</h2></div>${invites.length ? `<div class="table-scroll"><table>
      <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Created</th><th></th></tr></thead>
      <tbody>${invites.map(i => {
        const expired = i.status === 'open' && i.expires_at < new Date().toISOString();
        const st = expired ? 'Expired' : i.status === 'open' ? 'Waiting' : i.status === 'used' ? 'Registered' : 'Cancelled';
        return `<tr><td>${esc(i.name)}${i.team_name ? `<small class="cell-sub">Team: ${esc(i.team_name)}</small>` : ''}</td><td>${esc(i.email)}</td><td>${esc(ROLE_NAME[i.role])}</td>
          <td><span class="chip ${st === 'Registered' ? '' : st === 'Waiting' ? 'brand' : 'warn'}">${st}</span></td><td>${esc(dateOnly(i.created_at))}</td>
          <td>${i.status === 'open' && !expired ? `<button class="btn-quiet" type="button" data-cancel="${i.id}">Cancel</button>` : ''}</td></tr>`;
      }).join('')}</tbody></table></div>` : '<p class="muted">No invites yet.</p>'}</div>`;
  const f = document.getElementById('invForm');
  let fromApplication = false;
  if (invitePrefill) {
    fromApplication = true;
    f.querySelector('[name="name"]').value = invitePrefill.name;
    f.querySelector('[name="email"]').value = invitePrefill.email;
    if (owner && invitePrefill.role === 'lead') {
      f.querySelector('[name="role"]').value = 'lead';
      document.getElementById('leadOpts').hidden = false; document.getElementById('repOpts').hidden = true;
    }
    invitePrefill = null;
    toast('Invite form filled in from the application');
  }
  if (owner) f.querySelector('[name="role"]').addEventListener('change', (e) => {
    document.getElementById('leadOpts').hidden = e.target.value !== 'lead';
    document.getElementById('repOpts').hidden = e.target.value === 'lead';
  });
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(f));
    const btn = f.querySelector('button[type="submit"]'); const msg = document.getElementById('invMsg');
    busy(btn, true, 'Creating...');
    try {
      const r = await api('/invites', { method: 'POST', body: { role: d.role || 'rep', name: d.name, email: d.email, team_id: d.team_id, team_name: d.team_name, seat_limit: d.seat_limit, send_email: !!d.send_email, from_application: fromApplication } });
      fromApplication = false;
      const link = HERE + 'portal.html?invite=' + r.token;
      const text = `Hi ${d.name}, here is your personal invitation to join the Night Shift team. It works once, only with this email (${d.email}), and expires in 7 days:\n${link}`;
      const sent = r.emailed === 'sent';
      const why = { 'not verified': 'The nightshift.watch email address is not verified in Resend yet.', 'no key': 'The email key is not set up on the server.', 'failed': 'The email service did not accept it.' }[r.emailed];
      msg.className = 'form-msg ' + (r.emailed === 'off' || sent ? 'ok' : 'error');
      msg.textContent = sent ? `Invite created and emailed to ${d.email}.` : r.emailed === 'off' ? 'Invite created.' : `Invite created, but it could not be emailed. ${why || ''} Copy the link below and send it yourself.`;
      document.getElementById('invResult').innerHTML = `<div class="invite-result">
        <p><b>${sent ? 'Backup copy of the link.' : 'Copy this link now.'}</b> For security it is shown only once.${sent ? ' You do not need to send it; it is here in case their email does not arrive.' : ' If it gets lost, cancel it and create a new one.'}</p>
        <div class="copy-row"><input readonly value="${esc(link)}"><button class="btn-quiet" type="button" id="cpLink">Copy link</button></div>
        <label class="field"><span>Ready-to-send message</span><textarea class="mini-input" rows="3" readonly>${esc(text)}</textarea></label>
        <button class="btn-quiet" type="button" id="cpMsg">Copy message</button></div>`;
      document.getElementById('cpLink').addEventListener('click', () => copy(link, 'Invite link copied'));
      document.getElementById('cpMsg').addEventListener('click', () => copy(text, 'Message copied'));
      f.querySelector('[name="name"]').value = ''; f.querySelector('[name="email"]').value = '';
      cache = {};
    } catch (err) { msg.className = 'form-msg error'; msg.textContent = err.message; }
    finally { busy(btn, false); }
  });
  body.querySelectorAll('[data-cancel]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('Cancel this invite? The link will stop working.')) return;
    try { await api('/invites/cancel', { method: 'POST', body: { id: b.dataset.cancel } }); toast('Invite cancelled'); cache = {}; go('invites'); }
    catch (err) { toast(err.message, true); }
  }));
}

// ---------- Team lead: My team ----------
async function pageTeam(body) {
  const d = await loadTeam(true);
  if (!d.team) { setHead('My team'); body.innerHTML = '<div class="card"><p class="muted">You are not leading a team yet.</p></div>'; return; }
  setHead(d.team.name, `${d.team.members_count} of ${d.team.seat_limit} seats filled, ${d.team.pending} pending`);
  const sum = (k) => d.members.reduce((a, m) => a + (m.stats[k] || 0), 0);
  body.innerHTML = `
    <div class="stats">
      ${statCard('Team members', d.team.members_count + ' / ' + d.team.seat_limit, d.team.pending + ' invites pending')}
      ${statCard('Unique visitors', fmt(sum('uniques')), 'From your reps\' links')}
      ${statCard('Demo views', fmt(sum('demos')), 'Across the team')}
      ${statCard('Quote requests', fmt(sum('quotes')), 'Credited to the team', 'feature')}
    </div>
    ${chart(d.team_daily, 'uniques', 'Team unique visitors')}
    <div class="card"><div class="card-head"><h2>Members</h2></div>${peopleTable(d.members, false)}</div>`;
}
function peopleTable(list, ownerView, teams) {
  if (!list.length) return '<p class="muted">Nobody here yet.</p>';
  return `<div class="table-scroll"><table><thead><tr><th>Name</th><th>Role</th>${ownerView ? '<th>Team</th>' : ''}<th>Code</th><th>Visitors</th><th>Demos</th><th>Quotes</th><th>Joined</th><th>Status</th>${ownerView ? '<th></th>' : ''}</tr></thead>
    <tbody>${list.map(u => `<tr>
      <td><b>${esc(u.name)}</b><small class="cell-sub">${esc(u.email)}</small></td><td>${esc(ROLE_NAME[u.role])}</td>
      ${ownerView ? `<td>${u.role === 'rep' ? `<select class="mini-select" data-team="${u.id}"><option value="">No team</option>${teams.map(t => `<option value="${t.id}" ${t.id === u.team_id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select>` : esc((teams.find(t => t.id === u.team_id) || {}).name || '')}</td>` : ''}
      <td><code>${esc(u.rep_code || '')}</code></td><td>${fmt(u.stats.uniques)}</td><td>${fmt(u.stats.demos)}</td><td>${fmt(u.stats.quotes)}</td>
      <td>${esc(dateOnly(u.created_at))}</td><td><span class="chip ${u.status === 'active' ? '' : 'warn'}">${u.status === 'active' ? 'Active' : 'Turned off'}</span></td>
      ${ownerView ? `<td>${u.role !== 'owner' ? `<button class="btn-quiet" type="button" data-toggle="${u.id}" data-to="${u.status === 'active' ? 'inactive' : 'active'}">${u.status === 'active' ? 'Turn off' : 'Turn on'}</button>` : ''}</td>` : ''}
    </tr>`).join('')}</tbody></table></div>`;
}

// ---------- Owner pages ----------
async function pageOwnerOverview(body) {
  setHead('Overview', 'Your whole team at a glance.');
  const d = await loadOwner(true);
  const reps = d.users.filter(u => u.role === 'rep'), leads = d.users.filter(u => u.role === 'lead');
  const open = d.invites.filter(i => i.status === 'open' && i.expires_at > new Date().toISOString()).length;
  const sum = (k) => d.users.reduce((a, u) => a + (u.stats[k] || 0), 0);
  const credited = d.quotes.filter(q => q.ref_code).length;
  const recent = d.users.filter(u => u.role !== 'owner').slice().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 8);
  body.innerHTML = `
    <div class="stats">
      ${statCard('Specialists', fmt(reps.length), leads.length + ' team leads, ' + d.teams.length + ' teams')}
      ${statCard('Open invites', fmt(open), 'Waiting to register')}
      ${statCard('Referral visitors', fmt(sum('uniques')), fmt(sum('demos')) + ' demo views')}
      ${statCard('Quote requests', fmt(d.quotes.length), credited + ' credited to a rep', 'feature')}
    </div>
    ${chart(d.daily, 'uniques', 'Unique visitors from referral links')}
    <div class="grid2">
      <div class="card"><div class="card-head"><h2>Newest members</h2></div>${recent.length ? `<ul class="plain-list">${recent.map(u => `<li><b>${esc(u.name)}</b><span class="muted small">${esc(ROLE_NAME[u.role])} &middot; ${esc(u.rep_code || '')} &middot; ${esc(dateOnly(u.created_at))}</span></li>`).join('')}</ul>` : '<p class="muted">Nobody has registered yet. Create an invite to get started.</p>'}</div>
      <div class="card"><div class="card-head"><h2>Leads</h2></div><p><b>${fmt(d.leads.total)}</b> leads loaded, <b>${fmt(d.leads.unassigned)}</b> not assigned yet.</p><button class="btn-quiet" type="button" data-goto="leads">Open leads</button></div>
    </div>`;
  body.querySelector('[data-goto]').addEventListener('click', () => go('leads'));
}
async function pagePeople(body) {
  setHead('People', 'Everyone on the team. Turn someone off to block their sign-in immediately.');
  const d = await loadOwner(true);
  const list = d.users.filter(u => u.role !== 'owner');
  body.innerHTML = `<div class="card">${peopleTable(list, true, d.teams)}</div>`;
  body.querySelectorAll('[data-toggle]').forEach(b => b.addEventListener('click', async () => {
    if (b.dataset.to === 'inactive' && !confirm('Turn off this account? They will be signed out and cannot sign in until you turn it back on.')) return;
    try { await api('/users/update', { method: 'POST', body: { id: b.dataset.toggle, status: b.dataset.to } }); toast('Account updated'); cache = {}; go('people'); }
    catch (err) { toast(err.message, true); }
  }));
  body.querySelectorAll('[data-team]').forEach(sel => sel.addEventListener('change', async () => {
    try { await api('/users/update', { method: 'POST', body: { id: sel.dataset.team, team_id: sel.value || null } }); toast('Team updated'); cache = {}; }
    catch (err) { toast(err.message, true); go('people'); }
  }));
}
async function pageTeams(body) {
  setHead('Teams', 'Teams are created when a team lead registers. Adjust seats here.');
  const d = await loadOwner(true);
  body.innerHTML = `<div class="card">${d.teams.length ? `<div class="table-scroll"><table><thead><tr><th>Team</th><th>Lead</th><th>Members</th><th>Pending invites</th><th>Seats</th><th></th></tr></thead>
    <tbody>${d.teams.map(t => `<tr><td><input class="mini-input" value="${esc(t.name)}" data-name="${t.id}"></td><td>${esc(t.lead_name || 'None')}</td><td>${t.members_count}</td><td>${t.pending}</td>
      <td><input class="mini-input num" type="number" min="1" max="50" value="${t.seat_limit}" data-seats="${t.id}"></td>
      <td><button class="btn-quiet" type="button" data-save="${t.id}">Save</button></td></tr>`).join('')}</tbody></table></div>`
    : '<p class="muted">No teams yet. Invite a team lead from the Invites page; their team is created when they register.</p>'}</div>`;
  body.querySelectorAll('[data-save]').forEach(b => b.addEventListener('click', async () => {
    const id = b.dataset.save;
    try {
      await api('/teams/update', { method: 'POST', body: { id, seat_limit: body.querySelector(`[data-seats="${id}"]`).value, name: body.querySelector(`[data-name="${id}"]`).value } });
      toast('Team saved'); cache = {};
    } catch (err) { toast(err.message, true); }
  }));
}

// ---------- Applications (owner) ----------
const APP_LABELS = [
  ['Contact', [['phone', 'Phone or WhatsApp'], ['contact_pref', 'Best way to reach'], ['timezone', 'Time zone'], ['resume_url', 'Resume or LinkedIn']]],
  ['Availability', [['hours', 'Hours per week'], ['days', 'Days available'], ['start', 'Can start'], ['window_ok', 'Can work 2 to 4 p.m. Central'], ['contractor_ok', 'OK as independent contractor']]],
  ['Sales experience', [['sales_years', 'Years in sales'], ['call_volume', 'Daily calls handled'], ['quota', 'Quota experience'], ['industries', 'Industries sold to'], ['tools', 'Tools used'], ['tools_other', 'Other tools'], ['b2b', 'Sold to businesses'], ['cold_calling', 'Cold calling'], ['food_industry', 'Restaurant or food industry'], ['english', 'English']]],
  ['Most recent job', [['job1_employer', 'Employer'], ['job1_title', 'Title'], ['job1_dates', 'Dates'], ['job1_status', 'Status'], ['job1_duties', 'What they did']]],
  ['Previous job', [['job2_employer', 'Employer'], ['job2_title', 'Title'], ['job2_dates', 'Dates'], ['job2_reason', 'Reason for leaving'], ['job2_duties', 'What they did']]],
  ['Leadership', [['lead_years', 'Years leading teams'], ['team_size', 'Largest team'], ['hired', 'Has recruited and hired'], ['recruit_30', 'Could recruit in 30 days'], ['managed_managers', 'Managed other managers'], ['territories', 'Territories'], ['coaching', 'Coaching a struggling rep'], ['metrics', 'Numbers they track'], ['scenario_rep', '200 calls, no sales: what they do']]],
  ['Skills check', [['scenario_owner', '"We already check temps by hand"'], ['accomplishment', 'Biggest sales accomplishment']]],
  ['Setup', [['computer', 'Computer'], ['headset', 'Headset with microphone'], ['internet', 'Reliable internet'], ['quiet', 'Quiet place to work']]],
  ['References', [['ref1_name', 'Reference 1'], ['ref1_relation', 'Relationship'], ['ref1_contact', 'Contact'], ['ref2_name', 'Reference 2'], ['ref2_relation', 'Relationship'], ['ref2_contact', 'Contact']]],
  ['About them', [['why', 'Why they would be great'], ['heard', 'Heard about us'], ['ref', 'Referral code']]]
];
async function pageApplications(body) {
  setHead('Applications', 'Everyone who applied on the careers page. Review, take notes, and invite the best fits.');
  const d = await api('/applications');
  const apps = d.applications;
  if (!apps.length) { body.innerHTML = '<div class="card"><p class="muted">No applications yet. Share nightshift.watch/careers.html to start receiving them.</p></div>'; return; }
  const counts = {}; d.statuses.forEach(s => { counts[s] = apps.filter(a => a.status === s).length; });
  let filter = 'New';
  if (!counts.New) filter = '';
  let position = '';
  const positions = [...new Set(apps.map(a => a.role).filter(Boolean))];
  function draw() {
    const list = apps.filter(a => (!filter || a.status === filter) && (!position || a.role === position));
    body.innerHTML = `
      <div class="card filters app-filters">
        <button type="button" class="chip-btn ${!filter ? 'on' : ''}" data-filter="">All (${apps.length})</button>
        ${d.statuses.map(s => `<button type="button" class="chip-btn ${filter === s ? 'on' : ''}" data-filter="${esc(s)}">${esc(s)} (${counts[s]})</button>`).join('')}
        <select class="mini-select pos-filter" aria-label="Filter by position"><option value="">All positions</option>${positions.map(p => `<option ${p === position ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select>
      </div>
      ${list.length ? list.map(a => {
        let x = {}; try { x = JSON.parse(a.data_json || '{}'); } catch (e) { /* ignore */ }
        return `<div class="card app-card" data-id="${a.id}">
          <div class="app-head">
            <div><h2>${esc(a.name)}</h2><p class="muted small">${esc(a.role)} &middot; ${esc(a.location)}, ${esc(a.country)} &middot; applied ${esc(dateOnly(a.created_at))}</p>
              <p class="small"><a href="mailto:${esc(a.email)}">${esc(a.email)}</a> &middot; ${esc(a.phone || '')}</p></div>
            <div class="app-quick">
              <span class="chip brand">${esc(a.role || 'Position not given')}</span>
              <span class="chip">${esc(x.sales_years || '?')} in sales</span>
              ${x.lead_years ? `<span class="chip">${esc(x.lead_years)} leading, ${esc(x.team_size || '?')}</span>` : ''}
              ${x.quota ? `<span class="chip ${/usually/.test(x.quota) ? '' : 'warn'}">Quota: ${esc(x.quota.replace('Yes, ', ''))}</span>` : ''}
              <span class="chip ${x.cold_calling === 'Yes' ? '' : 'warn'}">Cold calling: ${esc(x.cold_calling || '?')}</span>
              <span class="chip ${x.computer === 'Yes' && x.headset === 'Yes' && x.internet === 'Yes' && x.quiet !== 'No' ? '' : 'warn'}">Setup: ${x.computer === 'Yes' && x.headset === 'Yes' && x.internet === 'Yes' && x.quiet !== 'No' ? 'ready' : 'missing items'}</span>
              ${x.contractor_ok === 'No' ? '<span class="chip warn">Not OK with commission-only</span>' : ''}
            </div>
          </div>
          <details><summary>Full application</summary>
            <div class="app-grid">${APP_LABELS.map(([title, rows]) => {
              const shown = rows.filter(([k]) => x[k]);
              return shown.length ? `<div><h4>${esc(title)}</h4><dl>${shown.map(([k, l]) => `<dt>${esc(l)}</dt><dd>${k === 'resume_url' && /^https?:\/\//i.test(x[k]) ? `<a href="${esc(x[k])}" target="_blank" rel="noopener">${esc(x[k])}</a>` : esc(x[k])}</dd>`).join('')}</dl></div>` : '';
            }).join('')}</div>
          </details>
          <div class="app-actions">
            <select class="mini-select app-status">${d.statuses.map(s => `<option ${s === a.status ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>
            <textarea class="mini-input app-notes" rows="2" placeholder="Private notes">${esc(a.review_notes || '')}</textarea>
            <button class="btn-quiet app-save" type="button">Save</button>
            <button class="btn-ice app-invite" type="button">Create invite</button>
          </div>
        </div>`;
      }).join('') : '<div class="card"><p class="muted">No applications with this status.</p></div>'}`;
    body.querySelectorAll('[data-filter]').forEach(b => b.addEventListener('click', () => { filter = b.dataset.filter; draw(); }));
    body.querySelector('.pos-filter').addEventListener('change', (e) => { position = e.target.value; draw(); });
    body.querySelectorAll('.app-card').forEach(card => {
      const id = parseInt(card.dataset.id, 10);
      const a = apps.find(x => x.id === id);
      card.querySelector('.app-save').addEventListener('click', async (e) => {
        const status = card.querySelector('.app-status').value, notes = card.querySelector('.app-notes').value;
        busy(e.target, true, 'Saving');
        try {
          await api('/applications/update', { method: 'POST', body: { id, status, review_notes: notes } });
          counts[a.status]--; counts[status]++; a.status = status; a.review_notes = notes;
          toast('Application updated'); draw();
        } catch (err) { toast(err.message, true); busy(e.target, false); }
      });
      card.querySelector('.app-invite').addEventListener('click', async () => {
        try { if (a.status !== 'Invited') await api('/applications/update', { method: 'POST', body: { id, status: 'Invited' } }); } catch (e) { /* ignore */ }
        invitePrefill = { name: a.name, email: a.email, role: /lead|manager/i.test(a.role) ? 'lead' : 'rep' };
        go('invites');
      });
    });
  }
  draw();
}

// ---------- Agreement ----------
async function pageAgreement(body) {
  setHead('Agreement', me.agreement_at ? `You accepted ${me.agreement_version} on ${dateOnly(me.agreement_at)}.` : '');
  body.innerHTML = `<div class="card agreement-page">${agreementHtml()}</div>`;
}

// ---------- Start ----------
async function start() {
  if (!token) return renderLogin();
  try { if (!me) me = (await api('/me')).user; }
  catch (err) { return renderLogin(err.message.includes('session') ? err.message : ''); }
  page = NAV[me.role][0][0];
  renderShell();
  go(page);
}

if (!CONFIG.apiBaseUrl) {
  authShell('<div class="card auth-card"><h1>Not connected</h1><p>The team portal needs the Night Shift server. Set apiBaseUrl in config.js.</p></div>');
} else {
  const invite = new URLSearchParams(location.search).get('invite');
  if (invite) renderRegister(invite); else start();
}

// Visitor counter and globe in the footer (same as every other page)
initVisitorCounter();