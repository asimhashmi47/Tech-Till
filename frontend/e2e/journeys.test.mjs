// Critical user journeys, driven through the locally installed Chrome over the DevTools protocol
// (the same approach as scripts/screenshots.mjs, so no browser package is added).
// Needs the API and the dev server running against a DISPOSABLE seeded database.
// Run from frontend/: npm run test:e2e
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';

const APP = process.env.APP ?? 'http://localhost:4200';
const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9341;
const PASSWORD = process.env.E2E_PASSWORD ?? 'TechTill#2026';
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

let chrome;
let ws;
let seq = 0;
const pending = new Map();
const downloads = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-e2e-downloads-'));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-e2e-profile-'));

const cdp = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result)));
    ws.send(JSON.stringify({ id, method, params }));
  });

async function js(expression) {
  const { result, exceptionDetails } = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
  return result.value;
}

async function until(expression, label, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await js(expression).catch(() => false)) return;
    await pause(100);
  }
  throw new Error(`Timed out waiting for: ${label}. At ${await js('location.href')}: ${(await js('document.body.innerText')).slice(0, 300)}`);
}

/** Marks the old document first, so a wait can never be satisfied by the page being left. */
async function go(url) {
  await js('window.__leaving = true');
  await cdp('Page.navigate', { url: APP + url });
  await until(`window.__leaving === undefined && document.readyState === 'complete'`, `navigation to ${url}`);
}

const text = (needle) => `document.body.innerText.includes(${JSON.stringify(needle)})`;
const clickText = (needle, selector = 'button, a') =>
  js(`(() => { const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find((e) => e.textContent.trim().includes(${JSON.stringify(needle)}) && !e.disabled); if (!el) throw new Error('No element with text ' + ${JSON.stringify(needle)}); el.click(); })()`);
const type = (selector, value) =>
  js(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) throw new Error('Missing ' + ${JSON.stringify(selector)}); el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); })()`);
const gridFooter = `document.querySelector('tt-data-grid span.tabular[aria-live="polite"]')?.innerText ?? ''`;

async function signIn(username, password = PASSWORD) {
  await go('/login');
  await js(`localStorage.clear()`);
  await go('/login');
  await until(`!!document.querySelector('#username')`, 'sign-in form');
  await type('#username', username);
  await type('#password', password);
  await clickText('Sign in', 'button[type=submit]');
}

before(async () => {
  chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--no-first-run', '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
  let target;
  for (let i = 0; i < 80 && !target; i++) {
    await pause(250);
    try {
      target = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === 'page');
    } catch {
      /* starting */
    }
  }
  assert.ok(target, 'Chrome did not start');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m);
      pending.delete(m.id);
    }
  });
  await cdp('Page.enable');
  await cdp('Runtime.enable');
  await cdp('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });
});

after(() => {
  ws?.close();
  chrome?.kill();
});

test('AC:UI-01 a wrong password shows an inline error and stays on sign in', async () => {
  await signIn('admin', 'definitely-wrong');
  await until(text('do not match an active account'), 'inline error');
  assert.match(await js('location.pathname'), /login/);
});

test('AC:UI-02 a read-only user does not see modules they cannot use, and a direct URL is refused', async () => {
  await signIn('zoya');
  await until(`location.pathname === '/dashboard'`, 'dashboard');
  await until(`document.querySelectorAll('aside nav a').length > 0`, 'sidebar');
  const links = await js(`[...document.querySelectorAll('aside nav a')].map((a) => a.innerText.trim())`);
  assert.ok(links.includes('Stock'));
  assert.ok(!links.includes('Customers'));
  assert.ok(!links.includes('Audit log'));
  await go('/audit-log');
  await until(`location.pathname === '/error/403'`, '403 page');
});

test('AC:UI-01 valid credentials land on the dashboard with real figures', async () => {
  await signIn('admin');
  await until(`location.pathname === '/dashboard'`, 'dashboard');
  await until(text('Sales in range'), 'KPI tiles');
});

test('AC:UI-03 the till completes a cash sale and shows the invoice', async () => {
  await js(`localStorage.setItem('techtill.shop', String(JSON.parse(localStorage.getItem('techtill.profile')).shops[0].id))`);
  await go('/pos');
  await until(`document.querySelectorAll('.pos-tile:not(:disabled)').length > 0`, 'in-stock tiles');
  await js(`document.querySelector('.pos-tile:not(:disabled)').click()`);
  await until(`document.querySelectorAll('.pos-line').length === 1`, 'cart line');
  await clickText('Exact');
  await until(`[...document.querySelectorAll('button')].some((b) => b.textContent.includes('Take payment') && !b.disabled)`, 'payment enabled');
  await clickText('Take payment');
  await until(`/print\\/invoice|\\/invoices\\/\\d+/.test(location.pathname) || document.body.innerText.includes('Sale complete') || document.querySelectorAll('.pos-line').length === 0`, 'sale finished', 20000);
  await js(`localStorage.removeItem('techtill.shop')`);
  await go('/invoices');
  await until(`document.querySelectorAll('tt-data-grid tbody tr td').length > 3`, 'invoice rows');
  const firstRowText = await js(`document.querySelector('tt-data-grid tbody tr').innerText`);
  assert.match(firstRowText, /Walk-in/);
});

test('AC:UI-04 a product added through the drawer is found by the grid search', async () => {
  const sku = `E2E-${Date.now()}`;
  await go('/products');
  await until(`[...document.querySelectorAll('button')].some((b) => b.textContent.includes('Add product'))`, 'add button');
  await clickText('Add product');
  await until(`!!document.querySelector('tt-drawer #sku')`, 'drawer');
  await until(`document.querySelectorAll('tt-drawer #category option').length > 1`, 'categories');
  await type('tt-drawer #sku', sku);
  await type('tt-drawer #name', 'E2E Monitor');
  await js(`(() => { const s = document.querySelector('tt-drawer #category'); s.selectedIndex = 1; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await type('tt-drawer #price', '123');
  await js(`document.querySelector('tt-drawer footer button[type=submit]').click()`);
  await until(`!document.querySelector('tt-drawer [role=dialog]')`, 'drawer closed');
  await type('input[data-search]', sku);
  await until(`${gridFooter}.includes('of 1 rows')`, 'search result');
  assert.match(await js(`document.querySelector('tt-data-grid tbody').innerText`), new RegExp(sku));
});

