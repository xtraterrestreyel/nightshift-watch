// ColdCheck inventory: opening and closing counts, prep logging, yield tracking,
// on-hand value by cooler, printable reports, and CSV export.
// BACKEND: in demo mode everything is saved in this browser only.

const IKEY = 'coldcheck.inventory.v1';

function seedItems() {
  return [
    { id: 'wings', name: 'Chicken wings', location: 'Walk-in cooler', caseLabel: '40 lb case', caseCost: 118, portionLabel: 'orders (8 pc)', menuPrice: 12.99, supplier: 'Main distributor', yields: [47, 49, 48], cases: 6, portions: 12 },
    { id: 'mozz', name: 'Mozzarella, shredded', location: 'Walk-in cooler', caseLabel: '4 x 5 lb bags', caseCost: 72, portionLabel: 'pizza portions (8 oz)', menuPrice: null, supplier: 'Main distributor', yields: [38, 40, 39], cases: 3, portions: 18 },
    { id: 'dough', name: 'Pizza dough balls', location: 'Walk-in cooler', caseLabel: '48 dough balls', caseCost: 36, portionLabel: 'proofed dough balls', menuPrice: null, supplier: 'Local bakery', yields: [48, 47], cases: 4, portions: 20 },
    { id: 'romaine', name: 'Romaine', location: 'Walk-in cooler', caseLabel: '24 heads', caseCost: 38, portionLabel: 'salads', menuPrice: 8.99, supplier: 'Produce supplier', yields: [44, 46], cases: 2, portions: 10 },
    { id: 'pepperoni', name: 'Pepperoni', location: 'Pizza prep table', caseLabel: '2 x 12.5 lb', caseCost: 98, portionLabel: 'pizza portions (3 oz)', menuPrice: null, supplier: 'Main distributor', yields: [130, 128], cases: 1, portions: 40 },
    { id: 'ranch', name: 'Ranch dressing', location: 'Line reach-in', caseLabel: '4 x 1 gal', caseCost: 52, portionLabel: '2 oz cups', menuPrice: null, supplier: 'Main distributor', yields: [250], cases: 1, portions: 60 },
    { id: 'breast', name: 'Chicken breast', location: 'Walk-in freezer', caseLabel: '40 lb case', caseCost: 132, portionLabel: 'sandwich portions (6 oz)', menuPrice: 10.49, supplier: 'Main distributor', yields: [100, 102], cases: 3, portions: 0 },
    { id: 'fries', name: 'French fries', location: 'Walk-in freezer', caseLabel: '6 x 5 lb bags', caseCost: 44, portionLabel: 'baskets', menuPrice: 4.99, supplier: 'Main distributor', yields: [60, 58], cases: 5, portions: 0 },
    { id: 'keg', name: 'Draft beer', location: 'Bar cooler', caseLabel: '1/2 barrel keg', caseCost: 165, portionLabel: 'pints', menuPrice: 6, supplier: 'Beer distributor', yields: [124, 122], cases: 2, portions: 0 }
  ];
}

function seedState() {
  return {
    items: seedItems(),
    shift: { phase: 'idle', start: null, prep: [], deliveries: [], summary: null, openedAt: null, closedAt: null },
    streak: 11,
    lastCount: { type: 'Closing', at: 'Yesterday, 11:40 PM', by: 'Maria R.' }
  };
}

