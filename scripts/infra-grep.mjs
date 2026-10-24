// @ts-check
// The infrastructure-isolation check (CLAUDE.md, "Infrastructure isolation"): greps every tracked file on the branch for
// the source repos' domains, hosts, project and resource names, bucket and board ids, hook ids and env var names. The
// patterns are read from docs/AUDIT.md (the two "Grep patterns" lists of the Infrastructure inventory), so this script
// holds none of them itself. Must print zero matches.
//   node scripts/infra-grep.mjs
// Excluded files: docs/AUDIT.md and docs/PROGRESS.md (they name the identifiers on purpose: the inventory, and this
// check's own output). Two documented exceptions (docs/DECISIONS.md, Phase 5):
//   - ANTHROPIC_EFFORT is this platform's own variable, on main before the integration began;
//   - fs-budgeting-suite is also the source repo's name, which provenance comments and docs must name: it is checked
//     only where it would name the database (a connection string or host), not as plain text.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const root = new URL('..', import.meta.url).pathname;
const audit = readFileSync(root + 'docs/AUDIT.md', 'utf8');
const lists = [...audit.matchAll(/### 8\. Grep patterns[^\n]*\n[\s\S]*?```\n([\s\S]*?)```/g)].map(m => m[1]);
if (lists.length !== 2) { console.error('expected two pattern lists in docs/AUDIT.md, found ' + lists.length); process.exit(2); }
const OWN = new Set(['ANTHROPIC_EFFORT']);
const pats = [];
for (const line of lists.join('\n').split('\n')) {
  const t = line.replace(/\s+\(regex:.*$/, '').trim(); if (!t || t.startsWith('#')) continue;
  if (OWN.has(t)) continue;
  if (t === 'fs-budgeting-suite') { pats.push({ p: '(Initial Catalog|Database|database)\\s*[=:]\\s*fs-budgeting-suite|fs-budgeting-suite\\.(database|azure)', regex: true, show: 'fs-budgeting-suite (as a database name)' }); continue; }
  const regex = /\\b|\[a-z|\{|\\\(/.test(t); // (the lists mark regexes with \b, character classes or quantifiers)
  pats.push({ p: t, regex, show: t });
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
