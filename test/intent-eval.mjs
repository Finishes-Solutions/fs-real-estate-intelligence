// Manual check of the rulebook: sends sample requests to the real model (same tools and prompt as the chat) and scores
// whether it picks the expected tool on its first turn. Not part of `npm test` (needs a key and costs a few cents).
//   OPENAI_API_KEY=sk-... node test/intent-eval.mjs            all cases
//   OPENAI_API_KEY=sk-... node test/intent-eval.mjs camera     only cases whose text matches "camera"
// Edit lib/rulebook.mjs, run again, compare the score.
import { respond, pickModel } from '../lib/openai.mjs';
import { responseTools, systemPrompt } from '../lib/agent-tools.mjs';

// [request, acceptable tools for the first call ('answer' = no tool call is fine), screen state]
const CARD = 'View: map; map centered 29.7858, -95.8245 (near Katy), zoom 16.2 (street level, 3D buildings visible)\nOpen card: filing TABS2025012345 "Katy Medical Plaza", 1200 Grand Pkwy, New, Medical, est. $12.4M, registered 2025-05-01, schedule 2025-07-01 to 2026-09-30, status Registered, developer Hines';
const MAP = 'View: map; map centered 29.9800, -95.7200 (near Waller), zoom 9.5 (city/county)\nFilings on screen: 412 of 1,156 matching, est. $2.1B';
const CASES = [
  ['zoom out a little', ['move_camera'], MAP],
  ['get closer', ['move_camera'], MAP],
  ['tilt the map so I can see the buildings', ['move_camera', 'set_map_options'], CARD],
  ['rotate left', ['move_camera'], CARD],
  ['stop spinning', ['move_camera', 'stop_orbit'], CARD],
  ['take me back to the whole region', ['move_camera', 'reset_map'], CARD],
  ['what am I looking at?', ['describe_view'], CARD],
  ['what street is this?', ['describe_view', 'location_info'], CARD],
  ['save a note here: vacant lot behind the H-E-B, call the broker Monday', ['add_site_note'], CARD],
  ['add a note at my location, for sale sign on the fence', ['add_site_note'], MAP],
  ['watch this project', ['watch'], CARD],
  ['stop watching this one', ['watch'], CARD],
  ["what's on our watchlist?", ['field_notes'], MAP],
  ['any notes tagged opportunity near Katy?', ['field_notes'], MAP],
  ['how far is this from me and what is the drive time?', ['distance_and_drive_time'], CARD],
  ['how is traffic getting to Katy right now?', ['distance_and_drive_time', 'set_live_layers'], MAP],
  ['turn on radar and wind', ['set_live_layers'], MAP],
  ['will it rain here this week?', ['weather_forecast'], CARD],
  ['how many medical filings are there in Waller County?', ['query_filings', 'summarize_filings'], MAP],
  ['show me multifamily projects over $10M on the map', ['filter_map'], MAP],
  ['highlight the Amazon warehouse in Katy', ['highlight_area'], MAP],
  ['outline Brookshire', ['highlight_area'], MAP],
  ['take me to downtown Houston and orbit it', ['fly_to'], MAP],
  ["what's the nearest gas station?", ['nearby_places'], CARD],
  ['who owns this building?', ['location_info'], CARD],
  ["what's the median income around here?", ['demographics'], CARD],
  ['any news about this developer?', ['project_news'], CARD],
  ['has work started on this site?', ['site_imagery'], CARD],
  ['chart filings by year', ['show_chart'], MAP],
  ['when was the data last updated?', ['data_sources'], MAP],
  ['thanks, that is helpful', ['answer'], MAP]
];

const key = process.env.OPENAI_API_KEY; if (!key) { console.error('Set OPENAI_API_KEY to run the intent eval.'); process.exit(1); }
const only = process.argv[2] ? new RegExp(process.argv[2], 'i') : null;
const model = await pickModel(key, process.env.OPENAI_CHAT_MODEL || process.env.OPENAI_MODEL);
const coverage = '1,156 filings in Waller, Harris, Fort Bend, Montgomery, Austin, Washington, Grimes counties, registered 2024-10-01 to 2026-10-01.';
let pass = 0, n = 0;
for (const [text, ok, screen] of CASES.filter(c => !only || only.test(c[0]) || c[1].some(t => only.test(t)))) {
  n++;
  try {
    const r = await respond({ key, model, tools: responseTools(), input: [{ role: 'user', content: text }], instructions: systemPrompt({ coverage, filters: 'none (default view)', screen }), maxTokens: 4000 });
    const got = r.calls.map(c => c.name), first = got[0] || 'answer', good = ok.includes(first);
    if (good) pass++;
    console.log((good ? 'PASS ' : 'FAIL ') + text.padEnd(70) + ' → ' + (got.join(', ') || 'answer: ' + (r.text || '').slice(0, 60)) + (good ? '' : '   (expected ' + ok.join(' or ') + ')'));
  } catch (e) { console.log('ERR  ' + text + ' → ' + e.message); }
}
console.log('\n' + pass + ' / ' + n + ' picked the expected tool (' + model + ')');
