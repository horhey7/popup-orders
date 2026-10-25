(() => {
'use strict';

const KEY = 'popup-orders-data-v1';
const PAYMENTS = ['Cash', 'Card', 'MBWay'];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const money = n => '$' + (Math.round(n * 100) / 100).toFixed(2);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

function defaults() {
  const ev = { id: uid(), name: 'My first pop-up', date: today() };
  return {
    events: [ev],
    currentEventId: ev.id,
    items: [
      { id: uid(), name: 'Item 1', price: 10 },
      { id: uid(), name: 'Item 2', price: 15 },
    ],
    orders: [],
  };
}

let state;
try { state = JSON.parse(localStorage.getItem(KEY)) || defaults(); } catch { state = defaults(); }
const save = () => localStorage.setItem(KEY, JSON.stringify(state));

let view = 'orders';
let filter = 'all';
let draft = null; // order being created/edited

const currentEvent = () => state.events.find(e => e.id === state.currentEventId) || state.events[0];
const eventOrders = () => state.orders.filter(o => o.eventId === currentEvent()?.id);
const nextNumber = () => Math.max(0, ...eventOrders().map(o => o.number)) + 1;
function fmtDuration(ms) {
  const m = Math.floor(ms / 60000);
  if (m < 1) return '<1 min';
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
const setFulfilled = (o, on) => { o.fulfilled = on; o.fulfilledAt = on ? Date.now() : null; };
const orderTotal = lines => lines.reduce((s, l) => s + l.price * l.qty, 0);

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('show'), 1800);
}

function newDraft() {
  return { id: null, customer: '', payment: 'Cash', paid: true, fulfilled: false, note: '', qty: {}, custom: [] };
}

function draftFromOrder(o) {
  const d = { id: o.id, customer: o.customer, payment: o.payment, paid: o.paid, fulfilled: o.fulfilled, note: o.note, qty: {}, custom: [] };
  for (const l of o.lines) {
    if (l.itemId && state.items.some(i => i.id === l.itemId)) d.qty[l.itemId] = l.qty;
    else d.custom.push({ name: l.name, price: l.price, qty: l.qty });
  }
  return d;
}

function draftLines() {
  const lines = [];
  for (const it of state.items) {
    const q = draft.qty[it.id] || 0;
    if (q > 0) lines.push({ itemId: it.id, name: it.name, price: it.price, qty: q });
  }
  for (const c of draft.custom) if (c.qty > 0) lines.push({ itemId: null, name: c.name, price: c.price, qty: c.qty });
  return lines;
}

/* ---------- views ---------- */

function eventPicker() {
  return `<select data-change="event">${state.events.map(e =>
    `<option value="${e.id}" ${e.id === state.currentEventId ? 'selected' : ''}>${esc(e.name)} · ${esc(e.date)}</option>`).join('')}</select>`;
}

function renderOrders() {
  const all = eventOrders().slice().sort((a, b) => b.number - a.number);
  const f = {
    all: () => true,
    todo: o => !o.fulfilled,
    unpaid: o => !o.paid,
    done: o => o.fulfilled && o.paid,
  }[filter];
  const list = all.filter(f);
  const count = k => all.filter({ all: () => true, todo: o => !o.fulfilled, unpaid: o => !o.paid, done: o => o.fulfilled && o.paid }[k]).length;
  const chip = (k, label) => `<button class="chip ${filter === k ? 'on' : ''}" data-action="filter" data-k="${k}">${label} (${count(k)})</button>`;

  return `<h1>Orders</h1>${eventPicker()}
    <div class="chips" style="margin-top:10px">${chip('all', 'All')}${chip('todo', 'To fulfill')}${chip('unpaid', 'Unpaid')}${chip('done', 'Done')}</div>
    ${list.length ? list.map(orderCard).join('') :
      `<div class="empty"><div class="ico">🧾</div>${all.length ? 'No orders match this filter.' : 'No orders yet.<br>Tap the + button to take your first one.'}</div>`}`;
}

function orderCard(o) {
  const time = new Date(o.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return `<div class="card">
    <div class="order-head" data-action="edit" data-id="${o.id}">
      <div class="grow">
        <div><span class="num">#${o.number}</span><b>${esc(o.customer) || '<span class="muted">Walk-up</span>'}</b></div>
        <div class="muted">${o.lines.map(l => `${l.qty}× ${esc(l.name)}`).join(', ')}</div>
        ${o.note ? `<div class="muted">“${esc(o.note)}”</div>` : ''}
      </div>
      <div style="text-align:right"><div class="big">${money(o.total)}</div><div class="muted">${time}</div></div>
    </div>
    <div class="row" style="margin-top:10px;flex-wrap:wrap">
      <span class="badge ${o.paid ? 'ok' : 'bad'}">${o.paid ? '● Paid · ' + esc(o.payment) : '● Unpaid'}</span>
      <span class="badge ${o.fulfilled ? 'ok' : 'warn'}">${o.fulfilled ? '● Fulfilled' : '● To fulfill'}</span>
      ${o.fulfilled && o.fulfilledAt ? `<span class="badge ok">⏱ ${fmtDuration(o.fulfilledAt - o.createdAt)}</span>` : ''}
      ${!o.fulfilled ? `<span class="badge warn">⏱ <span class="wait" data-since="${o.createdAt}">${fmtDuration(Date.now() - o.createdAt)}</span></span>` : ''}
    </div>
    <div class="actions">
      <button class="btn small ${o.paid ? 'ghost' : 'good'}" data-action="togglePaid" data-id="${o.id}">${o.paid ? 'Mark unpaid' : 'Mark paid'}</button>
      <button class="btn small ${o.fulfilled ? 'ghost' : 'good'}" data-action="toggleFulfilled" data-id="${o.id}">${o.fulfilled ? 'Undo fulfilled' : 'Mark fulfilled'}</button>
    </div>
  </div>`;
}

function renderNew() {
  if (!draft) draft = newDraft();
  const editing = !!draft.id;
  const lines = draftLines();
  const total = orderTotal(lines);
  const row = (id, name, price, q, custom) => `<div class="item">
      <div class="grow"><b>${esc(name)}</b><div class="muted">${money(price)}</div></div>
      <div class="qty">
        <button data-action="dec" data-id="${id}" ${custom ? 'data-custom="1"' : ''}>−</button>
        <b>${q}</b>
        <button class="plus" data-action="inc" data-id="${id}" ${custom ? 'data-custom="1"' : ''}>＋</button>
      </div></div>`;

  return `<h1>${editing ? 'Edit order' : 'New order'}</h1>
    <div class="muted" style="margin:-8px 2px 12px">${esc(currentEvent().name)} · next is #${nextNumber()}</div>
    <div class="card">
      ${state.items.map(i => row(i.id, i.name, i.price, draft.qty[i.id] || 0, false)).join('') || '<div class="muted">Add menu items in Setup.</div>'}
      ${draft.custom.map((c, idx) => row(idx, c.name + ' (custom)', c.price, c.qty, true)).join('')}
      <div style="margin-top:8px"><button class="btn small ghost" data-action="addCustom">+ Custom item</button></div>
    </div>
    <div class="card">
      <label style="margin-top:0">Customer name (optional)</label>
      <input data-input="customer" value="${esc(draft.customer)}" placeholder="e.g. Sam" autocapitalize="words">
      <label>Payment</label>
      <div class="chips">${PAYMENTS.map(p => `<button class="chip ${draft.payment === p ? 'on' : ''}" data-action="pay" data-k="${p}">${p}</button>`).join('')}</div>
      <div class="chips">
        <button class="chip ${draft.paid ? 'on' : ''}" data-action="dPaid">${draft.paid ? '✓ Paid' : 'Unpaid'}</button>
        <button class="chip ${draft.fulfilled ? 'on' : ''}" data-action="dFulfilled">${draft.fulfilled ? '✓ Fulfilled' : 'Not fulfilled yet'}</button>
      </div>
      <label>Note</label>
      <textarea data-input="note" placeholder="Size, color, pickup time…">${esc(draft.note)}</textarea>
    </div>
    ${editing ? `<button class="btn danger block" data-action="delete" data-id="${draft.id}">Delete order</button>` : ''}
    <div class="totalbar">
      <div class="grow"><div class="lbl">${lines.reduce((s, l) => s + l.qty, 0)} item(s) · Total</div><div class="big">${money(total)}</div></div>
      ${editing ? '<button class="btn ghost" data-action="cancelEdit">Cancel</button>' : ''}
      <button class="btn" data-action="saveOrder">${editing ? 'Save' : 'Save order'}</button>
    </div>`;
}

function renderSummary() {
  const orders = eventOrders();
  const paid = orders.filter(o => o.paid);
  const revenue = paid.reduce((s, o) => s + o.total, 0);
  const outstanding = orders.filter(o => !o.paid).reduce((s, o) => s + o.total, 0);
  const todo = orders.filter(o => !o.fulfilled).length;
  const times = orders.filter(o => o.fulfilled && o.fulfilledAt).map(o => o.fulfilledAt - o.createdAt);
  const avg = times.length ? fmtDuration(times.reduce((a, b) => a + b, 0) / times.length) : '–';
  const longest = times.length ? fmtDuration(Math.max(...times)) : '–';

  const items = {};
  for (const o of orders) for (const l of o.lines) {
    items[l.name] ??= { qty: 0, sum: 0 };
    items[l.name].qty += l.qty;
    items[l.name].sum += l.qty * l.price;
  }
  const byPay = {};
  for (const o of paid) byPay[o.payment] = (byPay[o.payment] || 0) + o.total;

  const itemRows = Object.entries(items).sort((a, b) => b[1].qty - a[1].qty)
    .map(([n, v]) => `<tr><td>${esc(n)} <span class="muted">× ${v.qty}</span></td><td>${money(v.sum)}</td></tr>`).join('');
  const payRows = Object.entries(byPay).map(([n, v]) => `<tr><td>${esc(n)}</td><td>${money(v)}</td></tr>`).join('');

  return `<h1>Summary</h1>${eventPicker()}
    <div class="stat" style="margin-top:12px">
      <div class="card"><div class="muted">Collected</div><div class="big" style="color:var(--green)">${money(revenue)}</div></div>
      <div class="card"><div class="muted">Unpaid</div><div class="big" style="color:var(--red)">${money(outstanding)}</div></div>
      <div class="card"><div class="muted">Orders</div><div class="big">${orders.length}</div></div>
      <div class="card"><div class="muted">To fulfill</div><div class="big">${todo}</div></div>
      <div class="card"><div class="muted">Avg. time to fulfill</div><div class="big">${avg}</div></div>
      <div class="card"><div class="muted">Longest</div><div class="big">${longest}</div></div>
    </div>
    <h2>Items sold</h2><div class="card">${itemRows ? `<table>${itemRows}</table>` : '<div class="muted">Nothing yet.</div>'}</div>
    <h2>Collected by payment type</h2><div class="card">${payRows ? `<table>${payRows}</table>` : '<div class="muted">Nothing yet.</div>'}</div>
    <h2>Export</h2>
    <div class="actions"><button class="btn ghost" data-action="csv">Export this event (CSV)</button></div>`;
}

function renderSetup() {
  return `<h1>Setup</h1>
    <h2>Events</h2>
    ${state.events.map(e => `<div class="card row between">
        <div class="grow" data-action="pickEvent" data-id="${e.id}">
          <b>${esc(e.name)}</b> ${e.id === state.currentEventId ? '<span class="badge ok">Current</span>' : ''}
          <div class="muted">${esc(e.date)} · ${state.orders.filter(o => o.eventId === e.id).length} orders</div>
        </div>
        <button class="btn small ghost" data-action="renameEvent" data-id="${e.id}">Edit</button>
        <button class="btn small danger" data-action="delEvent" data-id="${e.id}">✕</button>
      </div>`).join('')}
    <button class="btn block" data-action="addEvent">+ New event</button>

    <h2>Menu items</h2>
    ${state.items.map(i => `<div class="card row between">
        <div class="grow"><b>${esc(i.name)}</b><div class="muted">${money(i.price)}</div></div>
        <button class="btn small ghost" data-action="editItem" data-id="${i.id}">Edit</button>
        <button class="btn small danger" data-action="delItem" data-id="${i.id}">✕</button>
      </div>`).join('')}
    <button class="btn block" data-action="addItem">+ New item</button>

    <h2>Data</h2>
    <div class="actions">
      <button class="btn ghost" data-action="backup">Back up all data</button>
      <button class="btn ghost" data-action="restore">Restore</button>
    </div>
    <input type="file" id="restoreFile" accept="application/json" hidden>
    <p class="muted">Data is stored on this iPhone only. Back up regularly — clearing Safari data erases it.</p>`;
}

function render() {
  const app = document.getElementById('app');
  app.innerHTML = { orders: renderOrders, new: renderNew, summary: renderSummary, setup: renderSetup }[view]();
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  if (view !== 'new') window.scrollTo(0, 0);
}

function go(v) { view = v; if (v !== 'new') draft = null; render(); }

/* ---------- helpers ---------- */

function promptPrice(msg, def) {
  const raw = prompt(msg, def ?? '');
  if (raw === null) return null;
  const n = parseFloat(raw.replace(/[^0-9.]/g, ''));
  if (isNaN(n) || n < 0) { toast('Enter a valid price'); return null; }
  return n;
}

function download(name, text, type) {
  const file = new File([text], name, { type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    navigator.share({ files: [file], title: name }).catch(() => {});
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

function exportCsv() {
  const ev = currentEvent();
  const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const rows = [['Order #', 'Time', 'Customer', 'Items', 'Total', 'Payment', 'Paid', 'Fulfilled', 'Fulfilled at', 'Minutes to fulfill', 'Note']];
  for (const o of eventOrders().sort((a, b) => a.number - b.number))
    rows.push([o.number, new Date(o.createdAt).toLocaleString(), o.customer, o.lines.map(l => `${l.qty}x ${l.name}`).join('; '),
      o.total.toFixed(2), o.payment, o.paid ? 'Yes' : 'No', o.fulfilled ? 'Yes' : 'No',
      o.fulfilledAt ? new Date(o.fulfilledAt).toLocaleString() : '',
      o.fulfilledAt ? ((o.fulfilledAt - o.createdAt) / 60000).toFixed(1) : '', o.note]);
  download(`${ev.name.replace(/[^\w-]+/g, '_')}_${ev.date}.csv`, rows.map(r => r.map(q).join(',')).join('\n'), 'text/csv');
}

function saveOrder() {
  const lines = draftLines();
  if (!lines.length) return toast('Add at least one item');
  const total = orderTotal(lines);
  const fields = { customer: draft.customer.trim(), payment: draft.payment, paid: draft.paid, fulfilled: draft.fulfilled, note: draft.note.trim(), lines, total };
  if (draft.id) {
    const o = state.orders.find(o => o.id === draft.id);
    const wasFulfilled = o.fulfilled;
    Object.assign(o, fields);
    if (draft.fulfilled !== wasFulfilled) setFulfilled(o, draft.fulfilled);
    toast('Order updated');
  } else {
    const evId = currentEvent().id;
    const number = nextNumber();
    const order = { id: uid(), eventId: evId, number, createdAt: Date.now(), ...fields };
    order.fulfilledAt = order.fulfilled ? order.createdAt : null;
    state.orders.push(order);
    toast(`Order #${number} saved`);
  }
  save();
  go('orders');
}

/* ---------- events ---------- */

const actions = {
  nav: el => {
    const v = el.dataset.view;
    if (v === 'new' && (!draft || draft.id)) draft = newDraft();
    go(v);
  },
  filter: el => { filter = el.dataset.k; render(); },
  togglePaid: el => { const o = state.orders.find(o => o.id === el.dataset.id); o.paid = !o.paid; save(); render(); },
  toggleFulfilled: el => { const o = state.orders.find(o => o.id === el.dataset.id); setFulfilled(o, !o.fulfilled); save(); render(); },
  edit: el => { draft = draftFromOrder(state.orders.find(o => o.id === el.dataset.id)); view = 'new'; render(); },
  cancelEdit: () => go('orders'),
  delete: el => {
    if (!confirm('Delete this order?')) return;
    state.orders = state.orders.filter(o => o.id !== el.dataset.id);
    save(); toast('Order deleted'); go('orders');
  },
  inc: el => bump(el, 1),
  dec: el => bump(el, -1),
  addCustom: () => {
    const name = prompt('Item name');
    if (!name || !name.trim()) return;
    const price = promptPrice('Price', '');
    if (price === null) return;
    draft.custom.push({ name: name.trim(), price, qty: 1 });
    render();
  },
  pay: el => { draft.payment = el.dataset.k; render(); },
  dPaid: () => { draft.paid = !draft.paid; render(); },
  dFulfilled: () => { draft.fulfilled = !draft.fulfilled; render(); },
  saveOrder,
  csv: exportCsv,

  pickEvent: el => { state.currentEventId = el.dataset.id; save(); render(); toast('Current event changed'); },
  addEvent: () => {
    const name = prompt('Event name');
    if (!name || !name.trim()) return;
    const date = prompt('Date (YYYY-MM-DD)', today()) || today();
    const ev = { id: uid(), name: name.trim(), date: date.trim() };
    state.events.unshift(ev);
    state.currentEventId = ev.id;
    save(); render();
  },
  renameEvent: el => {
    const ev = state.events.find(e => e.id === el.dataset.id);
    const name = prompt('Event name', ev.name);
    if (name === null || !name.trim()) return;
    const date = prompt('Date (YYYY-MM-DD)', ev.date);
    ev.name = name.trim();
    if (date && date.trim()) ev.date = date.trim();
    save(); render();
  },
  delEvent: el => {
    if (state.events.length < 2) return toast('Keep at least one event');
    const ev = state.events.find(e => e.id === el.dataset.id);
    const n = state.orders.filter(o => o.eventId === ev.id).length;
    if (!confirm(`Delete "${ev.name}" and its ${n} order(s)? This cannot be undone.`)) return;
    state.events = state.events.filter(e => e.id !== ev.id);
    state.orders = state.orders.filter(o => o.eventId !== ev.id);
    if (state.currentEventId === ev.id) state.currentEventId = state.events[0].id;
    save(); render();
  },
  addItem: () => {
    const name = prompt('Item name');
    if (!name || !name.trim()) return;
    const price = promptPrice('Price', '');
    if (price === null) return;
    state.items.push({ id: uid(), name: name.trim(), price });
    save(); render();
  },
  editItem: el => {
    const it = state.items.find(i => i.id === el.dataset.id);
    const name = prompt('Item name', it.name);
    if (name === null || !name.trim()) return;
    const price = promptPrice('Price', it.price);
    if (price === null) return;
    it.name = name.trim(); it.price = price;
    save(); render();
  },
  delItem: el => {
    if (!confirm('Remove this item from the menu? Past orders keep their records.')) return;
    state.items = state.items.filter(i => i.id !== el.dataset.id);
    save(); render();
  },
  backup: () => download(`popup-orders-backup-${today()}.json`, JSON.stringify(state, null, 2), 'application/json'),
  restore: () => document.getElementById('restoreFile').click(),
};

function bump(el, d) {
  if (el.dataset.custom) {
    const c = draft.custom[+el.dataset.id];
    c.qty = Math.max(0, c.qty + d);
  } else {
    draft.qty[el.dataset.id] = Math.max(0, (draft.qty[el.dataset.id] || 0) + d);
  }
  render();
}

document.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  actions[el.dataset.action]?.(el);
});

document.addEventListener('change', e => {
  if (e.target.dataset.change === 'event') {
    state.currentEventId = e.target.value; save(); render();
  } else if (e.target.id === 'restoreFile') {
    const file = e.target.files[0];
    if (!file) return;
    file.text().then(t => {
      const data = JSON.parse(t);
      if (!Array.isArray(data.events) || !Array.isArray(data.orders) || !Array.isArray(data.items) || !data.events.length) throw new Error('bad');
      if (!confirm('Replace all current data with this backup?')) return;
      state = data;
      if (!state.events.some(ev => ev.id === state.currentEventId)) state.currentEventId = state.events[0].id;
      save(); render(); toast('Backup restored');
    }).catch(() => toast('Not a valid backup file'));
  }
});

document.addEventListener('input', e => {
  const k = e.target.dataset.input;
  if (k && draft) draft[k] = e.target.value;
});

render();

// Keep the "waiting" timers on unfulfilled orders ticking without re-rendering.
setInterval(() => {
  document.querySelectorAll('.wait').forEach(el => { el.textContent = fmtDuration(Date.now() - +el.dataset.since); });
}, 15000);

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
