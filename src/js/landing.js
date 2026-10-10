import { CONFIG } from './config.js';
import { initThemeToggle } from './theme.js';
import { initMobileMenu } from './nav.js';
import { initVisitorCounter } from './counter.js';
import { getRef, captureRef } from './ref.js';
import { PRICING } from './pricing.js';
import { makeFlakes } from './effects.js';

initThemeToggle();
initMobileMenu();
initVisitorCounter();

makeFlakes();

document.getElementById('year').textContent = new Date().getFullYear();
document.querySelectorAll('[data-annual-months]').forEach(el => { el.textContent = PRICING.annualMonthsPaid; });

// Footer contact: email only unless a phone number is set in config.js
const contact = document.getElementById('contactLink');
if (contact) {
  const phoneNum = String(CONFIG.salesPhone || '').trim();
  if (phoneNum) {
    contact.textContent = 'Call ' + phoneNum;
    contact.href = 'tel:' + phoneNum.replace(/[^0-9+]/g, '');
  } else {
    contact.textContent = CONFIG.salesEmail;
    contact.href = 'mailto:' + CONFIG.salesEmail;
  }
}

// ---------- Live temperature in the hero card ----------
(function heroChart() {
  const tempEl = document.getElementById('heroTemp');
  const line = document.getElementById('heroLine');
  const area = document.getElementById('heroArea');
  if (!tempEl || !line || !area) return;
  const base = 37.2, lo = 30, hi = 46, W = 300, H = 70, N = 40;
  const hist = Array.from({ length: N }, () => base + (Math.random() - 0.5) * 1.2);
  let temp = base;
  const y = (t) => H - 4 - Math.max(0, Math.min(1, (t - lo) / (hi - lo))) * (H - 8);
  function draw() {
    const pts = hist.map((t, i) => (i * W / (N - 1)).toFixed(1) + ',' + y(t).toFixed(1));
    line.setAttribute('points', pts.join(' '));
    area.setAttribute('d', 'M0,' + H + ' L' + pts.join(' L') + ' L' + W + ',' + H + ' Z');
    tempEl.textContent = temp.toFixed(1);
  }
  draw();
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  setInterval(() => {
    temp += (base - temp) * 0.25 + (Math.random() - 0.5) * 0.35;
    hist.push(temp); hist.shift();
    draw();
  }, 1400);
})();

// ---------- Quote calculator ----------
const money = (n) => '$' + Math.round(n).toLocaleString('en-US');
const quote = { units: PRICING.defaultUnits, conn: 'ethernet', bill: 'monthly' };

function calcQuote() {
  const gateway = quote.conn === 'cellular' ? PRICING.gatewayCellular : PRICING.gatewayEthernet;
  const sensors = quote.units * PRICING.sensorWithProbe;
  const upfront = gateway + sensors + PRICING.setupActivation;
  const monthly = PRICING.baseMonthly + quote.units * PRICING.perUnitMonthly;
  const yearlyPlan = monthly * PRICING.annualMonthsPaid;
  const firstYear = upfront + (quote.bill === 'annual' ? yearlyPlan : monthly * 12);
  return { gateway, sensors, upfront, monthly, yearlyPlan, firstYear };
}

function renderQuote() {
  const q = calcQuote();
  const n = quote.units;
  const $ = (id) => document.getElementById(id);
  $('unitsOut').textContent = n;
  $('unitsMinus').disabled = n <= PRICING.minUnits;
  $('unitsPlus').disabled = n >= PRICING.maxUnits;
  $('qGatewayLabel').textContent = 'Gateway (' + (quote.conn === 'cellular' ? 'cellular' : 'internet cable') + ')';
  $('qGateway').textContent = money(q.gateway);
  $('qSensorsLabel').textContent = n + (n === 1 ? ' sensor' : ' sensors') + ' with food-grade probes';
  $('qSensors').textContent = money(q.sensors);
  $('qInstall').textContent = money(PRICING.setupActivation);
  $('qUpfront').textContent = money(q.upfront);
  $('qBase').textContent = money(PRICING.baseMonthly) + '/mo';
  $('qPerLabel').textContent = n + (n === 1 ? ' unit' : ' units') + ' monitored (' + money(PRICING.perUnitMonthly) + ' each)';
  $('qPer').textContent = money(n * PRICING.perUnitMonthly) + '/mo';
  if (quote.bill === 'annual') {
    $('qPlanTitle').textContent = 'Monitoring plan (yearly)';
    $('qPlanLabel').textContent = 'Per year, paid up front';
    $('qPlan').textContent = money(q.yearlyPlan);
  } else {
    $('qPlanTitle').textContent = 'Monitoring plan (monthly)';
    $('qPlanLabel').textContent = 'Per month';
    $('qPlan').textContent = money(q.monthly);
  }
  $('qYear').textContent = money(q.firstYear);
  $('quoteSummary').textContent = 'Your quote: ' + n + (n === 1 ? ' unit' : ' units') + ', ' +
    (quote.conn === 'cellular' ? 'cellular' : 'internet cable') + ' gateway, ' +
    money(q.upfront) + ' for equipment and setup, then ' +
    (quote.bill === 'annual' ? money(q.yearlyPlan) + ' per year' : money(q.monthly) + ' per month') + '.';
}

