import { CONFIG } from './config.js';
import { initThemeToggle } from './theme.js';
import { getSession, startDemo, logout } from './auth.js';
import { createInventory } from './inventory.js';
import { captureRef, visitorId } from './ref.js';
import { initVisitorCounter } from './counter.js';

// Credit demo views to the rep whose link brought the visitor (once per browser session).
(function trackDemoView() {
  const base = String(CONFIG.apiBaseUrl || '').replace(/\/+$/, '');
  const ref = captureRef();
  const code = ref.fromUrl || ref.code;
  if (!base || !code) return;
  try { if (sessionStorage.getItem('nightshift.demoTracked') === code) return; sessionStorage.setItem('nightshift.demoTracked', code); } catch (e) { /* ignore */ }
  fetch(base + '/api/ref-event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ref: code, vid: visitorId(), type: 'demo' }) }).catch(() => {});
})();

initThemeToggle();

const params = new URLSearchParams(window.location.search);
if (params.get('demo') === '1') startDemo();
const session = getSession();

if (!session) {
  window.location.replace('./login.html');
} else {
  runDashboard(session);
}

function runDashboard(session) {
  const DEG = '\u00B0F';
  const $ = (id) => document.getElementById(id);
  const sentence = (s) => (/[.!?]$/.test(s) ? s : s + '.');
  const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- Header, user, background ----------
  $('who').textContent = session.email;
  $('avatar').textContent = (session.email || 'D').charAt(0).toUpperCase();
  $('restaurantSmall').textContent = CONFIG.demoRestaurant;
  $('year').textContent = new Date().getFullYear();
  document.querySelectorAll('.js-logout').forEach(b => b.addEventListener('click', () => { logout(); window.location.href = './index.html'; }));

  // Slow-rising frost particles in the background
  (function makeFlakes() {
    const holder = $('flakes');
    const count = window.innerWidth < 700 ? 10 : 18;
    for (let i = 0; i < count; i++) {
      const f = document.createElement('span');
      const size = 2 + Math.random() * 3;
      f.className = 'flake';
      f.style.left = (Math.random() * 100) + '%';
      f.style.width = size + 'px';
      f.style.height = size + 'px';
      f.style.animationDuration = (22 + Math.random() * 26) + 's';
      f.style.animationDelay = (-Math.random() * 40) + 's';
      f.style.setProperty('--dx', ((Math.random() - 0.5) * 120) + 'px');
      f.style.setProperty('--o', (0.2 + Math.random() * 0.35).toFixed(2));
      holder.appendChild(f);
    }
  })();

  const PAGES = {
    overview: ['Overview', CONFIG.demoRestaurant + ', Main Street'],
    logs: ['Temperature logs', 'Inspection-ready records, kept automatically'],
    lists: ['Checklists', 'Opening and closing tasks, time-stamped'],
    inventory: ['Inventory', 'Opening and closing counts, prep, and what each unit holds'],
    alerts: ['Alert contacts', 'Who hears from Night Shift when something goes wrong'],
    setup: ['Sensor setup', 'Connect each sensor to the unit it watches']
  };

  // Safe-range rules (FDA Food Code: cold holding 41F or below, hot holding 135F or above)
  const RULES = {
    cold:   { label: 'Safe at 41' + DEG + ' or below',  dir: 'max', warn: 41,  alarm: 45,  lo: 30,  hi: 52,  limit: 41 },
    freeze: { label: 'Safe at 0' + DEG + ' or below',   dir: 'max', warn: 0,   alarm: 10,  lo: -12, hi: 16,  limit: 0 },
    hot:    { label: 'Safe at 135' + DEG + ' or above', dir: 'min', warn: 135, alarm: 130, lo: 118, hi: 165, limit: 135 }
  };

  // BACKEND: these units and readings are simulated. Load real units and
  // sensor readings from your server here.
  const DEMO_DEFS = [
    { id: 'walkin',  sensorId: '24E124136C470001', name: 'Walk-in cooler',   kind: 'cold',   base: 37.2, stock: 6200 },
    { id: 'freezer', sensorId: '24E124136C470002', name: 'Walk-in freezer',  kind: 'freeze', base: -3.4, stock: 4800 },
    { id: 'line',    sensorId: '24E124136C470003', name: 'Line reach-in',    kind: 'cold',   base: 38.4, stock: 1350 },
    { id: 'prep',    sensorId: '24E124136C470004', name: 'Pizza prep table', kind: 'cold',   base: 39.1, stock: 900 },
    { id: 'bar',     sensorId: '24E124136C470005', name: 'Bar cooler',       kind: 'cold',   base: 36.2, stock: 1100 },
    { id: 'hot',     sensorId: '24E124136C470006', name: 'Hot holding well', kind: 'hot',    base: 148,  stock: 450 }
  ];

  // Sensors the owner adds on the Sensor setup page (demo: saved on this device).
  // BACKEND: load and save these through your server instead.
  const SKEY = 'coldcheck.sensors';
  function loadAdded() {
    try { const v = JSON.parse(localStorage.getItem(SKEY)); if (Array.isArray(v)) return v; } catch (e) { /* ignore */ }
    return [];
  }
  function saveAdded() {
    try { localStorage.setItem(SKEY, JSON.stringify(DEFS.filter(d => d.added))); } catch (e) { /* ignore */ }
  }
  const DEFS = [...DEMO_DEFS, ...loadAdded()];

  const CHECKS = {
    Opening: ['Check walk-in and reach-in temps on the dashboard', 'Complete opening inventory count', 'Sanitize prep surfaces and cutting boards', 'Date-label all prepped ingredients', 'Check sanitizer buckets are at correct strength', 'Handwashing sinks stocked with soap and towels', 'Receive deliveries and check product temps'],
    Closing: ['Cover, label, and store all open product', 'Clean and sanitize the prep table', 'Empty and clean the hot holding well', 'Close walk-in door fully and check the seal', 'Take out trash and clean floor drains', 'Complete closing inventory count', 'Confirm Night Shift shows all units safe']
  };
  const CHECK_TOTAL = Object.values(CHECKS).reduce((a, l) => a + l.length, 0);
  const INV_OPEN_KEY = 'Opening' + CHECKS.Opening.indexOf('Complete opening inventory count');
  const INV_CLOSE_KEY = 'Closing' + CHECKS.Closing.indexOf('Complete closing inventory count');

  // ---------- Alert contacts (demo storage) ----------
  const CKEY = 'coldcheck.contacts';
  function loadContacts() {
    try {
      const v = JSON.parse(localStorage.getItem(CKEY));
      if (Array.isArray(v)) return v;
    } catch (e) { /* ignore */ }
    return [{ id: 1, name: 'Maria R.', role: 'Owner', phone: '(555) 010-0147', email: 'maria@example.com', sms: true, mail: true }];
  }
  function saveContacts() {
    try { localStorage.setItem(CKEY, JSON.stringify(contacts)); } catch (e) { /* ignore */ }
  }
  let contacts = loadContacts();

  let units, tickets, events, incidents, sim, checks, ticketNo, notifTimer;

  function makeUnit(d) {
    const hist = [];
    for (let i = 0; i < 48; i++) hist.push(d.base + (Math.random() - 0.5) * (d.kind === 'hot' ? 3 : 1.2));
    return { ...d, temp: d.base, hist, status: 'ok', alerted: false, incident: null };
  }

  function init() {
    units = DEFS.map(makeUnit);
    tickets = []; events = []; incidents = [];
    sim = { active: false, phase: 'idle', minutes: 0, startTemp: 0 };
    checks = {}; ticketNo = 146;
    buildUnits(); renderTickets(); renderLogs(); renderLists(); renderContacts(); renderSensors(); renderSummary(); updateClock();
    $('simBtn').disabled = false;
  }

  function status(u) {
    const r = RULES[u.kind], t = u.temp;
    if (r.dir === 'max') { if (t > r.alarm) return 'alarm'; if (t > r.warn) return 'warn'; return 'ok'; }
    if (t < r.alarm) return 'alarm'; if (t < r.warn) return 'warn'; return 'ok';
  }
  const badgeText = { ok: 'Safe', warn: 'Watch', alarm: 'Out of range' };
  const fmt = (t) => t.toFixed(1);
  const money = (n) => '$' + n.toLocaleString('en-US');

  function simClock() {
    const total = 2 * 60 + 47 + sim.minutes;
    const h = Math.floor(total / 60) % 24, m = total % 60;
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return h12 + ':' + String(m).padStart(2, '0') + (h < 12 ? ' AM' : ' PM');
  }
  const realClock = () => new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const nowLabel = () => (sim.active || sim.phase !== 'idle') ? simClock() : realClock();
  const updateClock = () => { $('clock').textContent = nowLabel(); };

  // ---------- Units ----------
  function buildUnits() {
    $('units').innerHTML = units.map(u => `
      <article class="unit" id="u-${u.id}">
        <header><h3>${u.name}</h3><span class="badge">Safe</span></header>
        <div class="temp"><span class="num">${fmt(u.temp)}</span><span class="deg">${DEG}</span></div>
        <svg class="spark" viewBox="0 0 200 56" preserveAspectRatio="none" aria-hidden="true">
          <defs><linearGradient id="g-${u.id}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="currentColor" stop-opacity=".32"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/>
          </linearGradient></defs>
          <path class="area" fill="url(#g-${u.id})"></path>
          <line x1="0" x2="200"></line><polyline></polyline>
        </svg>
        <p class="rule"><span>${RULES[u.kind].label}</span><span>Last 45 min</span></p>
      </article>`).join('');
    units.forEach(updateUnit);
  }

  function updateUnit(u) {
    const card = $('u-' + u.id);
    if (!card) return;
    card.className = 'unit ' + u.status;
    card.querySelector('.num').textContent = fmt(u.temp);
    card.querySelector('.badge').textContent = badgeText[u.status];
    const r = RULES[u.kind];
    const H = 56;
    const y = (t) => H - 4 - Math.max(0, Math.min(1, (t - r.lo) / (r.hi - r.lo))) * (H - 8);
    const pts = u.hist.map((t, i) => (i * 200 / 47).toFixed(1) + ',' + y(t).toFixed(1));
    card.querySelector('polyline').setAttribute('points', pts.join(' '));
    card.querySelector('.area').setAttribute('d', 'M0,' + H + ' L' + pts.join(' L') + ' L200,' + H + ' Z');
    const ly = y(r.limit).toFixed(1);
    const line = card.querySelector('line');
    line.setAttribute('y1', ly); line.setAttribute('y2', ly);
  }

  // ---------- Inventory link ----------
  let inv = null;
  const stockOf = (u) => { const v = inv ? inv.valueIn(u.name) : 0; return Math.round(v > 0 ? v : u.stock); };

  // ---------- Summary stats ----------
  function renderSummary() {
    const bad = units.filter(u => u.status !== 'ok');
    const alarm = bad.find(u => u.status === 'alarm');
    const safeCount = units.length - bad.length;

    $('stSafe').textContent = safeCount + '/' + units.length;
    $('stSafeNote').textContent = !bad.length ? 'Everything is holding temp' : (alarm ? alarm.name + ' is out of range' : bad[0].name + ' is warming up');
    $('stSafeCard').className = 'stat' + (alarm ? ' alarm' : '');
    $('stockVal').textContent = money(units.reduce((a, u) => a + stockOf(u), 0));

    const open = tickets.filter(t => !t.handled).length;
    $('stAlerts').textContent = tickets.length;
    $('stAlertsNote').textContent = !tickets.length ? 'Quiet so far' : (open ? open + ' waiting on you' : 'All handled');
    $('stAlertsCard').className = 'stat' + (open ? ' alarm' : '');
    document.querySelectorAll('[data-count]').forEach(el => { el.hidden = !open; el.textContent = open; });

    const chip = $('sumText');
    chip.textContent = !bad.length ? 'All units safe' : (alarm ? alarm.name + ' needs attention' : bad[0].name + ' warming up');
    chip.className = 'chip' + (alarm ? ' alarm' : bad.length ? ' warn' : '');

    const ns = $('nsCard');
    ns.className = 'ns-card' + (alarm ? ' alarm' : '');
    $('nsTitle').textContent = alarm ? 'Night Shift sent an alert' : 'Night Shift is on';
    $('nsText').textContent = alarm ? alarm.name + ' at ' + fmt(alarm.temp) + DEG : 'Watching all ' + units.length + ' units';
  }

  // ---------- Alert tickets ----------
  function textedList() {
    const names = contacts.filter(c => c.sms || c.mail).map(c => c.name);
    return names.length ? names.join(', ') : 'nobody yet (add people in Alerts)';
  }

  function renderTickets() {
    const el = $('tickets');
    if (!tickets.length) { el.innerHTML = '<p class="empty-rail">No alerts. Night Shift is watching every unit.</p>'; return; }
    el.innerHTML = tickets.map(t => `
      <div class="ticket${t.shown ? ' noanim' : ''}">
        <div class="t-head"><span class="hot">ALERT #${t.no}</span><span>${t.time}</span></div>
        <p><b>${t.unit}</b></p>
        <div class="t-temp">${t.temp}${DEG}</div>
        <p>Safe: ${t.limit}</p>
        <p>Out of range since ${t.outStart}</p>
        <p>Peak temp: <b id="tk-peak-${t.no}">${t.peak}${DEG}</b></p>
        ${t.closed ? `<p>Back in range: ${t.backAt}</p>` : ''}
        <p>Time out of range: <b id="tk-dur-${t.no}">${t.outMins} min${t.closed ? ' total' : ' so far'}</b></p>
        ${t.handled ? '' : '<p>Door open or compressor down?</p>'}
        <p>Food at risk: about ${money(t.stock)}</p>
        ${t.inside ? `<p>Inside: ${esc(t.inside)}</p>` : ''}
        <p>Alerted: ${esc(t.sentTo)}</p>
        ${t.handled
          ? `<span class="stamp">HANDLED ${t.handled}</span>`
          : `<div class="t-actions"><button type="button" data-handle="${t.no}">Mark as handled</button></div>`}
      </div>`).join('');
    tickets.forEach(t => { t.shown = true; });
  }

  $('tickets').addEventListener('click', (e) => {
    const b = e.target.closest('[data-handle]'); if (!b) return;
    const t = tickets.find(x => String(x.no) === b.dataset.handle); if (!t) return;
    t.handled = nowLabel();
    const who = contacts[0] ? contacts[0].name : 'staff';
    const action = 'Walk-in door found propped open and closed.';
    const u = units.find(x => x.name === t.unit);
    if (u && u.incident) { u.incident.handled = t.handled; u.incident.handledBy = who; u.incident.action = action; }
    events.push({ type: 'fix', text: `${t.handled}: Alert #${t.no} handled by ${sentence(who)} ${action} Unit cooling back down.` });
    sim.phase = 'recovering';
    renderTickets(); renderLogs(); renderSummary();
  });

  // ---------- Out-of-range incidents (start, peak, duration) ----------
  function isOut(u) {
    const r = RULES[u.kind];
    return r.dir === 'max' ? u.temp > r.limit : u.temp < r.limit;
  }
  function worse(u, a, b) { return RULES[u.kind].dir === 'max' ? Math.max(a, b) : Math.min(a, b); }

  function trackIncident(u) {
    const out = isOut(u);
    if (out && !u.incident) {
      u.incident = { unitId: u.id, unit: u.name, kind: u.kind, start: nowLabel(), startMin: sim.minutes, peak: u.temp, mins: 1, alertNo: null };
    }
    const inc = u.incident;
    if (!inc) return;
    inc.peak = worse(u, inc.peak, u.temp);
    inc.mins = Math.max(1, sim.minutes - inc.startMin);
    const t = inc.alertNo ? tickets.find(x => x.no === inc.alertNo) : null;
    if (t) {
      t.peak = fmt(inc.peak); t.outMins = inc.mins;
      const pk = document.getElementById('tk-peak-' + t.no); if (pk) pk.textContent = t.peak + DEG;
      const du = document.getElementById('tk-dur-' + t.no); if (du) du.textContent = t.outMins + ' min so far';
    }
    if (!out) {
      inc.end = nowLabel();
      incidents.push(inc);
      events.push({ type: 'summary', inc: { ...inc, peak: fmt(inc.peak) } });
      if (t) { t.closed = true; t.backAt = inc.end; t.outMins = inc.mins; }
      u.incident = null;
      renderTickets(); renderLogs();
    }
  }

  function raiseAlert(u) {
    ticketNo++;
    const inc = u.incident;
    const t = {
      no: ticketNo, time: nowLabel(), unit: u.name, temp: fmt(u.temp),
      limit: RULES[u.kind].label.replace('Safe at ', ''),
      outStart: inc ? inc.start : nowLabel(), peak: fmt(inc ? inc.peak : u.temp), outMins: inc ? inc.mins : 1,
      stock: stockOf(u), inside: inv ? inv.insideSummary(u.name) : '', sentTo: textedList(), handled: null, closed: false
    };
    if (inc) { inc.alertNo = t.no; inc.alertTime = t.time; inc.sentTo = t.sentTo; }
    tickets.unshift(t);
    events.push({ type: 'alert', text: `${t.time}: ${u.name} reached ${t.temp}${DEG} (out of range since ${t.outStart}). Alert #${t.no} sent to ${sentence(t.sentTo)}` });
    renderTickets(); renderLogs();
    // BACKEND: the server sends the real text and email here, not the browser.
    showNotif(`${u.name} is at ${t.temp}${DEG} and rising. Safe is ${t.limit}. About ${money(t.stock)} of food at risk.`);
  }

  function showNotif(text) {
    $('notifText').textContent = text;
    $('notif').classList.add('show');
    clearTimeout(notifTimer);
    notifTimer = setTimeout(() => $('notif').classList.remove('show'), 7000);
  }
  $('notif').addEventListener('click', () => {
    $('notif').classList.remove('show');
    selectPage('overview');
    $('tickets').scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  // ---------- Simulation loop ----------
  function tick() {
    for (const u of units) {
      if (u.id === 'walkin' && sim.phase === 'failing') {
        u.temp = Math.min(49.6, u.temp + 0.42 + Math.random() * 0.18);
      } else if (u.id === 'walkin' && sim.phase === 'recovering') {
        u.temp -= 0.75;
        if (u.temp <= u.base + 0.2) {
          u.temp = u.base;
          events.push({ type: 'fix', text: `${simClock()}: Walk-in cooler settled back at ${fmt(u.base)}${DEG}.` });
          sim.phase = 'idle'; sim.active = false;
          renderLogs();
          $('simBtn').disabled = false;
        }
      } else {
        const noise = u.kind === 'hot' ? 0.9 : 0.3;
        u.temp += (u.base - u.temp) * 0.2 + (Math.random() - 0.5) * noise;
      }
      u.hist.push(u.temp); if (u.hist.length > 48) u.hist.shift();
      trackIncident(u);
      const s = status(u);
      if (s !== u.status) {
        u.status = s;
        if (s === 'alarm' && !u.alerted) { u.alerted = true; raiseAlert(u); }
        if (s === 'ok') u.alerted = false;
      }
      updateUnit(u);
    }
    if (sim.active) sim.minutes += 1;
    renderSummary(); updateClock();
  }

  $('simBtn').addEventListener('click', () => {
    const w = units.find(u => u.id === 'walkin');
    sim = { active: true, phase: 'failing', minutes: 0, startTemp: w.temp };
    $('simBtn').disabled = true;
    selectPage('overview');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    updateClock();
  });
  $('resetBtn').addEventListener('click', () => { $('notif').classList.remove('show'); init(); });

  // ---------- Logs ----------
  function seeded(seed) { return () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }; }

  function renderLogs() {
    const sel = $('logFilter');
    if (sel.options.length !== DEFS.length + 1) {
      const keep = sel.value;
      sel.innerHTML = '<option value="all">All units</option>' + DEFS.map(d => `<option value="${d.id}">${esc(d.name)}</option>`).join('');
      sel.value = DEFS.some(d => d.id === keep) ? keep : 'all';
    }
    const f = sel.value || 'all';
    const rnd = seeded(41);
    const limitOf = (kind) => RULES[kind].label.replace('Safe at ', '');
    const rows = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(); date.setDate(date.getDate() - d);
      const label = d === 0 ? 'Today' : date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      for (const u of DEFS) {
        const spread = u.kind === 'hot' ? 6 : 2.4;
        const a = u.base + (rnd() - 0.5) * spread, b = u.base + (rnd() - 0.5) * spread;
        if (f !== 'all' && f !== u.id) continue;
        let result = '<span class="ok">In range</span>';
        if (d === 0) {
          const live = units.find(x => x.id === u.id);
          const past = incidents.filter(i => i.unitId === u.id);
          if (live && live.incident) result = `<span class="bad">Out of range now, peak ${fmt(live.incident.peak)}${DEG}</span>`;
          else if (past.length) {
            const last = past[past.length - 1];
            result = `<span class="bad">Out of range ${last.mins} min, peak ${fmt(last.peak)}${DEG}</span>`;
          }
        }
        rows.push(`<tr><td>${label}</td><td>${u.name}</td><td class="num">${fmt(a)}${DEG}</td><td class="num">${fmt(b)}${DEG}</td><td>${result}</td></tr>`);
      }
    }
    $('logBody').innerHTML = rows.join('');
    $('events').innerHTML = events.slice().reverse().map(e => {
      if (e.type === 'summary') {
        const i = e.inc;
        return `<li class="summary">
          <b>Incident report: ${esc(i.unit)}${i.alertNo ? ' (Alert #' + i.alertNo + ')' : ''}</b>
          <span>Out of safe range: ${i.start} to ${i.end} (${i.mins} min total)</span>
          <span>Highest temperature: ${i.peak}${DEG} (safe: ${limitOf(i.kind)})</span>
          ${i.alertNo ? `<span>Alert sent ${i.alertTime} to ${esc(i.sentTo)}</span>` : ''}
          ${i.handled ? `<span>Handled ${i.handled} by ${esc(sentence(i.handledBy))} Corrective action: ${esc(i.action)}</span>` : ''}
        </li>`;
      }
      return `<li class="${e.type === 'fix' ? 'fix' : ''}">${esc(e.text)}</li>`;
    }).join('');
  }
  $('logFilter').addEventListener('change', renderLogs);
  $('printBtn').addEventListener('click', () => window.print());

  // ---------- Checklists ----------
  function renderLists() {
    const who = contacts[0] ? contacts[0].name : 'staff';
    $('lists').innerHTML = Object.entries(CHECKS).map(([name, items]) => {
      const done = items.filter((_, i) => checks[name + i]).length;
      const pct = Math.round(done / items.length * 100);
      return `<div class="card list"><h2>${name} checklist</h2><p class="prog">${done} of ${items.length} done</p><div class="bar"><i style="width:${pct}%"></i></div>` +
        items.map((txt, i) => {
          const c = checks[name + i];
          return `<button type="button" class="item ${c ? 'done' : ''}" data-k="${name + i}" aria-pressed="${!!c}"><span class="box"></span><span class="txt">${txt}${c ? `<span class="stamp-t">Done ${c} by ${esc(who)}</span>` : ''}</span></button>`;
        }).join('') + '</div>';
    }).join('');
    $('stChecks').textContent = Object.keys(checks).length + '/' + CHECK_TOTAL;
  }
  $('lists').addEventListener('click', (e) => {
    const b = e.target.closest('[data-k]'); if (!b) return;
    const k = b.dataset.k;
    if ((k === INV_OPEN_KEY || k === INV_CLOSE_KEY) && !checks[k]) { selectPage('inventory'); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    if (checks[k]) delete checks[k]; else checks[k] = realClock();
    renderLists();
    const again = document.querySelector(`[data-k="${k}"]`); if (again) again.focus();
  });

  // ---------- Alert contacts ----------
  function renderContacts() {
    const el = $('contacts');
    if (!contacts.length) { el.innerHTML = '<li><span>No one gets alerts yet. Add at least one person.</span></li>'; return; }
    el.innerHTML = contacts.map(c => {
      const ways = [c.sms && c.phone ? 'Text ' + c.phone : '', c.mail && c.email ? 'Email ' + c.email : ''].filter(Boolean).join(', ') || 'No alert method set';
      return `<li><div class="who"><span class="avatar">${esc(c.name.charAt(0).toUpperCase())}</span><div><b>${esc(c.name)}</b><small>${esc(c.role || 'Team')}</small><small>${esc(ways)}</small></div></div><button type="button" data-remove="${c.id}">Remove</button></li>`;
    }).join('');
  }
  $('contacts').addEventListener('click', (e) => {
    const b = e.target.closest('[data-remove]'); if (!b) return;
    contacts = contacts.filter(c => String(c.id) !== b.dataset.remove);
    saveContacts(); renderContacts(); renderLists();
  });
  $('contactForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.target;
    const fd = new FormData(form);
    const c = {
      id: Date.now(),
      name: String(fd.get('name') || '').trim(),
      role: String(fd.get('role') || '').trim(),
      phone: String(fd.get('phone') || '').trim(),
      email: String(fd.get('email') || '').trim(),
      sms: fd.get('sms') === 'on',
      mail: fd.get('mail') === 'on'
    };
    const msg = $('contactMsg');
    if (!c.name || (!c.phone && !c.email)) {
      msg.className = 'form-msg error';
      msg.textContent = 'Add a name and at least a mobile number or an email.';
      return;
    }
    contacts.push(c); saveContacts(); renderContacts(); renderLists();
    form.reset();
    msg.className = 'form-msg ok';
    msg.textContent = c.name + ' will get alerts.';
  });

  // ---------- Sensor setup ----------
  const KIND_LABEL = { cold: 'Cooler', freeze: 'Freezer', hot: 'Hot holding' };
  const KIND_BASE = { cold: 37.6, freeze: -2.5, hot: 149 };
  const cleanId = (v) => String(v || '').toUpperCase().replace(/[^0-9A-F]/g, '');

  function renderSensors() {
    $('sensorCount').textContent = DEFS.length + (DEFS.length === 1 ? ' sensor connected' : ' sensors connected');
    $('sensorList').innerHTML = DEFS.map(d => `
      <li>
        <div>
          <b>${esc(d.name)}</b>
          <small>${KIND_LABEL[d.kind]} &middot; <span class="sid">${esc(d.sensorId)}</span></small>
        </div>
        <span class="right">
          <span class="chip">Online</span>
          ${d.added ? `<button type="button" data-remove-sensor="${esc(d.id)}">Remove</button>` : ''}
        </span>
      </li>`).join('');
  }

  function refreshUnits() {
    buildUnits(); renderSummary(); renderLogs(); renderSensors();
  }

  $('sensorForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const sensorId = cleanId(fd.get('sensorId'));
    const name = String(fd.get('unitName') || '').trim();
    const kind = String(fd.get('kind') || 'cold');
    const msg = $('sensorMsg');
    const fail = (t) => { msg.className = 'form-msg error'; msg.textContent = t; };
    if (sensorId.length !== 16) return fail('The sensor ID has 16 letters and numbers. Check the label and try again.');
    if (DEFS.some(d => d.sensorId === sensorId)) return fail('That sensor is already connected.');
    if (!name) return fail('Give the unit a name, like "Walk-in cooler".');
    // BACKEND: confirm this sensor belongs to the customer's account before adding it.
    const def = { id: 'u' + Date.now(), sensorId, name, kind, base: KIND_BASE[kind], stock: kind === 'hot' ? 400 : 1500, added: true };
    DEFS.push(def);
    units.push(makeUnit(def));
    saveAdded();
    refreshUnits();
    e.target.reset();
    msg.className = 'form-msg ok';
    msg.textContent = name + ' is connected. You will see its readings on the Overview page.';
  });

  $('sensorList').addEventListener('click', (e) => {
    const b = e.target.closest('[data-remove-sensor]'); if (!b) return;
    const id = b.dataset.removeSensor;
    const i = DEFS.findIndex(d => d.id === id);
    if (i < 0) return;
    DEFS.splice(i, 1);
    units = units.filter(u => u.id !== id);
    saveAdded();
    refreshUnits();
  });

  // Scan the QR code on the sensor label (works in browsers with a built-in barcode reader)
  $('scanInput').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    const msg = $('sensorMsg');
    if (!file) return;
    if (!('BarcodeDetector' in window)) {
      msg.className = 'form-msg error';
      msg.textContent = "This browser can't read labels yet. Type the ID printed under the QR code instead.";
      return;
    }
    try {
      const bitmap = await createImageBitmap(file);
      const codes = await new window.BarcodeDetector({ formats: ['qr_code'] }).detect(bitmap);
      const text = codes.length ? codes[0].rawValue : '';
      const match = cleanId(text).match(/[0-9A-F]{16}/);
      if (!match) throw new Error('none');
      $('sensorIdInput').value = match[0];
      msg.className = 'form-msg ok';
      msg.textContent = 'Label read. Now name the unit.';
    } catch (err) {
      msg.className = 'form-msg error';
      msg.textContent = "Couldn't read that label. Try again closer up, or type the ID.";
    }
    e.target.value = '';
  });

  // ---------- Page navigation (sidebar + mobile tab bar) ----------
  function selectPage(name) {
    document.querySelectorAll('[data-page]').forEach(b => {
      if (b.dataset.page === name) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    Object.keys(PAGES).forEach(p => { $('page-' + p).hidden = p !== name; });
    $('pageTitle').textContent = PAGES[name][0];
    $('pageSub').textContent = PAGES[name][1];
  }
  document.querySelectorAll('[data-page]').forEach(b => b.addEventListener('click', () => {
    selectPage(b.dataset.page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }));

  selectPage('overview');
  init();
  inv = createInventory({
    $, esc, money,
    now: realClock,
    who: () => (contacts[0] ? contacts[0].name : 'Staff'),
    restaurant: CONFIG.demoRestaurant,
    unitNames: () => units.map(u => u.name),
    onCount: (type, t) => { checks[type === 'open' ? INV_OPEN_KEY : INV_CLOSE_KEY] = t; renderLists(); },
    onChange: () => renderSummary()
  });
  renderSummary();
  setInterval(tick, 900);
}

// Visitor counter and globe in the footer (same as every other page)
initVisitorCounter();