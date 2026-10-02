// Tools the AI assistant can use on the map. Shared by the text chat (/api/chat) and the voice session
// (/api/realtime); the browser executes every call (src/assistant.js) against the filings it has loaded.
import { USES } from './taxonomy.mjs';

const str = (description, extra = {}) => ({ type: 'string', description, ...extra });
const num = description => ({ type: 'number', description });
const strs = (description, items = { type: 'string' }) => ({ type: 'array', items, description });

const FILTERS = {
  counties: strs('Counties to include (names as given in the context). Omit for all loaded counties.'),
  types: strs('Project types.', { type: 'string', enum: ['New', 'Reno', 'Addition'] }),
  uses: strs('Real estate uses.', { type: 'string', enum: USES }),
  min_value: num('Minimum estimated value in USD (e.g. 5000000 for $5M).'),
  max_value: num('Maximum estimated value in USD.'),
  keywords: str('Words to match in project name, owner, tenant, address or scope (brands like "H-E-B", project names).'),
  developer: str('Developer / owner company name.'),
  period: str('Registration period preset.', { enum: ['3m', '12m', '2y', '5y', 'all'] }),
  date_field: str('Custom date filter: reg = registered/filed, start = starting, active = under construction during the range.', { enum: ['reg', 'start', 'active'] }),
  date_from: str('YYYY-MM'), date_to: str('YYYY-MM'),
  near_place: str('A Texas place, address or landmark to search around.'),
  radius_miles: num('Radius around near_place in miles (default 5).'),
  changed: str('ONLY when the user asks what is new or changed recently: filings new or changed in the latest weekly update.', { enum: ['new', 'any'] })
};

export const TOOLS = [
  { name: 'filter_map', description: 'Set the map filters so only matching filings are shown (map, list, timeline and charts all update), then return a summary of what matches: count, total value, breakdowns and the largest filings. Use for any request to show, find or narrow down filings.',
    parameters: { type: 'object', additionalProperties: false, properties: { ...FILTERS, keep_current: { type: 'boolean', description: 'true to refine the filters already on the map; false (default) to start from scratch.' } } } },
  { name: 'query_filings', description: 'Answer a question from the loaded filings WITHOUT changing the map: returns matching rows (sorted) or grouped totals. Use for counts, rankings, comparisons and lookups.',
    parameters: { type: 'object', additionalProperties: false, properties: { ...FILTERS,
      group_by: str('Return totals grouped by this field instead of rows.', { enum: ['county', 'city', 'use', 'type', 'developer', 'month', 'year', 'status'] }),
      sort: str('Row order.', { enum: ['value', 'newest', 'oldest', 'start'] }), limit: num('Max rows or groups (default 10, max 25).') } } },
  { name: 'highlight_filings', description: 'Highlight specific filings on the map with a pulsing ring and zoom to them. Use after finding filings the user should look at.',
    parameters: { type: 'object', additionalProperties: false, required: ['ids'], properties: { ids: strs('TABS project numbers, e.g. TABS2025012345.'), label: str('Short caption shown on the map.') } } },
  { name: 'open_filing', description: 'Open the detail card for one filing and zoom to it.',
    parameters: { type: 'object', additionalProperties: false, required: ['id'], properties: { id: str('TABS project number.') } } },
  { name: 'fly_to', description: 'Move the map to filings, a place the user describes (address, landmark, neighborhood, city) or coordinates; set orbit to circle the camera around it in 3D. To go to or orbit filings you found, opened or highlighted, pass their ids (or highlighted: true) — never their street or city name. With no target it uses the open card. The zoom is chosen from what the target is (one building is close up), so usually leave zoom out.',
    parameters: { type: 'object', additionalProperties: false, properties: {
      id: str('One TABS project number to go to.'), ids: strs('Several TABS project numbers to frame together.'), highlighted: { type: 'boolean', description: 'Go to the filings currently highlighted on the map.' },
      place: str('Address, landmark or place in Texas. For a venue use its official current name plus city, e.g. "Daikin Park, Houston" for the Astros stadium.'), lat: num('Latitude'), lon: num('Longitude'),
      zoom: num('Only to override: 18 one building, 17 landmark or block, 14.5 neighborhood, 11.5 city, 9.5 county, 6 region.'), orbit: { type: 'boolean', description: 'Slowly circle the camera around the target (tilted 3D view).' }, tilt: { type: 'boolean', description: 'Tilt to a 3D view.' } } } },
  { name: 'highlight_area', description: 'Outline a place on the map: a city or town, county, neighborhood, ZIP code, a whole road (e.g. "Grand Parkway", "FM 1463") or a specific building / address / landmark. Returns how many filings (with the current filters) are inside, or within a quarter mile of a road or building. Optionally filter the map to the area or add it to Compare.',
    parameters: { type: 'object', additionalProperties: false, required: ['place'], properties: {
      place: str('The place in Texas, as specific as possible: "Katy", "Fort Bend County", "Grand Parkway", "1004 Priya Ln, Waller", "Daikin Park, Houston".'),
      kind: str('What it is, if known.', { enum: ['auto', 'town', 'county', 'area', 'road', 'building'] }),
      filter: { type: 'boolean', description: 'Also filter the map and list to filings inside the area (towns, counties, neighborhoods).' },
      compare: { type: 'boolean', description: 'Also add the area to the Compare tab.' } } } },
  { name: 'compare_areas', description: 'Compare up to 4 areas side by side (filings, value, new builds, averages, uses, trends, largest projects) in the Compare tab. Areas can be towns, counties, neighborhoods or ZIP codes. Returns each area\'s key numbers.',
    parameters: { type: 'object', additionalProperties: false, required: ['places'], properties: {
      places: strs('2 to 4 places, e.g. ["Katy", "Fulshear", "Cypress"].'), replace: { type: 'boolean', description: 'true (default) to clear the areas already in Compare first.' } } } },
  { name: 'stop_orbit', description: 'Stop the orbiting camera.', parameters: { type: 'object', additionalProperties: false, properties: {} } },
  { name: 'set_map_options', description: 'Change how the map looks.',
    parameters: { type: 'object', additionalProperties: false, properties: {
      heatmap: str('Activity heatmap.', { enum: ['off', 'count', 'value'] }), show_filings: { type: 'boolean', description: 'Show or hide the filing dots.' }, size_by_value: { type: 'boolean', description: 'Size dots by estimated value (false = all dots the same size).' },
      basemap: str('Base map.', { enum: ['dots', 'streets', 'sat', 'topo'] }), tilt: { type: 'boolean', description: 'Tilt to 3D.' },
      demographics: str('Census tract overlay.', { enum: ['off', 'gr', 'pop', 'inc', 'val', 'rent', 'vacr'] }) } } },
  { name: 'show_view', description: 'Switch the main view.',
    parameters: { type: 'object', additionalProperties: false, required: ['view'], properties: { view: str('map, timeline (construction schedule chart), compare (areas side by side), who (developers/architects/GCs ranking) or changes (what changed).', { enum: ['map', 'timeline', 'compare', 'who', 'changes'] }) } } },
  { name: 'reset_map', description: 'Clear all filters, highlights and selections (back to the default view).', parameters: { type: 'object', additionalProperties: false, properties: {} } }
];

