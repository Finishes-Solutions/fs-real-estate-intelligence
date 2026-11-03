// Site plan layouts off the page's main thread: a 300-acre plan can take half a minute to lay out, and the map has to
// keep moving meanwhile. Messages: { id, fn: 'options' | 'run' | 'refit' | 'pods' | 'net', args } -> { id, ok, result | error }.
// 'run': Build's layouts as saved, replayable runs with their independent check (lib/layoutrun.mjs runPlan).
import { layoutOptions, refit, relayPods, netEdit } from './lib/sitelayout.mjs';
import { runPlan } from './lib/layoutrun.mjs';
self.onmessage = ({ data: { id, fn, args } }) => {
  try { self.postMessage({ id, ok: true, result: fn === 'run' ? runPlan(...args) : fn === 'refit' ? refit(...args) : fn === 'pods' ? relayPods(...args) : fn === 'net' ? netEdit(...args) : layoutOptions(...args) }); }
  catch (e) { self.postMessage({ id, ok: false, error: e.message || String(e) }); }
};