test('AC:UI-05 column search and the rule builder narrow the grid, and CSV downloads', async () => {
  await go('/products');
  await until(`document.querySelectorAll('tt-data-grid tbody tr td').length > 3`, 'rows');
  await until(`${gridFooter}.includes('rows')`, 'footer');
  const all = await js(gridFooter);

  await type('[data-colfilter="categoryName"]', 'Laptop');
  await until(`${gridFooter} !== ${JSON.stringify(all)}`, 'column filter applied');
  const filtered = await js(gridFooter);

  await clickText('Advanced filter');
  await until(`!!document.querySelector('tt-data-grid .tabs')`, 'builder');
  await js(`(() => { const i = document.querySelector('tt-data-grid .tabs').closest('[data-menu]').querySelector('input'); i.value = 'LP-D'; i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await clickText('Apply filter');
  await until(`${gridFooter} !== ${JSON.stringify(filtered)}`, 'rule applied');

  await clickText('Download');
  await until(text('CSV'), 'download menu');
  await clickText('CSV', '.menu-item');
  const deadline = Date.now() + 15000;
  let file;
  while (!file && Date.now() < deadline) {
    file = fs.readdirSync(downloads).find((f) => f.endsWith('.csv'));
    if (!file) await pause(100);
  }
  assert.ok(file, 'CSV file was not downloaded');
  const csv = fs.readFileSync(path.join(downloads, file), 'utf8');
  assert.match(csv, /"SKU"/);
  assert.match(csv, /LP-D/);
});

test('AC:UI-06 sign out ends the session', async () => {
  await go('/dashboard');
  await until(`!!document.querySelector('[data-pop="user"] button')`, 'account menu');
  await js(`document.querySelector('[data-pop="user"] button').click()`);
  await until(text('Sign out'), 'menu open');
  await clickText('Sign out', '.menu-item');
  await until(`!!document.querySelector('.swal2-confirm')`, 'confirm dialog');
  await js(`document.querySelector('.swal2-confirm').click()`);
  await until(`location.pathname === '/login'`, 'back at sign in');
  await go('/products');
  await until(`location.pathname === '/login'`, 'still signed out');
});
