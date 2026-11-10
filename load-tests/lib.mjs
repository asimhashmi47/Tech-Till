import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, openSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const WORK = process.env.LOADTEST_WORK ?? path.join(os.tmpdir(), 'techtill-load');
export const TEMPLATE = path.join(WORK, 'template.db');
export const HOOK = path.join(WORK, 'hook', 'MetricsHook.dll');
export const API_DIR = path.join(ROOT, 'backend/src/TechTill.Api/bin/Release/net10.0');
export const PORT = Number(process.env.LOADTEST_PORT ?? 5082);
export const BASE = `http://localhost:${PORT}`;
export const SECRET = 'load-test-only-signing-key-0123456789abcdef';
export const PASSWORD = 'TechTill#2026';

mkdirSync(WORK, { recursive: true });

export function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} exited with ${result.status}`);
}

export function buildAll() {
  run('dotnet', ['build', path.join(ROOT, 'backend/src/TechTill.Api'), '-c', 'Release', '--nologo', '-v', 'q']);
  run('dotnet', ['build', path.join(ROOT, 'load-tests/metrics-hook'), '-c', 'Release', '--nologo', '-v', 'q', '-o', path.dirname(HOOK)]);
}

/** Always a loopback process on a scratch database, so a load run cannot reach anything real. */
export function startApi({ database, environment = 'Production', metricsFile }) {
  const output = openSync(`${database}.console.log`, 'w');
  const env = { ...process.env, DOTNET_gcServer: '1' };
  if (metricsFile) {
    env.DOTNET_STARTUP_HOOKS = HOOK;
    env.TT_METRICS_FILE = metricsFile;
  }
  return spawn(
    'dotnet',
    [
      path.join(API_DIR, 'TechTill.Api.dll'),
      '--urls', BASE,
      '--environment', environment,
      `--Jwt:Secret=${SECRET}`,
      '--Jwt:Issuer=TechTill',
      '--Jwt:Audience=TechTill',
      // Every virtual user comes from this one address, which real tills do not.
      '--RateLimits:SignInPerIpPerMinute=1000000',
      '--RateLimits:RefreshPerIpPerMinute=1000000',
      `--ConnectionStrings:Default=Data Source=${database}`,
      `--Serilog:WriteTo:0:Args:path=${database}.log-.txt`,
    ],
    { cwd: API_DIR, env, stdio: ['ignore', output, output] },
  );
}

export async function waitForHealth(child, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`API exited early with ${child.exitCode}`);
    const up = await fetch(`${BASE}/health`).then((r) => r.ok).catch(() => false);
    if (up) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('API did not become healthy.');
}

export async function stopApi(child) {
  if (child.exitCode !== null) return;
  const gone = new Promise((r) => child.once('exit', r));
  child.kill();
  await gone;
}

export function freshCopy(name) {
  if (!existsSync(TEMPLATE)) throw new Error('No template database. Run: node load-tests/setup.mjs');
  const target = path.join(WORK, name);
  for (const file of readdirSync(WORK)) {
    if (file.startsWith(name)) rmSync(path.join(WORK, file), { force: true });
  }
  copyFileSync(TEMPLATE, target);
  return target;
}
