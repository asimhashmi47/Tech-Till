// Captures the README screenshots with the locally installed Chrome over the DevTools protocol (no extra packages).
// Needs the API (5080) and the Angular dev server (4200) running with the demo seed.
// Run from the repository root: node scripts/screenshots.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const APP = process.env.APP ?? 'http://localhost:4200';
const OUT = path.resolve('images');
const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9337;
// The seed covers the 90 days before the database was created, so reports need a range that reaches it.
const FROM = process.env.FROM ?? '2026-04-01';
const TO = process.env.TO ?? '2026-10-31';
fs.mkdirSync(OUT, { recursive: true });

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-shots-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--no-first-run', '--hide-scrollbars', '--force-device-scale-factor=1', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let target;
for (let i = 0; i < 40 && !target; i++) {
  await sleep(250);
  try {
    target = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === 'page');
  } catch {
    /* starting */
  }
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let seq = 0;
const pending = new Map();
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
});
const cdp = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result)));
    ws.send(JSON.stringify({ id, method, params }));
  });
const js = async (expression) => (await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.value;

const size = (width, height, mobile = false) => cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
async function go(url, wait = 2800) {
  await cdp('Page.navigate', { url: APP + url });
  await sleep(wait);
}
async function shot(name) {
  // Toasts from the last action would otherwise sit on top of the page.
  await js(`document.querySelectorAll('.swal2-container').forEach((e) => e.remove())`);
  const { data } = await cdp('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, `${name}.png`), Buffer.from(data, 'base64'));
  console.log(`  images/${name}.png`);
}
const click = (text, selector = 'button, a, [role=tab]') =>
  js(`(() => { const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find((e) => e.textContent.trim().includes(${JSON.stringify(text)})); if (el) { el.click(); return true; } return false; })()`);
const clickAt = (selector) => js(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (el) { el.click(); return true; } return false; })()`);
const setValue = (selector, value) =>
  js(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
async function range() {
  await setValue('input[name=from]', FROM);
  await setValue('input[name=to]', TO);
  await sleep(100);
  await click('Apply', 'button');
  await sleep(2000);
}

await cdp('Page.enable');
await cdp('Runtime.enable');
await size(1440, 900);

console.log('Capturing…');
await go('/login', 3500);
await shot('01-login');
await click('admin', 'button');
await sleep(4500);

await go('/dashboard', 3500);
await click('12 months', 'button');
await sleep(3500);
await shot('02-dashboard');
await js('window.scrollTo(0, 830)');
await sleep(900);
await shot('02b-dashboard-lower');

// The till needs one shop; nothing here is sold, the cart is only filled.
await js(`localStorage.setItem('techtill.shop', String(JSON.parse(localStorage.getItem('techtill.profile')).shops[0].id))`);
await go('/pos', 3500);
await js(`[...document.querySelectorAll('.pos-tile:not(:disabled)')].slice(0, 3).forEach((t) => t.click())`);
await sleep(800);
await shot('03-pos');
await js(`localStorage.removeItem('techtill.shop')`);

const pages = [
  ['04-invoices', '/invoices'],
  ['05-invoice-detail', '/invoices/1'],
  ['06-invoice-print', '/print/invoice/1'],
  ['07-customers', '/customers'],
  ['09-receipts', '/customers/receipts'],
  ['13-stock', '/stock'],
  ['15-suppliers', '/suppliers'],
  ['16-purchases', '/purchases'],
  ['17-purchase-form', '/purchases/new'],
  ['18-expenses', '/expenses'],
  ['19-petty-cash', '/petty-cash'],
  ['20-receivables', '/receivables'],
  ['21-payables', '/payables'],
  ['24-balance-sheet', '/reports/balance-sheet'],
  ['26-shops', '/shops'],
  ['27-users', '/users'],
  ['28-settings', '/settings'],
  ['29-audit-log', '/audit-log'],
];
for (const [name, url] of pages) {
  await go(url);
  await shot(name);
}

await go('/customers');
await clickAt('[aria-label*="edger"]');
await sleep(2500);
await shot('08-customer-ledger');

await go('/products');
await shot('10-products');
await clickAt('[aria-label^="Edit"]');
await sleep(800);
await shot('11-product-editor');

await go('/products');
await setValue('[data-colfilter="categoryName"]', 'Laptop');
await sleep(900);
await click('Advanced filter', 'button');
await sleep(300);
await js(`(() => { const p = document.querySelector('tt-data-grid .tabs').closest('[data-menu]'); const i = p.querySelector('input'); i.value = 'Dell'; i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
await click('Add rule', 'button');
await sleep(300);
await shot('12-advanced-filter');

await go('/stock');
await click('Movements', 'button');
await sleep(2000);
await shot('14-stock-movements');

await go('/reports/summary');
await click('Monthly', 'button');
await sleep(2200);
await shot('22-summary');

await go('/reports/profit-and-loss');
await range();
await shot('23-profit-and-loss');

await go('/reports/cash-flow');
await range();
await shot('25-cash-flow');

await size(390, 844, true);
await go('/dashboard', 3500);
await shot('30-mobile-dashboard');

ws.close();
chrome.kill();
