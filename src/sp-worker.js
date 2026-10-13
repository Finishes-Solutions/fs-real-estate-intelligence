// Site plan layouts off the page's main thread: a 300-acre plan can take half a minute to lay out, and the map has to
// keep moving meanwhile. Messages: { id, fn: 'options' | 'refit', args } -> { id, ok, result | error }.
import { layoutOptions, refit } from './lib/sitelayout.mjs';
self.onmessage = ({ data: { id, fn, args } }) => {
  try { self.postMessage({ id, ok: true, result: fn === 'refit' ? refit(...args) : layoutOptions(...args) }); }
  catch (e) { self.postMessage({ id, ok: false, error: e.message || String(e) }); }
};
