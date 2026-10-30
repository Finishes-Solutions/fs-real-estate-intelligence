// @ts-check
// The infrastructure-isolation check (CLAUDE.md, "Infrastructure isolation"): greps every tracked file on the branch for
// the source repos' domains, hosts, project and resource names, bucket and board ids, hook ids and env var names. The
// patterns are read from docs/AUDIT.md (the two "Grep patterns" lists of the Infrastructure inventory), so this script
// holds none of them itself. Must print zero matches.
//   node scripts/infra-grep.mjs
// Excluded files: docs/AUDIT.md and docs/PROGRESS.md (they name the identifiers on purpose: the inventory, and this
// check's own output). A list entry can carry an annotation: (own: why) skips a name this platform used before the
// integration; (match: regex) checks only that form of it; (regex: …) is a note on an entry that is itself a regex.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
const audit = readFileSync(root + 'docs/AUDIT.md', 'utf8');
const lists = [...audit.matchAll(/### 8\. Grep patterns[^\n]*\n[\s\S]*?```\n([\s\S]*?)```/g)].map(m => m[1]);
if (lists.length !== 2) { console.error('expected two pattern lists in docs/AUDIT.md, found ' + lists.length); process.exit(2); }
const pats = [];
for (const line of lists.join('\n').split('\n')) {
  const t = line.replace(/\s+\((regex|own|match):.*$/, '').trim(); if (!t || t.startsWith('#')) continue;
  if (/\(own:/.test(line)) continue;
  const m = /\(match: (.*)\)\s*$/.exec(line);
  if (m) { pats.push({ p: m[1], regex: true, show: t + ' (as ' + m[1] + ')' }); continue; }
  pats.push({ p: t, regex: /\\b|\[a-z|\{|\\\(/.test(t), show: t }); // (an entry with \b, a class or a quantifier is a regex)
}
const EXCLUDE = [':!docs/AUDIT.md', ':!docs/PROGRESS.md'];
let total = 0;
for (const { p, regex, show } of pats) {
  let out;
  try { out = execFileSync('git', ['grep', '-nI', regex ? '-P' : '-F', '-e', p, '--', '.', ...EXCLUDE], { cwd: root, encoding: 'utf8' }); } catch (e) { out = e.status === 1 ? '' : String(e.stdout || ''); }
  const hits = out.split('\n').filter(Boolean);
  if (hits.length) { total += hits.length; console.log(hits.length + ' match(es) for ' + show + ':\n  ' + hits.slice(0, 5).join('\n  ')); }
}
console.log('infra grep: ' + pats.length + ' patterns from docs/AUDIT.md, ' + total + ' matches (excluding docs/AUDIT.md, docs/PROGRESS.md)');
process.exit(total ? 1 : 0);
