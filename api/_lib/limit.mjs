// at most n of the calls at a time (the state and federal services the reports read are shared and can throttle)
export function limiter(n) {
  let active = 0; const q = [];
  const next = () => { if (active >= n || !q.length) return; active++; const [fn, ok, no] = q.shift(); Promise.resolve().then(fn).then(ok, no).finally(() => { active--; next(); }); };
  return fn => new Promise((ok, no) => { q.push([fn, ok, no]); next(); });
}
