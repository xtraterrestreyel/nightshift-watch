import { CONFIG } from './config.js';
import { initThemeToggle } from './theme.js';
import { PRICING } from './pricing.js';
import { makeFlakes } from './effects.js';

initThemeToggle();

makeFlakes();

document.getElementById('year').textContent = new Date().getFullYear();
document.querySelectorAll('[data-annual-months]').forEach(el => { el.textContent = PRICING.annualMonthsPaid; });

const phone = document.getElementById('salesPhone');
phone.textContent = CONFIG.salesPhone;
phone.href = 'tel:' + CONFIG.salesPhone.replace(/[^0-9+]/g, '');

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
// BACKEND: right now this opens an email to CONFIG.salesEmail.
// Later, send it to your database or CRM instead.
const form = document.getElementById('trial');
const msg = document.getElementById('trialMsg');

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(form));
  const missing = ['name', 'restaurant', 'phone', 'email'].filter(k => !String(data[k] || '').trim());
  if (missing.length) {
    msg.className = 'form-msg error';
    msg.textContent = 'Fill in your name, restaurant, phone, and email so we can reach you.';
    return;
  }
  const q = calcQuote();
  const subject = 'ColdCheck quote request: ' + data.restaurant;
  const body = [
    'Name: ' + data.name,
    'Restaurant: ' + data.restaurant,
    'Phone: ' + data.phone,
    'Email: ' + data.email,
    'Notes: ' + (data.notes || 'none'),
    '',
    'QUOTE',
    'Units: ' + quote.units,
    'Gateway: ' + (quote.conn === 'cellular' ? 'Cellular' : 'Internet cable') + ' ' + money(q.gateway),
    'Sensors: ' + money(q.sensors),
    'Setup and activation: ' + money(PRICING.setupActivation),
    'Equipment and setup total: ' + money(q.upfront),
    'Monitoring: ' + (quote.bill === 'annual' ? money(q.yearlyPlan) + ' per year' : money(q.monthly) + ' per month'),
    'First-year total: ' + money(q.firstYear)
  ].join('\n');
  window.location.href = 'mailto:' + CONFIG.salesEmail +
    '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
  msg.className = 'form-msg ok';
  msg.textContent = 'Your email app should open with your quote filled in. Hit send and we will call you within one business day.';
});