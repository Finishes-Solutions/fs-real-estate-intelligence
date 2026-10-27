// Loads the committed data files bundled with the functions (see vercel.json includeFiles). Cached per instance.
import fs from 'node:fs/promises';
import path from 'node:path';
import { recentChanges } from '../../lib/changes.mjs';
import { marketContext } from '../../lib/feasibility/market.mjs';

const cache = {};
export async function load(name) {
  if (!cache[name]) cache[name] = fs.readFile(path.join(process.cwd(), process.env.DATA_DIR || 'data', name), 'utf8').then(JSON.parse).catch(e => { delete cache[name]; throw e; });
  return cache[name];
}
export async function changedMap() {
  return recentChanges(await load('changes.json').catch(() => null));
}
// the platform's market facts for a feasibility study (rates, PPI, ZORI: lib/feasibility/market.mjs); a missing file is
// left out, never a guess
export async function market() {
  const [area, markets] = await Promise.all([load('area.json').catch(() => null), load('markets.json').catch(() => null)]);
  return marketContext({ area, markets });
}
