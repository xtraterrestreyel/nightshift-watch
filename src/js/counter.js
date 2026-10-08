// Public visitor counter in the footer, with a rotating dot globe on hover or tap.
// Talks to the nightshift-api Worker on Cloudflare. Hidden until CONFIG.apiBaseUrl is set.
import { CONFIG } from './config.js';
import { STATE_CENTERS, COUNTRY_CENTERS } from './places.js';
import { captureRef, visitorId } from './ref.js';

const ORDER = ['Midwest', 'South', 'West', 'Northeast', 'Outside the US', 'Unknown'];
const LABEL = { 'Unknown': 'Location unknown' };
const fmt = (n) => Number(n || 0).toLocaleString('en-US');
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Add ?globePreview to the page address to see the globe filled with sample data.
const PREVIEW = (() => { try { return new URLSearchParams(location.search).has('globePreview'); } catch (e) { return false; } })();
const SAMPLE = {
  total: 312,
  regions: [{ region: 'Midwest', n: 168 }, { region: 'South', n: 71 }, { region: 'West', n: 38 }, { region: 'Northeast', n: 21 }, { region: 'Outside the US', n: 14 }],
  states: [{ state: 'Illinois', n: 121 }, { state: 'Indiana', n: 22 }, { state: 'Texas', n: 31 }, { state: 'Georgia', n: 18 }, { state: 'California', n: 20 },
    { state: 'Ohio', n: 15 }, { state: 'New York', n: 13 }, { state: 'Florida', n: 12 }, { state: 'Washington', n: 9 }, { state: 'Colorado', n: 6 }],
  countries: [{ country: 'US', n: 298 }, { country: 'CA', n: 5 }, { country: 'GB', n: 4 }, { country: 'NG', n: 3 }, { country: 'IN', n: 2 }],
  areas: [{ country: 'CA', area: 'Ontario', lat: 43.5, lng: -79.5, n: 3 }, { country: 'CA', area: 'Quebec', lat: 45.5, lng: -73.5, n: 2 },
    { country: 'GB', area: 'England', lat: 51.5, lng: 0, n: 2 }, { country: 'GB', area: 'Scotland', lat: 56, lng: -3, n: 1 },
    { country: 'NG', area: 'Lagos', lat: 6.5, lng: 3.5, n: 3 }, { country: 'IN', area: 'Maharashtra', lat: 19, lng: 73, n: 1 },
    { country: 'IN', area: 'Karnataka', lat: 13, lng: 77.5, n: 1 }]
};

// Most areas the globe will light up at once, so a busy map stays readable.
const MAX_AREA_DOTS = 150;

let data = null;
let globe = null;
let globeLoading = null;

function countryName(code) {
  try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) || code; } catch (e) { return code; }
}

// Areas outside the U.S. (province, state, or region), grouped by country, busiest first.
function areasByCountry(d) {
  const by = {};
  (d.areas || []).forEach(a => {
    if (!a || !a.country || a.country === 'US' || !a.area || !(a.n > 0)) return;
    (by[a.country] = by[a.country] || []).push(a);
  });
  Object.values(by).forEach(list => list.sort((x, y) => y.n - x.n));
  return by;
}

// Where an area sits on the globe; falls back to its country's center.
function areaPoint(a) {
  if (a.lat != null && a.lng != null && isFinite(a.lat) && isFinite(a.lng)) return [Number(a.lat), Number(a.lng)];
  return COUNTRY_CENTERS[a.country] || null;
}

function globeTargets(d) {
  const out = [];
  const states = d.states || d.topStates || [];
  states.forEach(s => { const c = STATE_CENTERS[s.state]; if (c) out.push({ lat: c[0], lng: c[1], count: s.n }); });
  const byCountry = areasByCountry(d);
  let areaDots = 0;
  (d.countries || []).forEach(c => {
    if (c.country === 'US') return; // US visitors light up their states instead
    const center = COUNTRY_CENTERS[c.country];
    let placed = 0;
    (byCountry[c.country] || []).forEach(a => {
      if (areaDots >= MAX_AREA_DOTS) return;
      const p = areaPoint(a);
      if (!p) return;
      out.push({ lat: p[0], lng: p[1], count: a.n });
      placed += a.n; areaDots++;
    });
    // Visitors from before areas were recorded (or past the dot limit) stay at the country's center
    const rest = c.n - placed;
    if (rest > 0 && center) out.push({ lat: center[0], lng: center[1], count: rest });
  });
  return out;
}

