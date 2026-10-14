// Reading our own API from the browser. A function that runs out of time (or crashes) is answered by Vercel itself with a
// plain-text page ("An error occurred with your deployment ... FUNCTION_INVOCATION_TIMEOUT"), not our JSON, so r.json()
// would fail with "Unexpected token 'A'". fetchJSON reads the text, parses it when it is JSON, and otherwise throws a
// message a person can act on. JSON error bodies keep their own { error } message.
export function httpMessage(status, text = '') {
  if (status === 504 || /TIMEOUT|timed out/i.test(text)) return 'The server took too long on this area. Try again (a second run is usually faster) or pick a smaller area.';
  if (status === 413 || /PAYLOAD_TOO_LARGE/i.test(text)) return 'That area outline is too detailed to send. Try a simpler shape.';
  if (status === 429) return 'Too many requests. Try again in a minute.';
  if (!status) return 'Could not reach the server. Check the connection and try again.';
  return 'The server had a problem (' + status + '). Try again.';
}
export async function readJSON(r) {
  const text = await r.text();
  let d; try { d = text ? JSON.parse(text) : null; } catch (e) { d = undefined; }
  if (d === undefined) throw Object.assign(new Error(httpMessage(r.status, text)), { status: r.status });
  if (!r.ok) throw Object.assign(new Error((d && typeof d.error === 'string' && d.error) || httpMessage(r.status)), { status: r.status, body: d });
  return d;
}
// fetch + readJSON; a network failure (offline, aborted) keeps its own message
export async function fetchJSON(url, opts) {
  let r; try { r = await fetch(url, opts); } catch (e) { if (e?.name === 'AbortError' || e?.name === 'TimeoutError') throw e; throw new Error(httpMessage(0)); }
  return readJSON(r);
}
