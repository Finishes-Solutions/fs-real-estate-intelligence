// Loads the committed data files bundled with the functions (see vercel.json includeFiles). Cached per instance.
import fs from 'node:fs/promises';
import path from 'node:path';
import { recentChanges } from '../../lib/changes.mjs';

const cache = {};
export async function load(name) {
  if (!cache[name]) cache[name] = fs.readFile(path.join(process.cwd(), process.env.DATA_DIR || 'data', name), 'utf8').then(JSON.parse).catch(e => { delete cache[name]; throw e; });
  return cache[name];
}
export async function changedMap() {
  return recentChanges(await load('changes.json').catch(() => null));
}