// Every location with visitors: US states first, then other countries with their areas, then unknown.
function allLocations(d) {
  const list = [];
  const states = (d.states || d.topStates || []).slice().sort((x, y) => y.n - x.n);
  let stateSum = 0;
  states.forEach(st => {
    stateSum += st.n;
    const c = STATE_CENTERS[st.state];
    list.push({ name: st.state, sub: 'United States', n: st.n, lat: c ? c[0] : null, lng: c ? c[1] : null, place: true });
  });
  const countries = (d.countries || []).slice().sort((x, y) => y.n - x.n);
  const us = countries.find(c => c.country === 'US');
  if (us && us.n > stateSum) {
    const p = COUNTRY_CENTERS.US;
    list.push({ name: 'United States', sub: 'state not identified', n: us.n - stateSum, lat: p[0], lng: p[1], place: true });
  }
  const byCountry = areasByCountry(d);
  countries.filter(c => c.country !== 'US').forEach(c => {
    const p = COUNTRY_CENTERS[c.country];
    const areas = byCountry[c.country] || [];
    const name = countryName(c.country);
    list.push({ name, sub: p ? (areas.length ? areas.length + (areas.length === 1 ? ' area' : ' areas') : '') : 'not on the globe yet',
      n: c.n, lat: p ? p[0] : null, lng: p ? p[1] : null, place: !areas.length, country: true });
    let inAreas = 0;
    areas.forEach(a => {
      inAreas += a.n;
      const q = areaPoint(a);
      list.push({ name: a.area, sub: name, n: a.n, lat: q ? q[0] : null, lng: q ? q[1] : null, place: true, child: true });
    });
    if (areas.length && c.n > inAreas) {
      list.push({ name: 'Area not recorded', sub: name, n: c.n - inAreas, lat: p ? p[0] : null, lng: p ? p[1] : null, child: true });
    }
  });
  const listed = list.filter(x => !x.child).reduce((a, x) => a + x.n, 0);
  if ((d.total || 0) > listed) list.push({ name: 'Location unknown', sub: '', n: d.total - listed, lat: null, lng: null });
  return list;
}

function renderText(box, d) {
  const total = d.total || 0;
  box.querySelector('[data-vc-total]').textContent = fmt(total);
  box.querySelector('[data-vc-word]').textContent = total === 1 ? 'visitor' : 'visitors';
  const byName = {};
  (d.regions || []).forEach(r => { byName[r.region || 'Unknown'] = r.n; });
  box.querySelector('[data-vc-regions]').innerHTML = ORDER.filter(n => byName[n]).map(n => {
    const pct = total ? Math.round(byName[n] / total * 100) : 0;
    return `<li><span class="vc-name">${esc(LABEL[n] || n)}</span><span class="vc-bar"><i style="width:${Math.max(pct, 2)}%"></i></span><span class="vc-pct">${pct}%</span></li>`;
  }).join('') || '<li class="vc-empty">Region data is on its way.</li>';

  const locs = allLocations(d);
  const places = locs.filter(l => l.place).length;
  box.querySelector('[data-vc-loc-count]').textContent = places + (places === 1 ? ' location' : ' locations');
  box.querySelector('[data-vc-locs]').innerHTML = locs.map(l => `
    <li${l.child ? ' class="vc-sub"' : ''}><button type="button" class="vc-loc${l.lat == null ? ' no-map' : ''}${l.child ? ' child' : ''}${l.country ? ' parent' : ''}" ${l.lat == null ? '' : `data-lat="${l.lat}" data-lng="${l.lng}"`}>
      <span class="vc-loc-name">${esc(l.name)}${l.sub ? `<small>${esc(l.sub)}</small>` : ''}</span>
      <span class="vc-loc-n">${fmt(l.n)}</span>
    </button></li>`).join('') || '<li class="vc-empty">No locations yet.</li>';
  box.querySelector('[data-vc-preview]').hidden = !PREVIEW;
}

