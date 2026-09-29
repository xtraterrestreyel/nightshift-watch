// Public visitor counter. Talks to the nightshift-api server on Render.
// Stays hidden until CONFIG.apiBaseUrl is set in config.js.
import { CONFIG } from './config.js';

const ORDER = ['Midwest', 'South', 'West', 'Northeast', 'Outside the US', 'Unknown'];
const LABEL = { 'Unknown': 'Location unknown' };
const fmt = (n) => Number(n || 0).toLocaleString('en-US');
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function render(box, data) {
  const total = data.total || 0;
  box.querySelector('[data-vc-total]').textContent = fmt(total);
  box.querySelector('[data-vc-word]').textContent = total === 1 ? 'person has' : 'people have';
  const byName = {};
  (data.regions || []).forEach(r => { byName[r.region || 'Unknown'] = r.n; });
  const rows = ORDER.filter(name => byName[name]).map(name => {
    const pct = total ? Math.round(byName[name] / total * 100) : 0;
    return `<li><span class="vc-name">${esc(LABEL[name] || name)}</span>
      <span class="vc-bar"><i style="width:${Math.max(pct, 2)}%"></i></span>
      <span class="vc-pct">${pct}%</span></li>`;
  }).join('');
  box.querySelector('[data-vc-regions]').innerHTML = rows || '<li class="vc-empty">Region data is on its way.</li>';
  const states = (data.topStates || []).map(s => `${esc(s.state)} (${fmt(s.n)})`).join(', ');
  box.querySelector('[data-vc-states]').textContent = states ? 'Top states: ' + states : '';
}

export function initVisitorCounter() {
  const box = document.querySelector('[data-visitor-counter]');
  if (!box) return;
  const base = String(CONFIG.apiBaseUrl || '').replace(/\/+$/, '');
  if (!base) return; // no server yet: keep the counter hidden

  let vid = null;
  try {
    vid = localStorage.getItem('nightshift.vid');
    if (!vid) {
      vid = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(36).slice(2, 12);
      localStorage.setItem('nightshift.vid', vid);
    }
  } catch (e) { /* storage blocked: the server counts once per day instead */ }

  let counted = false;
  try { counted = sessionStorage.getItem('nightshift.counted') === '1'; } catch (e) { /* ignore */ }

  const req = counted
    ? fetch(base + '/api/stats')
    : fetch(base + '/api/visit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(vid ? { vid } : {}) });

  req.then(r => (r.ok ? r.json() : Promise.reject(r.status)))
    .then(data => {
      try { sessionStorage.setItem('nightshift.counted', '1'); } catch (e) { /* ignore */ }
      render(box, data);
      box.hidden = false;
    })
    .catch(() => { /* server unavailable: stay hidden */ });

  // Hover works on desktop; tap toggles on phones.
  const btn = box.querySelector('.vc-btn');
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = box.classList.toggle('open');
    btn.setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('click', (e) => {
    if (!box.contains(e.target)) { box.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { box.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); }
  });
}