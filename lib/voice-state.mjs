// Turn bookkeeping for the voice assistant (OpenAI Realtime over WebRTC, src/assistant.js). Pure: the browser passes in
// send() and the timers, so the tests can drive it with fake ones.
//
// The session runs with create_response off: the browser starts each reply once the transcript shows a real request.
// That left several ways for a turn to go quiet ("Listening…" and then nothing):
//   - two response.create calls for one turn (the no-transcript fallback, the transcript, tool results) -> the server
//     rejects the second with "conversation already has an active response";
//   - a response that failed (response.done status failed) was treated as finished;
//   - a response.create the server never acted on, or a reply that never finished, left the panel waiting forever.
// This keeps one reply in flight at a time, queues the rest, retries once on a failure or a missing start, and reports
// anything it gives up on through onStatus so the panel can say so.
export function createTurns({ send, onStatus = () => {}, log = () => {}, setTimer = setTimeout, clearTimer = clearTimeout,
  TRANSCRIPT_MS = 7000, CREATED_MS = 5000, STUCK_MS = 45000 } = {}) {
  let inFlight = false, queued = false, retried = false, createdT = 0, stuckT = 0;
  const items = new Map(); // audio item id -> { responded, t }
  const item = id => { let it = items.get(id); if (!it) { it = { responded: false, t: 0 }; items.set(id, it); if (items.size > 40) items.delete(items.keys().next().value); } return it; };
  function create(why) {
    if (inFlight) { queued = true; log('queued', why); return false; }
    inFlight = true; send({ type: 'response.create' }); log('response.create', why);
    clearTimer(createdT);
    createdT = setTimer(() => { // the server never started the reply
      inFlight = false;
      if (!retried) { retried = true; create('retry: no reply started'); } else { retried = false; queued = false; onStatus('noreply'); }
    }, CREATED_MS);
    return true;
  }
  return {
    get busy() { return inFlight; },
    // a turn of speech was committed: the transcript normally starts the reply; if the transcriber never answers, reply
    // from the audio itself
    committed(id) { const it = item(id); clearTimer(it.t); it.t = setTimer(() => { if (!it.responded) { it.responded = true; create('no transcript'); } }, TRANSCRIPT_MS); },
    // the transcript arrived: reply = true answers it, false drops the turn. A late transcript never answers twice.
    transcript(id, reply) { const it = item(id); clearTimer(it.t); if (!reply || it.responded) return false; it.responded = true; return create('transcript'); },
    // the reply started
    created() { clearTimer(createdT); inFlight = true; clearTimer(stuckT); stuckT = setTimer(() => { inFlight = false; queued = false; retried = false; onStatus('stuck'); }, STUCK_MS); },
    // the reply ended. Returns what happens next: 'retry', 'queued', 'tools' (run them, then call toolsDone), or the status.
    done(status, { calls = 0, error = '' } = {}) {
      clearTimer(createdT); clearTimer(stuckT); inFlight = false;
      if (status === 'failed') {
        if (!retried) { retried = true; queued = false; create('retry: reply failed'); return 'retry'; }
        retried = false; queued = false; onStatus('failed', error); return 'failed';
      }
      retried = false;
      if (calls) { queued = false; return 'tools'; } // the follow-up reply comes from toolsDone
      if (queued) { queued = false; create('queued'); return 'queued'; }
      return status || 'completed';
    },
    toolsDone() { return create('tool results'); },
    // the server said a reply is already running: wait for it, then send ours
    alreadyActive() { inFlight = true; queued = true; clearTimer(createdT); },
    reset() { clearTimer(createdT); clearTimer(stuckT); for (const it of items.values()) clearTimer(it.t); items.clear(); inFlight = queued = retried = false; }
  };
}

// a tool that hangs must not freeze the voice turn: after ms it answers with `value` instead
export function withTimeout(p, ms, value) {
  let t; return Promise.race([Promise.resolve(p), new Promise(r => { t = setTimeout(() => r(typeof value === 'function' ? value() : value), ms); })]).finally(() => clearTimeout(t));
}

// the last n voice events with timings, for Settings → Voice log (what happened when "it said listening and did nothing")
export function createVoiceLog(n = 200, now = () => Date.now()) {
  const rows = []; let t0 = 0;
  return {
    add(type, detail = '') { const t = now(); if (!t0) t0 = t; rows.push({ t, type, detail: String(detail).slice(0, 160) }); if (rows.length > n) rows.shift(); },
    list: () => rows.slice(),
    text: () => rows.map(r => new Date(r.t).toISOString().slice(11, 23) + '  ' + r.type + (r.detail ? '  ' + r.detail : '')).join('\n'),
    clear() { rows.length = 0; t0 = 0; }
  };
}