function openGlobe(box) {
  const canvas = box.querySelector('[data-vc-globe]');
  const note = box.querySelector('[data-vc-loading]');
  if (globe) { globe.setTargets(globeTargets(data)); globe.start(); return; }
  if (!globeLoading) {
    note.hidden = false;
    globeLoading = import('./globe.js').then(m => {
      const size = window.innerWidth <= 520 ? 220 : 250;
      globe = m.createGlobe(canvas, size);
      note.hidden = true;
      return globe;
    }).catch(() => { note.textContent = 'The globe could not load right now.'; });
  }
  globeLoading.then(g => {
    if (g && box.classList.contains('open')) { g.setTargets(globeTargets(data)); g.start(); }
  });
}

export function initVisitorCounter() {
  const box = document.querySelector('[data-visitor-counter]');
  if (!box) return;
  const base = String(CONFIG.apiBaseUrl || '').replace(/\/+$/, '');
  if (!base && !PREVIEW) return;

  const show = (d) => { data = d; renderText(box, d); box.hidden = false; };

  if (PREVIEW) {
    show(SAMPLE);
  } else {
    const vid = visitorId();
    const ref = captureRef();
    let counted = false;
    try { counted = sessionStorage.getItem('nightshift.counted') === '1'; } catch (e) { /* ignore */ }
    // Always record a visit that arrives through a rep's link, so the rep gets credit.
    const send = !counted || ref.fromUrl;
    const payload = {};
    if (vid) payload.vid = vid;
    if (ref.fromUrl || ref.code) payload.ref = ref.fromUrl || ref.code;
    const req = send
      ? fetch(base + '/api/visit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      : fetch(base + '/api/stats');
    req.then(r => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(d => { try { sessionStorage.setItem('nightshift.counted', '1'); } catch (e) { /* ignore */ } show(d); })
      .catch(() => { /* server unavailable: stay hidden */ });
  }

  // Desktop: hover opens. Phones: tap toggles.
  const btn = box.querySelector('.vc-btn');
  const canHover = () => { try { return matchMedia('(hover: hover) and (pointer: fine)').matches; } catch (e) { return false; } };
  let closeTimer = null;
  const open = () => {
    clearTimeout(closeTimer);
    if (box.classList.contains('open') || !data) return;
    const rect = box.getBoundingClientRect();
    box.classList.toggle('align-right', rect.left + rect.width / 2 > window.innerWidth / 2);
    box.classList.add('open'); btn.setAttribute('aria-expanded', 'true');
    openGlobe(box);
  };
  const close = () => {
    box.classList.remove('open'); btn.setAttribute('aria-expanded', 'false');
    if (globe) { globe.focusOn(null); globe.stop(); }
  };
  box.addEventListener('mouseenter', () => { if (canHover()) open(); });
  box.addEventListener('mouseleave', () => { if (canHover()) { clearTimeout(closeTimer); closeTimer = setTimeout(close, 180); } });
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (canHover()) open(); else if (box.classList.contains('open')) close(); else open();
  });
  document.addEventListener('pointerdown', (e) => { if (!box.contains(e.target)) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

  // Point out a location on the globe when its name is hovered, focused, or tapped
  const list = box.querySelector('[data-vc-locs]');
  let pinned = null;
  const focusBtn = (b) => {
    list.querySelectorAll('.vc-loc.active').forEach(x => x.classList.remove('active'));
    if (!b || !b.dataset.lat || !globe) { if (globe) globe.focusOn(null); return; }
    b.classList.add('active');
    globe.focusOn(parseFloat(b.dataset.lat), parseFloat(b.dataset.lng));
  };
  list.addEventListener('mouseover', (e) => { if (canHover()) focusBtn(e.target.closest('.vc-loc')); });
  list.addEventListener('mouseleave', () => { if (canHover() && !pinned) focusBtn(null); });
  list.addEventListener('focusin', (e) => focusBtn(e.target.closest('.vc-loc')));
  list.addEventListener('focusout', () => { if (!pinned) focusBtn(null); });
  list.addEventListener('click', (e) => {
    const b = e.target.closest('.vc-loc'); if (!b) return;
    e.stopPropagation();
    if (pinned === b) { pinned = null; focusBtn(null); } else { pinned = b; focusBtn(b); }
  });
}