export function createInventory(ctx) {
  const { $, esc, money, now, who, onCount, onChange } = ctx;
  let state = load() || seedState();
  let counting = null; // 'open' | 'close' | null
  let addOpen = false;

  function load() {
    try {
      const v = JSON.parse(localStorage.getItem(IKEY));
      if (v && Array.isArray(v.items)) return v;
    } catch (e) { /* ignore */ }
    return null;
  }
  function save() {
    try { localStorage.setItem(IKEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
    if (onChange) onChange();
  }

  // ---------- Math ----------
  const avgYield = (it) => it.yields.length ? it.yields.reduce((a, b) => a + b, 0) / it.yields.length : 0;
  const portionCost = (it) => { const y = avgYield(it); return y ? it.caseCost / y : 0; };
  const valueOf = (it) => it.cases * it.caseCost + it.portions * portionCost(it);
  const num = (n) => Math.round(n * 10) / 10;
  const money2 = (n) => '$' + n.toFixed(2);
  const round = (n) => Math.round(n);

  function valueIn(location) {
    return state.items.filter(i => i.location === location).reduce((a, i) => a + valueOf(i), 0);
  }
  function totalValue() { return state.items.reduce((a, i) => a + valueOf(i), 0); }
  function insideSummary(location) {
    const list = state.items.filter(i => i.location === location && (i.cases > 0 || i.portions > 0))
      .sort((a, b) => valueOf(b) - valueOf(a));
    const parts = list.slice(0, 2).map(i => {
      const bits = [];
      if (i.cases) bits.push(i.cases + ' cs');
      if (i.portions) bits.push(i.portions + ' ' + i.portionLabel.split(' (')[0]);
      return i.name + ' (' + bits.join(', ') + ')';
    });
    if (list.length > 2) parts.push((list.length - 2) + ' more item' + (list.length - 2 === 1 ? '' : 's'));
    return parts.join(', ');
  }
  function locations() {
    const seen = [];
    state.items.forEach(i => { if (!seen.includes(i.location)) seen.push(i.location); });
    return seen;
  }

  // ---------- Rendering ----------
  function render() {
    const el = $('invRoot');
    if (!el) return;
    const sh = state.shift;
    const statusText = counting === 'open' ? 'Opening count in progress'
      : counting === 'close' ? 'Closing count in progress'
      : sh.phase === 'idle' ? 'Not started'
      : sh.phase === 'open' ? 'Open since ' + sh.openedAt
      : 'Closed at ' + sh.closedAt;

    el.innerHTML = `
      <div class="stats">
        <div class="stat feature"><span>Inventory on hand</span><strong>${money(round(totalValue()))}</strong><small>${state.items.length} items across ${locations().length} units</small></div>
        <div class="stat"><span>Count streak</span><strong>${state.streak} days</strong><small>Closing counts in a row</small></div>
        <div class="stat"><span>Last count</span><strong class="sm">${esc(state.lastCount.type)}</strong><small>${esc(state.lastCount.at)} by ${esc(state.lastCount.by)}</small></div>
        <div class="stat"><span>Today's shift</span><strong class="sm">${esc(statusText)}</strong><small>${sh.prep.length} prep and ${sh.deliveries.length} delivery entries</small></div>
      </div>
      ${counting ? countForm() : shiftPanel()}
      ${onHandPanel()}
      ${addOpen ? addForm() : ''}
    `;
  }

  function shiftPanel() {
    const sh = state.shift;
    if (sh.phase === 'idle') {
      return `<section class="card">
        <div class="card-head"><h2>Start of shift</h2><span class="chip">Step 1 of 3</span></div>
        <p class="inv-help">Count what's on hand before service. Last night's closing numbers are already filled in, so you only change what's different.</p>
        <button class="btn-ice" type="button" data-inv="start-open">Start opening count</button>
      </section>`;
    }
    if (sh.phase === 'open') {
      const opts = state.items.map(i => `<option value="${i.id}">${esc(i.name)} (${esc(i.location)})</option>`).join('');
      const logRows = [
        ...sh.prep.map(p => `<li><b>${esc(p.time)}</b> Prep: ${p.cases} cs ${esc(nameOf(p.id))} made ${p.portions} ${esc(labelOf(p.id))}${p.cases ? ` <span class="muted">(${num(p.portions / p.cases)} per case)</span>` : ''}</li>`),
        ...sh.deliveries.map(d => `<li><b>${esc(d.time)}</b> Delivery: ${d.cases} cs ${esc(nameOf(d.id))}</li>`)
      ].join('');
      return `<section class="card">
        <div class="card-head"><h2>During the shift</h2><span class="chip">Step 2 of 3</span></div>
        <p class="inv-help">Log prep and deliveries as they happen. Each prep entry also teaches ColdCheck how many servings you get from a case.</p>
        <div class="inv-forms">
          <form class="inv-mini" data-form="prep">
            <h3>Log prep</h3>
            <label class="field"><span>Item</span><select name="id" class="select">${opts}</select></label>
            <div class="inv-row">
              <label class="field"><span>Cases used</span><input name="cases" type="number" min="0" step="1" value="1" inputmode="numeric"></label>
              <label class="field"><span>Servings made</span><input name="portions" type="number" min="0" step="1" value="" inputmode="numeric" placeholder="48"></label>
            </div>
            <button class="btn-quiet" type="submit">Save prep</button>
          </form>
          <form class="inv-mini" data-form="delivery">
            <h3>Log delivery</h3>
            <label class="field"><span>Item</span><select name="id" class="select">${opts}</select></label>
            <label class="field"><span>Cases received</span><input name="cases" type="number" min="1" step="1" value="1" inputmode="numeric"></label>
            <button class="btn-quiet" type="submit">Save delivery</button>
          </form>
        </div>
        ${logRows ? `<ul class="inv-log">${logRows}</ul>` : '<p class="muted">No prep or deliveries logged yet this shift.</p>'}
        <div class="inv-actions"><button class="btn-ice" type="button" data-inv="start-close">Start closing count</button></div>
      </section>`;
    }
    // closed
    const rows = sh.summary.map(r => `<tr${r.flag ? ' class="flag"' : ''}>
        <td>${esc(r.name)}</td><td class="num">${r.startCases} cs / ${r.startPortions}</td>
        <td class="num">${r.prepCases ? '-' + r.prepCases + ' cs / +' + r.made : '0'}</td>
        <td class="num">${r.delivered ? '+' + r.delivered + ' cs' : '0'}</td>
        <td class="num">${r.expectedCases} cs</td><td class="num">${r.countedCases} cs / ${r.countedPortions}</td>
        <td class="num">${r.used}</td>
        <td>${r.flag ? '<span class="bad">' + esc(r.flag) + '</span>' : '<span class="ok">Matches</span>'}</td></tr>`).join('');
    const flags = sh.summary.filter(r => r.flag).length;
    return `<section class="card">
      <div class="card-head"><h2>Shift summary</h2><span class="chip${flags ? ' warn' : ''}">${flags ? flags + ' item' + (flags === 1 ? '' : 's') + ' to review' : 'All counts match'}</span></div>
      <p class="inv-help">Opened ${esc(sh.openedAt)}, closed ${esc(sh.closedAt)}. Servings used or sold = starting servings + servings made - closing count.</p>
      <div class="table-scroll"><table class="inv-table">
        <thead><tr><th>Item</th><th>Start (cases / servings)</th><th>Prepped</th><th>Delivered</th><th>Expected cases</th><th>Counted (cases / servings)</th><th>Servings used or sold</th><th>Check</th></tr></thead>
        <tbody>${rows}</tbody></table></div>
      <div class="inv-actions"><button class="btn-quiet" type="button" data-inv="new-shift">Start the next shift</button></div>
    </section>`;
  }

  function countForm() {
    const isClose = counting === 'close';
    const sh = state.shift;
    const groups = locations().map(loc => {
      const rows = state.items.filter(i => i.location === loc).map(i => {
        let hint = '';
        if (isClose) {
          const st = sh.start[i.id] || { cases: i.cases, portions: i.portions };
          const prepC = sh.prep.filter(p => p.id === i.id).reduce((a, p) => a + p.cases, 0);
          const made = sh.prep.filter(p => p.id === i.id).reduce((a, p) => a + p.portions, 0);
          const del = sh.deliveries.filter(d => d.id === i.id).reduce((a, d) => a + d.cases, 0);
          hint = `Expected: ${st.cases - prepC + del} cs, up to ${st.portions + made} servings before sales`;
        }
        return `<tr>
          <td><b>${esc(i.name)}</b><small>${esc(i.caseLabel)}${hint ? ' &middot; ' + hint : ''}</small></td>
          <td><input class="cnt" type="number" min="0" step="1" inputmode="numeric" data-id="${i.id}" data-f="cases" value="${i.cases}" aria-label="${esc(i.name)} cases"></td>
          <td><input class="cnt" type="number" min="0" step="1" inputmode="numeric" data-id="${i.id}" data-f="portions" value="${i.portions}" aria-label="${esc(i.name)} ${esc(i.portionLabel)}"><small>${esc(i.portionLabel)}</small></td>
        </tr>`;
      }).join('');
      return `<h3 class="inv-loc">${esc(loc)}</h3>
        <div class="table-scroll"><table class="inv-table count"><thead><tr><th>Item</th><th>Full cases</th><th>Prepped servings</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    }).join('');
    return `<section class="card">
      <div class="card-head"><h2>${isClose ? 'Closing count' : 'Opening count'}</h2><span class="chip brand">${isClose ? 'Step 3 of 3' : 'Step 1 of 3'}</span></div>
      <p class="inv-help">${isClose ? "Numbers are pre-filled with what's expected. Change anything that's different, then save." : "Numbers are pre-filled from the last count. Change anything that's different, then save."}</p>
      ${groups}
      <div class="inv-actions">
        <button class="btn-ice" type="button" data-inv="${isClose ? 'save-close' : 'save-open'}">Save ${isClose ? 'closing' : 'opening'} count</button>
        <button class="btn-quiet" type="button" data-inv="cancel-count">Cancel</button>
      </div>
    </section>`;
  }

  function onHandPanel() {
    const blocks = locations().map(loc => {
      const rows = state.items.filter(i => i.location === loc).map(i => {
        const y = avgYield(i), pc = portionCost(i);
        const fc = i.menuPrice ? Math.round(pc / i.menuPrice * 100) + '%' : '';
        return `<tr>
          <td><b>${esc(i.name)}</b><small>${esc(i.caseLabel)} &middot; ${esc(i.supplier || '')}</small></td>
          <td class="num">${i.cases} cs${i.portions ? ' + ' + i.portions : ''}</td>
          <td class="num">${y ? num(y) + ' ' + esc(i.portionLabel.split(' (')[0]) : 'Not tracked yet'}</td>
          <td class="num">${pc ? money2(pc) : ''}</td>
          <td class="num">${i.menuPrice ? money2(i.menuPrice) : ''}</td>
          <td class="num">${fc}</td>
          <td class="num">${money(round(valueOf(i)))}</td></tr>`;
      }).join('');
      return `<div class="inv-block">
        <div class="inv-loc-head"><h3 class="inv-loc">${esc(loc)}</h3><span>${money(round(valueIn(loc)))}</span></div>
        <div class="table-scroll"><table class="inv-table">
          <thead><tr><th>Item</th><th>On hand</th><th>Avg. servings per case</th><th>Cost per serving</th><th>Menu price</th><th>Food cost</th><th>Value</th></tr></thead>
          <tbody>${rows}</tbody></table></div></div>`;
    }).join('');
    return `<section class="card">
      <div class="card-head"><h2>On hand by unit</h2>
        <div class="inv-tools">
          <button class="btn-quiet" type="button" data-inv="print-sheet">Print count sheet</button>
          <button class="btn-quiet" type="button" data-inv="print-value">Print value report</button>
          <button class="btn-quiet" type="button" data-inv="export">Export to Excel (CSV)</button>
          <button class="btn-ice" type="button" data-inv="add">Add item</button>
        </div>
      </div>
      ${blocks}
      <p class="log-note">If a unit fails, its alert shows these items and their value. <button class="linkish" type="button" data-inv="reset">Reset inventory demo</button></p>
    </section>`;
  }

  function addForm() {
    const locOpts = ctx.unitNames().map(n => `<option>${esc(n)}</option>`).join('');
    return `<form class="card" data-form="add" novalidate>
      <div class="card-head"><h2>Add an item</h2></div>
      <div class="inv-grid">
        <label class="field"><span>Item name</span><input name="name" required placeholder="Chicken tenders"></label>
        <label class="field"><span>Stored in</span><select name="location" class="select">${locOpts}</select></label>
        <label class="field"><span>How it comes (case size)</span><input name="caseLabel" placeholder="4 x 5 lb bags"></label>
        <label class="field"><span>Cost per case ($)</span><input name="caseCost" type="number" min="0" step="0.01" placeholder="89.00"></label>
        <label class="field"><span>Serving name</span><input name="portionLabel" placeholder="orders (5 pc)"></label>
        <label class="field"><span>Servings per case (best guess)</span><input name="yield" type="number" min="0" step="1" placeholder="40"></label>
        <label class="field"><span>Menu price per serving ($, optional)</span><input name="menuPrice" type="number" min="0" step="0.01" placeholder="10.99"></label>
        <label class="field"><span>Supplier (optional)</span><input name="supplier" placeholder="Main distributor"></label>
        <label class="field"><span>Full cases on hand</span><input name="cases" type="number" min="0" step="1" value="0"></label>
      </div>
      <div class="inv-actions"><button class="btn-ice" type="submit">Save item</button><button class="btn-quiet" type="button" data-inv="add-cancel">Cancel</button></div>
      <p class="form-msg" id="invAddMsg" role="status"></p>
    </form>`;
  }

  const nameOf = (id) => (state.items.find(i => i.id === id) || {}).name || id;
  const labelOf = (id) => (state.items.find(i => i.id === id) || {}).portionLabel || 'servings';

  // ---------- Actions ----------
  function readCounts() {
    const vals = {};
    document.querySelectorAll('#invRoot input.cnt').forEach(inp => {
      const id = inp.dataset.id; vals[id] = vals[id] || {};
      vals[id][inp.dataset.f] = Math.max(0, parseInt(inp.value, 10) || 0);
    });
    return vals;
  }

  function saveOpen() {
    const vals = readCounts();
    const start = {};
    state.items.forEach(i => {
      if (vals[i.id]) { i.cases = vals[i.id].cases; i.portions = vals[i.id].portions; }
      start[i.id] = { cases: i.cases, portions: i.portions };
    });
    const t = now();
    state.shift = { phase: 'open', start, prep: [], deliveries: [], summary: null, openedAt: t, closedAt: null };
    state.lastCount = { type: 'Opening', at: 'Today, ' + t, by: who() };
    counting = null; save(); render();
    if (onCount) onCount('open', t);
  }

  function saveClose() {
    const vals = readCounts();
    const sh = state.shift;
    const summary = state.items.map(i => {
      const st = sh.start[i.id] || { cases: 0, portions: 0 };
      const prepC = sh.prep.filter(p => p.id === i.id).reduce((a, p) => a + p.cases, 0);
      const made = sh.prep.filter(p => p.id === i.id).reduce((a, p) => a + p.portions, 0);
      const del = sh.deliveries.filter(d => d.id === i.id).reduce((a, d) => a + d.cases, 0);
      const expectedCases = st.cases - prepC + del;
      const c = vals[i.id] || { cases: i.cases, portions: i.portions };
      const used = st.portions + made - c.portions;
      let flag = '';
      if (c.cases < expectedCases) flag = (expectedCases - c.cases) + ' cs missing';
      else if (c.cases > expectedCases) flag = (c.cases - expectedCases) + ' cs more than expected';
      else if (used < 0) flag = 'Servings count higher than expected';
      i.cases = c.cases; i.portions = c.portions;
      return { name: i.name, startCases: st.cases, startPortions: st.portions, prepCases: prepC, made, delivered: del,
        expectedCases, countedCases: c.cases, countedPortions: c.portions, used: Math.max(0, used), flag };
    });
    const t = now();
    state.shift.summary = summary; state.shift.phase = 'closed'; state.shift.closedAt = t;
    state.streak += 1;
    state.lastCount = { type: 'Closing', at: 'Today, ' + t, by: who() };
    counting = null; save(); render();
    if (onCount) onCount('close', t);
  }

  function logPrep(form) {
    const fd = new FormData(form);
    const id = fd.get('id');
    const cases = Math.max(0, parseInt(fd.get('cases'), 10) || 0);
    const portions = Math.max(0, parseInt(fd.get('portions'), 10) || 0);
    if (!portions && !cases) return;
    const it = state.items.find(i => i.id === id); if (!it) return;
    it.cases = Math.max(0, it.cases - cases);
    it.portions += portions;
    if (cases > 0 && portions > 0) it.yields.push(Math.round(portions / cases));
    if (it.yields.length > 30) it.yields.shift();
    state.shift.prep.push({ id, cases, portions, time: now() });
    save(); render();
  }

  function logDelivery(form) {
    const fd = new FormData(form);
    const id = fd.get('id');
    const cases = Math.max(0, parseInt(fd.get('cases'), 10) || 0);
    if (!cases) return;
    const it = state.items.find(i => i.id === id); if (!it) return;
    it.cases += cases;
    state.shift.deliveries.push({ id, cases, time: now() });
    save(); render();
  }

  function addItem(form) {
    const fd = new FormData(form);
    const name = String(fd.get('name') || '').trim();
    const msg = document.getElementById('invAddMsg');
    if (!name) { msg.className = 'form-msg error'; msg.textContent = 'Give the item a name.'; return; }
    const y = parseInt(fd.get('yield'), 10) || 0;
    const mp = parseFloat(fd.get('menuPrice'));
    state.items.push({
      id: 'i' + Date.now(), name,
      location: String(fd.get('location') || 'Walk-in cooler'),
      caseLabel: String(fd.get('caseLabel') || 'case').trim() || 'case',
      caseCost: parseFloat(fd.get('caseCost')) || 0,
      portionLabel: String(fd.get('portionLabel') || 'servings').trim() || 'servings',
      menuPrice: isNaN(mp) ? null : mp,
      supplier: String(fd.get('supplier') || '').trim(),
      yields: y ? [y] : [],
      cases: Math.max(0, parseInt(fd.get('cases'), 10) || 0), portions: 0
    });
    addOpen = false; save(); render();
  }

  // ---------- Reports ----------
  function printReport(kind) {
    const rep = $('invReport');
    const date = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    let html = `<h1>${kind === 'sheet' ? 'Inventory count sheet' : 'Inventory value report'}</h1><p>${esc(ctx.restaurant)} &middot; ${date}</p>`;
    locations().forEach(loc => {
      const items = state.items.filter(i => i.location === loc);
      if (kind === 'sheet') {
        html += `<h2>${esc(loc)}</h2><table><thead><tr><th>Item</th><th>Case size</th><th>Last count</th><th>Full cases</th><th>Prepped servings</th><th>Initials</th></tr></thead><tbody>` +
          items.map(i => `<tr><td>${esc(i.name)}</td><td>${esc(i.caseLabel)}</td><td>${i.cases} cs / ${i.portions}</td><td></td><td></td><td></td></tr>`).join('') + '</tbody></table>';
      } else {
        html += `<h2>${esc(loc)}: ${money(round(valueIn(loc)))}</h2><table><thead><tr><th>Item</th><th>Supplier</th><th>Cost per case</th><th>On hand</th><th>Cost per serving</th><th>Value</th></tr></thead><tbody>` +
          items.map(i => `<tr><td>${esc(i.name)}</td><td>${esc(i.supplier || '')}</td><td>${money2(i.caseCost)}</td><td>${i.cases} cs + ${i.portions}</td><td>${portionCost(i) ? money2(portionCost(i)) : ''}</td><td>${money(round(valueOf(i)))}</td></tr>`).join('') + '</tbody></table>';
      }
    });
    if (kind !== 'sheet') html += `<p class="total">Total inventory value: ${money(round(totalValue()))}</p>`;
    rep.innerHTML = html;
    document.body.classList.add('print-inv');
    const done = () => { document.body.classList.remove('print-inv'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    window.print();
    setTimeout(done, 1500);
  }

  function exportCsv() {
    const head = ['Item', 'Stored in', 'Case size', 'Supplier', 'Cost per case', 'Full cases', 'Prepped servings', 'Serving', 'Avg servings per case', 'Cost per serving', 'Menu price', 'Food cost %', 'Value'];
    const q = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const rows = state.items.map(i => {
      const pc = portionCost(i);
      return [i.name, i.location, i.caseLabel, i.supplier || '', i.caseCost.toFixed(2), i.cases, i.portions, i.portionLabel,
        avgYield(i) ? num(avgYield(i)) : '', pc ? pc.toFixed(2) : '', i.menuPrice != null ? i.menuPrice.toFixed(2) : '',
        i.menuPrice && pc ? Math.round(pc / i.menuPrice * 100) : '', valueOf(i).toFixed(2)].map(q).join(',');
    });
    const blob = new Blob([[head.map(q).join(','), ...rows].join('\r\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'coldcheck-inventory-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // ---------- Events ----------
  function bind() {
    const root = $('invRoot');
    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-inv]'); if (!b) return;
      const a = b.dataset.inv;
      if (a === 'start-open') { counting = 'open'; render(); }
      else if (a === 'start-close') { counting = 'close'; render(); }
      else if (a === 'cancel-count') { counting = null; render(); }
      else if (a === 'save-open') saveOpen();
      else if (a === 'save-close') saveClose();
      else if (a === 'new-shift') { state.shift = { phase: 'idle', start: null, prep: [], deliveries: [], summary: null, openedAt: null, closedAt: null }; save(); render(); }
      else if (a === 'add') { addOpen = true; render(); const f = root.querySelector('[data-form="add"] input'); if (f) f.focus(); }
      else if (a === 'add-cancel') { addOpen = false; render(); }
      else if (a === 'print-sheet') printReport('sheet');
      else if (a === 'print-value') printReport('value');
      else if (a === 'export') exportCsv();
      else if (a === 'reset') { state = seedState(); counting = null; addOpen = false; save(); render(); }
      if (a === 'start-open' || a === 'start-close') root.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    root.addEventListener('submit', (e) => {
      const f = e.target.closest('[data-form]'); if (!f) return;
      e.preventDefault();
      if (f.dataset.form === 'prep') logPrep(f);
      else if (f.dataset.form === 'delivery') logDelivery(f);
      else if (f.dataset.form === 'add') addItem(f);
    });
  }

  bind();
  render();

  return {
    render,
    valueIn,
    insideSummary,
    totalValue
  };
}