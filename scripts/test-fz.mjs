// @ts-check
// Runs every feasibility test (test/fz-*.mjs) one after another, each in its own Node process, and stops at the
// first failure: `npm run test:fz`. New fz-*.mjs files are picked up without editing package.json.
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = readdirSync(path.join(root, 'test')).filter(f => /^fz-.*\.mjs$/.test(f)).sort();
for (const f of files) {
  const t0 = Date.now(), r = spawnSync(process.execPath, ['test/' + f], { cwd: root, stdio: 'inherit' });
  if (r.status !== 0) { console.error('FAILED: test/' + f); process.exit(r.status || 1); }
  console.log('  (' + f + ' ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s)');
}
console.log(files.length + ' feasibility test files passed');