document.getElementById('unitsMinus').addEventListener('click', () => { quote.units = Math.max(PRICING.minUnits, quote.units - 1); renderQuote(); });
document.getElementById('unitsPlus').addEventListener('click', () => { quote.units = Math.min(PRICING.maxUnits, quote.units + 1); renderQuote(); });
document.querySelectorAll('[data-conn]').forEach(b => b.addEventListener('click', () => {
  quote.conn = b.dataset.conn;
  document.querySelectorAll('[data-conn]').forEach(x => x.setAttribute('aria-checked', String(x === b)));
  renderQuote();
}));
document.querySelectorAll('[data-bill]').forEach(b => b.addEventListener('click', () => {
  quote.bill = b.dataset.bill;
  document.querySelectorAll('[data-bill]').forEach(x => x.setAttribute('aria-checked', String(x === b)));
  renderQuote();
}));
renderQuote();

// ---------- Quote request form ----------
// Sends straight to the Night Shift server, which saves it and emails quote@nightshift.watch.
// No email app needed. If the server can't be reached, the visitor is shown the email address.
const form = document.getElementById('trial');
const msg = document.getElementById('trialMsg');
const submitBtn = form.querySelector('button[type="submit"]');
const apiBase = String(CONFIG.apiBaseUrl || '').replace(/\/+$/, '');
captureRef();
const refInput = form.querySelector('input[name="ref"]');
if (refInput && getRef()) refInput.value = getRef();

function showFallback(intro) {
  msg.className = 'form-msg error';
  msg.innerHTML = '';
  msg.append(intro + ' Please try again, or email us at ');
  const a = document.createElement('a');
  a.href = 'mailto:' + CONFIG.salesEmail;
  a.textContent = CONFIG.salesEmail;
  msg.append(a, '.');
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(form));
  const missing = ['name', 'restaurant', 'phone', 'email'].filter(k => !String(data[k] || '').trim());
  if (missing.length) {
    msg.className = 'form-msg error';
    msg.textContent = 'Fill in your name, restaurant, phone, and email so we can reach you.';
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(data.email).trim())) {
    msg.className = 'form-msg error';
    msg.textContent = 'That email address looks incomplete. Check it and try again.';
    return;
  }
  if (!apiBase) { showFallback('Online requests are not connected yet.'); return; }

  const q = calcQuote();
  const payload = {
    name: data.name, restaurant: data.restaurant, phone: data.phone, email: data.email,
    notes: data.notes || '', website: data.website || '',
    ref: String(data.ref || '').trim().toUpperCase(),
    quote: {
      units: quote.units,
      gateway: (quote.conn === 'cellular' ? 'Cellular' : 'Internet cable') + ' ' + money(q.gateway),
      sensors: money(q.sensors),
      setup: money(PRICING.setupActivation),
      upfront: money(q.upfront),
      monitoring: quote.bill === 'annual' ? money(q.yearlyPlan) + ' per year' : money(q.monthly) + ' per month',
      firstYear: money(q.firstYear)
    }
  };

  submitBtn.disabled = true;
  const label = submitBtn.textContent;
  submitBtn.textContent = 'Sending...';
  msg.className = 'form-msg'; msg.textContent = '';
  try {
    const res = await fetch(apiBase + '/api/quote', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok || !out.ok) throw new Error(out.error || 'send failed');
    form.reset();
    if (refInput && getRef()) refInput.value = getRef();
    msg.className = 'form-msg ok';
    msg.textContent = 'Got it! Your quote request is in. We will get back to you within one business day.';
  } catch (err) {
    showFallback('We could not send your request just now.');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = label;
  }
});