// Responses and Realtime both take flat function tools. Responses defaults to strict schemas, which make every
// field required, so the model filled all filters (every use, $0–$1T, changed this week): turn strict off there.
export const realtimeTools = () => TOOLS.map(t => ({ type: 'function', ...t }));
export const responseTools = () => TOOLS.map(t => ({ type: 'function', ...t, strict: false }));

export function systemPrompt(ctx = {}) {
  return `You are the real estate intelligence assistant inside Finishes Solutions' construction map. Finishes Solutions is a fully integrated Texas real estate developer and operator; the user is on their team.
The data is Texas TDLR TABS accessibility registrations: every commercial / public construction project over $50K must register, so it is an early signal of what is being built, by whom, where and when. Each filing has: id (TABS number), name, county, city, address, type (New / Reno = renovation / Addition), AI-tagged use, subtype, tenant, developer, architect, GC, units, estimated value (filer estimate, USD), sq ft, registration date, estimated start and end, status.
Today is ${new Date().toISOString().slice(0, 10)}.${ctx.coverage ? '\nLoaded: ' + ctx.coverage : ''}${ctx.filters ? '\nCurrent map filters: ' + ctx.filters : ''}${ctx.screen ? '\nWhat the user is looking at right now:\n' + ctx.screen : ''}
How to work:
- Use the tools to act on the map: filter_map to show things, highlight_filings to point at specific projects, open_filing for one project, fly_to to take the user anywhere they describe (with orbit when they ask to circle or orbit). query_filings answers questions without changing the map.
- Set only the filters the user asked for and leave every other field out: no use list unless they named uses, no max value unless they gave one, no "changed" filter unless they asked what is new or changed.
- To outline or "highlight" a city, county, neighborhood, road or building, use highlight_area (highlight_filings is only for filings). To compare places, use compare_areas.
- To move to or orbit filings, call fly_to with their ids (or highlighted: true), not their address. If fly_to returns an error for a place, try once with the official name and city or an address, otherwise ask the user.
- Resolve "this", "here", "these", "around me", "the one I clicked" and "what I'm looking at" from what the user is looking at right now (open card, map center, filings in view).
- Base every number and name on tool results. Never invent filings, companies or values. If the data can't answer, say so and say what it can show.
- Keep replies short and conversational: 1–4 sentences or a tight list. Money is an estimate: write "est. $4.2M". Cite filings by id in square brackets, e.g. [TABS2025012345].
- Uses and developers are AI-tagged from filing text and can be wrong; owners are often single-asset LLCs.`;
}

export const VOICE_STYLE = '\nYou are speaking out loud: answer in one or two short spoken sentences, say numbers naturally ("about four point two million"), and do not read out TABS ids unless asked. Act on the map with tools while you talk. The user is in the Houston area: "Cyprus" means Cypress, TX. If you misheard a place or company name, ask once rather than guess. Ignore background talk, filler and fragments that are not a request to you: stay silent rather than answer them.';
