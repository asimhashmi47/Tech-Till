// Closed-loop load generator. Starts its own Release API on a scratch database, then drives it.
// Run: node load-tests/run.mjs --profile smoke|load|spike|stress|soak --label before [--users 1000] [--secs 3600]
import { createHmac, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { DatabaseSync } from 'node:sqlite';
import { BASE, buildAll, freshCopy, PASSWORD, PORT, ROOT, SECRET, startApi, stopApi, waitForHealth } from './lib.mjs';

const args = Object.fromEntries(process.argv.slice(2).join(' ').split('--').filter(Boolean).map((s) => s.trim().split(/\s+/)));
const PROFILE = args.profile ?? 'smoke';
const LABEL = args.label ?? 'run';
const USERS = Number(args.users ?? 1000);
const THRESHOLDS = { p95: 500, p99: 1500, errorPct: 1 };

const PROFILES = {
  smoke: [{ to: USERS, secs: 60 }, { to: USERS, secs: 60, measure: true }],
  load: [{ to: USERS, secs: 300 }, { to: USERS, secs: 600, measure: true }],
  spike: [{ to: USERS, secs: 30 }, { to: USERS, secs: 120, measure: true }, { to: 0, secs: 30 }],
  soak: [{ to: USERS, secs: 120 }, { to: USERS, secs: Number(args.secs ?? 3600), measure: true }],
  stress: [5, 10, 25, 50, 100, 250, 500, 750, 1000, 1500, 2000, 3000, 4000, 6000, 8000].flatMap((to) => [{ to, secs: 20 }, { to, secs: 100, measure: true, step: to }]),
};

if (!args['no-build']) buildAll();
const database = freshCopy(`${LABEL}-${PROFILE}.db`);
const metricsFile = `${database}.metrics.jsonl`;

const seed = new DatabaseSync(database, { readOnly: true });
const users = seed.prepare(`SELECT u.Id id, u.Username username, s.ShopId shopId FROM Users u JOIN UserShops s ON s.UserId=u.Id WHERE u.Username LIKE 'load%' ORDER BY u.Id`).all();
const catalog = seed.prepare(`SELECT Id id, SalePrice price FROM Products WHERE IsDeleted=0 AND IsActive=1 AND Sku LIKE 'LT-%'`).all();
const walkIn = seed.prepare('SELECT Id id FROM Customers WHERE IsWalkIn=1').get().id;
const invoiceRows = seed.prepare('SELECT COUNT(*) n FROM SalesInvoices').get().n;
seed.close();

const api = startApi({ database, metricsFile });
let apiExit = null;
api.once('exit', (code) => (apiExit = code));
await waitForHealth(api);

const agent = new http.Agent({ keepAlive: true, maxSockets: Infinity, maxFreeSockets: 20000 });
const endpoints = [];
const samples = [];
const socketErrors = {};
const started = performance.now();
const elapsed = () => (performance.now() - started) / 1000;

function record(name, ms, status) {
  let index = endpoints.indexOf(name);
  if (index < 0) index = endpoints.push(name) - 1;
  samples.push(elapsed(), index, ms, status);
}

function call(name, method, url, { token, body, headers, parse } = {}) {
  return new Promise((resolve) => {
    const begin = performance.now();
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const finish = (status, text) => {
      record(name, performance.now() - begin, status);
      let json;
      if (parse && text) {
        try {
          json = JSON.parse(text);
        } catch {
          /* an error page */
        }
      }
      resolve({ status, json });
    };
    const req = http.request(
      {
        host: 'localhost',
        port: PORT,
        method,
        path: url,
        agent,
        timeout: 30_000,
        headers: { ...(payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
      },
      (res) => {
        const chunks = parse ? [] : null;
        res.on('data', (c) => chunks?.push(c));
        res.on('end', () => finish(res.statusCode, chunks ? Buffer.concat(chunks).toString() : ''));
        res.on('error', () => finish(0, ''));
      },
    );
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', (e) => {
      socketErrors[e.code ?? e.message] = (socketErrors[e.code ?? e.message] ?? 0) + 1;
      finish(0, '');
    });
    req.end(payload);
  });
}

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function mint(user) {
  const now = Math.floor(Date.now() / 1000);
  const head = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: String(user.id), nameid: String(user.id), unique_name: user.username, role: 'Standard', fullName: user.username, jti: randomUUID(), tv: 0, nbf: now - 5, iat: now - 5, exp: now + 43_200, iss: 'TechTill', aud: 'TechTill' })}`;
  return `${head}.${createHmac('sha256', SECRET).update(head).digest('base64url')}`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (n) => Math.floor(Math.random() * n);
const think = () => sleep(2000 + Math.random() * 4000);
const TERMS = ['key', 'mouse', 'monitor', 'ssd', 'router', 'dell', 'hp', 'LT-0', 'asus', 'cable', 'web', 'lap'];

const scenarios = [
  [30, async (v) => call('pos-search', 'GET', `/api/products/pos-search?shopId=${v.user.shopId}&term=${TERMS[rand(TERMS.length)]}`, { token: v.token })],
  [18, async (v) => call('products-query', 'POST', '/api/products/query', { token: v.token, body: { page: 1 + rand(20), pageSize: 25, search: rand(3) === 0 ? TERMS[rand(TERMS.length)] : undefined, sort: [{ field: 'name' }] } })],
  [12, async (v) => call('stock-query', 'POST', '/api/stock/query', { token: v.token, body: { shopId: v.user.shopId, page: 1 + rand(20), pageSize: 25 } })],
  [12, async (v) => call('invoices-query', 'POST', '/api/invoices/query', { token: v.token, body: { shopId: v.user.shopId, page: 1, pageSize: 25, sort: [{ field: 'invoiceDate', desc: true }] } })],
  [5, async (v) => call('customers-query', 'POST', '/api/customers/query', { token: v.token, body: { page: 1 + rand(10), pageSize: 25 } })],
  [6, async (v) => call('dashboard', 'GET', `/api/dashboard?shopId=${v.user.shopId}`, { token: v.token })],
  [3, async (v) => (v.lastInvoice ? call('invoice-get', 'GET', `/api/invoices/${v.lastInvoice}`, { token: v.token }) : sale(v))],
  [11, async (v) => sale(v)],
  [2, async (v) => {
    const created = await call('customer-create', 'POST', '/api/customers', { token: v.token, parse: true, body: { name: `Load walk ${randomUUID()}`, isActive: true } });
    if (created.json?.id) await call('customer-update', 'PUT', `/api/customers/${created.json.id}`, { token: v.token, body: { name: `Load edited ${randomUUID()}`, phone: '03001234567', isActive: true } });
  }],
  [1, async (v) => call('me', 'GET', '/api/auth/me', { token: v.token })],
];
const WEIGHT = scenarios.reduce((s, [w]) => s + w, 0);

async function sale(v) {
  const p = catalog[rand(catalog.length)];
  const r = await call('pos-sale', 'POST', '/api/pos/sale', {
    token: v.token,
    parse: true,
    headers: { 'Idempotency-Key': randomUUID() },
    body: { shopId: v.user.shopId, customerId: walkIn, discount: 0, paidNow: p.price, paymentMethod: 'Cash', items: [{ productId: p.id, qty: 1, unitPrice: p.price }] },
  });
  if (r.json?.id) v.lastInvoice = r.json.id;
}

function pickScenario() {
  let roll = Math.random() * WEIGHT;
  for (const [weight, fn] of scenarios) {
    if ((roll -= weight) <= 0) return fn;
  }
  return scenarios[0][1];
}

const control = { target: 0, stop: false, active: 0, next: 0 };

async function virtualUser(index) {
  const v = { user: users[index % users.length], token: null, refresh: null, tokenAt: 0, lastInvoice: null };
  control.active++;
  await sleep(Math.random() * 1000);

  // Real sign-in first. The token is minted only when the API refuses, so the rest of the
  // journey is still measured on the build whose limiter admits 10 sign-ins a minute.
  const login = await call('login', 'POST', '/api/auth/login', { parse: true, body: { username: v.user.username, password: PASSWORD } });
  if (login.json?.accessToken) {
    v.token = login.json.accessToken;
    v.refresh = login.json.refreshToken;
    v.tokenAt = Date.now();
  } else {
    v.token = mint(v.user);
    v.tokenAt = Infinity;
  }

  let nextPoll = Date.now() + Math.random() * 60_000;
  while (!control.stop && index < control.target) {
    if (Date.now() - v.tokenAt > 25 * 60_000) {
      const renewed = await call('refresh', 'POST', '/api/auth/refresh', { parse: true, body: { refreshToken: v.refresh } });
      v.token = renewed.json?.accessToken ?? mint(v.user);
      v.refresh = renewed.json?.refreshToken ?? v.refresh;
      v.tokenAt = renewed.json?.accessToken ? Date.now() : Infinity;
    }

    // The sidebar polls the dashboard for its alerts once a minute for every open client.
    if (Date.now() >= nextPoll) {
      nextPoll = Date.now() + 60_000;
      await call('dashboard-poll', 'GET', '/api/dashboard', { token: v.token });
    }

    await pickScenario()(v);
    await think();
  }
  control.active--;
}

const loopLag = monitorEventLoopDelay({ resolution: 20 });
loopLag.enable();
const hostCpu = [];
let lastCpus = os.cpus();
const hostTimer = setInterval(() => {
  const now = os.cpus();
  let idle = 0;
  let total = 0;
  now.forEach((c, i) => {
    const before = lastCpus[i].times;
    for (const k of Object.keys(c.times)) total += c.times[k] - before[k];
    idle += c.times.idle - before.idle;
  });
  lastCpus = now;
  hostCpu.push({ at: elapsed(), busyPct: Math.round((1 - idle / total) * 100) });
}, 5000);

function percentile(sorted, p) {
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((sorted.length * p) / 100))] : 0;
}

function stats(from, to, keep = () => true) {
  const ms = [];
  let errors = 0;
  const statuses = {};
  for (let i = 0; i < samples.length; i += 4) {
    if (samples[i] < from || samples[i] >= to || !keep(samples[i + 1])) continue;
    ms.push(samples[i + 2]);
    const status = samples[i + 3];
    statuses[status] = (statuses[status] ?? 0) + 1;
    if (status === 0 || status >= 400) errors++;
  }
  ms.sort((a, b) => a - b);
  const round = (v) => Math.round(v * 10) / 10;
  return { count: ms.length, rps: round(ms.length / Math.max(1, to - from)), p50: round(percentile(ms, 50)), p95: round(percentile(ms, 95)), p99: round(percentile(ms, 99)), max: round(ms.at(-1) ?? 0), errorPct: round((errors / Math.max(1, ms.length)) * 100), statuses };
}

const business = (i) => endpoints[i] !== 'login' && endpoints[i] !== 'refresh';
const pass = (s) => s.p95 < THRESHOLDS.p95 && s.p99 < THRESHOLDS.p99 && s.errorPct < THRESHOLDS.errorPct;

// The ramp drives control.target; every VU below the target runs until the target falls.
const windows = [];
const stepResults = [];
let broke = null;

ramp: for (const stage of PROFILES[PROFILE]) {
  const from = control.target;
  const begin = elapsed();
  while (elapsed() - begin < stage.secs) {
    const progress = Math.min(1, (elapsed() - begin) / stage.secs);
    control.target = Math.round(from + (stage.to - from) * progress);
    while (control.next < control.target) virtualUser(control.next++);
    if (apiExit !== null) {
      broke = `API process exited with ${apiExit}`;
      break ramp;
    }
    await sleep(250);
  }
  control.target = stage.to;
  if (control.next > control.target) control.next = control.target;
  if (stage.measure) {
    windows.push([begin, elapsed()]);
    if (stage.step) {
      const s = stats(begin, elapsed(), business);
      stepResults.push({ users: stage.step, ...s, pass: pass(s) });
      console.log(`step ${String(stage.step).padStart(5)} users: ${s.rps} rps, p50 ${s.p50}, p95 ${s.p95}, p99 ${s.p99}, errors ${s.errorPct}%`, s.statuses);
      if (s.errorPct >= 25 || s.p95 > 25_000) {
        broke = `at ${stage.step} users: p95 ${s.p95} ms, errors ${s.errorPct}%`;
        break;
      }
    }
  }
}

const end = elapsed();
control.stop = true;
clearInterval(hostTimer);
loopLag.disable();
const [measureFrom, measureTo] = windows.length ? [windows[0][0], windows.at(-1)[1]] : [0, end];
const overall = stats(measureFrom, measureTo, business);
const perEndpoint = Object.fromEntries(endpoints.map((name, i) => [name, stats(measureFrom, measureTo, (x) => x === i)]));
const login = perEndpoint.login ? stats(0, end, (i) => endpoints[i] === 'login') : null;
const timeline = [];
for (let t = 0; t < end; t += 30) timeline.push({ t, ...stats(t, t + 30, business) });

await sleep(6000);
await stopApi(api);

const runtime = existsSync(metricsFile) ? readFileSync(metricsFile, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
const slowest = existsSync(`${metricsFile}.sql.json`) ? JSON.parse(readFileSync(`${metricsFile}.sql.json`, 'utf8')) : [];
const peak = (key) => Math.max(0, ...runtime.map((r) => r[key] ?? 0));
const mean = (key) => Math.round(runtime.reduce((s, r) => s + (r[key] ?? 0), 0) / Math.max(1, runtime.length));
const summary = {
  label: LABEL,
  profile: PROFILE,
  users: USERS,
  seededInvoices: invoiceRows,
  at: new Date().toISOString(),
  base: BASE,
  host: { logicalCpus: os.cpus().length, sameMachineAsGenerator: true, busyPctMean: Math.round(hostCpu.reduce((s, c) => s + c.busyPct, 0) / Math.max(1, hostCpu.length)), busyPctPeak: Math.max(0, ...hostCpu.map((c) => c.busyPct)) },
  generatorEventLoopP99Ms: Math.round(loopLag.percentile(99) / 1e6),
  thresholds: THRESHOLDS,
  overall,
  pass: pass(overall),
  broke,
  socketErrors,
  login,
  perEndpoint,
  stepResults,
  runtime: { cpuPctMean: mean('cpuPct'), cpuPctPeak: peak('cpuPct'), workingSetMbPeak: peak('workingSetMb'), gcHeapMbPeak: peak('gcHeapMb'), gcPauseMsTotal: Math.round(runtime.reduce((s, r) => s + (r.gcPauseMs ?? 0), 0)), gen2: runtime.at(-1)?.gen2, threadPoolThreadsPeak: peak('threadPoolThreads'), threadPoolQueuePeak: peak('threadPoolQueue'), openConnectionsPeak: peak('openConnectionsMax'), lockWaitMsTotal: Math.round(runtime.reduce((s, r) => s + (r.lockWaitMs ?? 0), 0)), lockWaitMaxMs: peak('lockWaitMaxMs') },
  slowestQueries: slowest.slice(0, 12),
  timeline,
};

const dir = path.join(ROOT, 'load-tests/results');
mkdirSync(dir, { recursive: true });
writeFileSync(path.join(dir, `${LABEL}-${PROFILE}.json`), JSON.stringify(summary, null, 2));

console.log(`\n=== ${LABEL} / ${PROFILE} at ${USERS} users ===`);
console.log('overall (business endpoints):', JSON.stringify(overall), summary.pass ? 'PASS' : 'FAIL');
if (broke) console.log('broke:', broke);
if (Object.keys(socketErrors).length) console.log('socket errors:', JSON.stringify(socketErrors));
if (login) console.log('login:', JSON.stringify(login));
console.table(Object.fromEntries(Object.entries(perEndpoint).map(([k, s]) => [k, { rps: s.rps, p50: s.p50, p95: s.p95, p99: s.p99, 'err%': s.errorPct }])));
console.log('runtime:', JSON.stringify(summary.runtime));
console.log('host:', JSON.stringify(summary.host), 'generator event loop p99 ms:', summary.generatorEventLoopP99Ms);
console.log('top queries by total time:');
for (const q of summary.slowestQueries.slice(0, 6)) console.log(`  ${q.totalMs} ms total, ${q.count}x, max ${q.maxMs}, ${q.slowCount} over 100 ms: ${q.sql.slice(0, 110)}`);
process.exit(0);
