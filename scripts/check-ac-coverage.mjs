// Fails when an acceptance criterion in docs/ACCEPTANCE_CRITERIA.md has no test tagged with its id.
// Run from the repository root: node scripts/check-ac-coverage.mjs
import fs from 'node:fs';
import path from 'node:path';

const ids = [...fs.readFileSync('docs/ACCEPTANCE_CRITERIA.md', 'utf8').matchAll(/^\| ([A-Z]+-\d+) \|/gm)].map((m) => m[1]);

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    if (['node_modules', 'bin', 'obj', 'dist', '.angular'].includes(name)) continue;
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full, out);
    else if (/(Tests?\.cs|\.spec\.ts|\.test\.mjs)$/.test(name)) out.push(full);
  }
  return out;
}

const text = [...walk('backend/tests'), ...walk('frontend/src'), ...walk('frontend/e2e')].map((f) => fs.readFileSync(f, 'utf8')).join('\n');
const missing = ids.filter((id) => !text.includes(`"AC", "${id}"`) && !text.includes(`AC:${id} `));

console.log(`${ids.length} criteria, ${ids.length - missing.length} covered`);
if (missing.length) {
  console.error('No test for: ' + missing.join(', '));
  process.exit(1);
}
