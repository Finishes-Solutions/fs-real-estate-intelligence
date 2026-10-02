// Every lib/*.mjs the browser imports must be copied to public/ by the build (build.mjs --assemble) and listed in the
// offline shell (src/sw.js); a missing one stops the whole app from loading in production.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const build = fs.readFileSync('build.mjs', 'utf8'), sw = fs.readFileSync('src/sw.js', 'utf8');
const copied = new Set((build.match(/for \(const f of \[([^\]]*)\]\) await fs\.copyFile\('lib\//) || [])[1]?.match(/'([^']+)'/g)?.map(x => x.slice(1, -1)) || []);
const want = new Set(), seen = new Set(), queue = fs.readdirSync('src').filter(f => f.endsWith('.js')).map(f => 'src/' + f);
while (queue.length) { // follow imports through lib/ too (a lib file can import another)
  const f = queue.pop(); if (seen.has(f)) continue; seen.add(f);
  for (const [, p] of fs.readFileSync(f, 'utf8').matchAll(/from '\.\/(?:lib\/)?([a-z-]+\.mjs)'/g)) { want.add(p); queue.push('lib/' + p); }
}
for (const lib of want) { assert.ok(copied.has(lib), 'build.mjs --assemble must copy lib/' + lib); assert.ok(sw.includes("'lib/" + lib + "'"), 'src/sw.js must list lib/' + lib); }
for (const f of fs.readdirSync('src').filter(f => f.endsWith('.js') && f !== 'sw.js')) assert.ok(sw.includes("'" + f + "'"), 'src/sw.js must list ' + f);
console.log('shell ok:', want.size, 'lib files');
