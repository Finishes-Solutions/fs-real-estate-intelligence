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
  changed: str('Only filings that are new or changed in the last week.', { enum: ['new', 'any'] })
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
  { name: 'fly_to', description: 'Move the map to a place the user describes (city, neighborhood, address, landmark, intersection) or coordinates. Set orbit to circle the camera around it in 3D (buildings show from zoom 14).',
    parameters: { type: 'object', additionalProperties: false, properties: { place: str('Place name, landmark or address in Texas.'), lat: num('Latitude'), lon: num('Longitude'),
      zoom: num('Zoom 5 (region), 10 (city), 13 (neighborhood), 15.5 (blocks), 17 (building). Default 12, or 15.5 when orbiting.'), orbit: { type: 'boolean', description: 'Slowly circle the camera around the place (tilted 3D view).' }, tilt: { type: 'boolean', description: 'Tilt to a 3D view.' } } } },
  { name: 'stop_orbit', description: 'Stop the orbiting camera.', parameters: { type: 'object', additionalProperties: false, properties: {} } },
  { name: 'set_map_options', description: 'Change how the map looks.',
    parameters: { type: 'object', additionalProperties: false, properties: {
      heatmap: str('Activity heatmap.', { enum: ['off', 'count', 'value'] }), show_filings: { type: 'boolean', description: 'Show or hide the filing dots.' }, size_by_value: { type: 'boolean', description: 'Size dots by estimated value (false = all dots the same size).' },
      basemap: str('Base map: dots (dot grid), streets, sat (MapTiler satellite with labels), topo, esri (Esri World Imagery satellite), free (OpenFreeMap streets).', { enum: ['dots', 'streets', 'sat', 'topo', 'esri', 'free'] }), tilt: { type: 'boolean', description: 'Tilt to 3D.' },
      demographics: str('Census tract overlay.', { enum: ['off', 'gr', 'pop', 'inc', 'val', 'rent', 'vacr'] }) } } },
  { name: 'distance_and_drive_time', description: 'How far a property is and how long the drive takes right now. Straight-line miles plus road miles and minutes; with live traffic when the server has it (also the usual time and the traffic delay). Draws the route on the map. Use for "how far is this from me", "what is the drive time", "how is traffic getting there". By default it measures from the user\'s current GPS location to the property whose card is open.',
    parameters: { type: 'object', additionalProperties: false, properties: {
      target: str('What to measure to: selected = the filing or building card that is open (default; "this", "this property", "here"), nearest_filing = the filing closest to the user, filing = filing_id, place = to_place.', { enum: ['selected', 'nearest_filing', 'filing', 'place'] }),
      filing_id: str('TABS number when target is filing.'), to_place: str('Destination place or address when target is place.'),
      from_place: str('Start somewhere other than the user\'s location (place, address or landmark).'), show_route: { type: 'boolean', description: 'Draw the route on the map (default true).' } } } },
  { name: 'set_live_layers', description: 'Turn live map overlays on or off: weather radar, lightning, satellite clouds (infrared), wind arrows, hurricanes / tropical storms (NHC cones and tracks), live traffic, 3D terrain, NASA recent satellite imagery. Only include the layers to change.',
    parameters: { type: 'object', additionalProperties: false, properties: {
      radar: { type: 'boolean' }, lightning: { type: 'boolean' }, clouds: { type: 'boolean' }, wind: { type: 'boolean' }, storms: { type: 'boolean' }, traffic: { type: 'boolean' }, terrain: { type: 'boolean' },
      nasa_imagery: { type: 'boolean', description: 'NASA HLS (Landsat / Sentinel-2, 30 m) imagery for the most recent clear day over the map view.' }, all_off: { type: 'boolean', description: 'Turn every live layer off.' } } } },
  { name: 'weather_at', description: 'Current weather and today / tomorrow forecast (temperature, rain chance, wind and gusts) at the open property, the user\'s location or a named place. Also lists any active hurricanes or tropical storms and how far they are.',
    parameters: { type: 'object', additionalProperties: false, properties: { where: str('selected (default when a card is open), me (user location) or place.', { enum: ['selected', 'me', 'place'] }), place: str('Place when where is place.') } } },
  { name: 'project_news', description: 'Recent news articles (last ~3 months, GDELT) about a filing\'s developer, tenant or project, or about any company or place. Returns titles, outlets, dates and links.',
    parameters: { type: 'object', additionalProperties: false, properties: { filing_id: str('TABS number; omit to use the open filing.'), query: str('Company, project or topic to search instead.'), near: str('Town to narrow the search, e.g. Katy.') } } },
  { name: 'site_imagery', description: 'Find recent clear NASA satellite passes (HLS Landsat / Sentinel-2, 30 m, last 60 days) over a filing or the open property and show the newest clear one on the map. Good for "has work started", "is the land cleared". 30 m pixels show clearing, pads and large roofs, not small detail.',
    parameters: { type: 'object', additionalProperties: false, properties: { filing_id: str('TABS number; omit to use the open filing or building.'), date: str('YYYY-MM-DD to show a specific pass from the list.') } } },
  { name: 'show_view', description: 'Switch the main view.',
    parameters: { type: 'object', additionalProperties: false, required: ['view'], properties: { view: str('map, timeline (construction schedule chart), who (developers/architects/GCs ranking) or changes (what changed).', { enum: ['map', 'timeline', 'who', 'changes'] }) } } },
  { name: 'reset_map', description: 'Clear all filters, highlights and selections (back to the default view).', parameters: { type: 'object', additionalProperties: false, properties: {} } }
];

// Responses and Realtime both take flat function tools.
export const realtimeTools = () => TOOLS.map(t => ({ type: 'function', ...t }));

export function systemPrompt(ctx = {}) {
  return `You are the real estate intelligence assistant inside Finishes Solutions' construction map. Finishes Solutions is a fully integrated Texas real estate developer and operator; the user is on their team.
The data is Texas TDLR TABS accessibility registrations: every commercial / public construction project over $50K must register, so it is an early signal of what is being built, by whom, where and when. Each filing has: id (TABS number), name, county, city, address, type (New / Reno = renovation / Addition), AI-tagged use, subtype, tenant, developer, architect, GC, units, estimated value (filer estimate, USD), sq ft, registration date, estimated start and end, status.
Today is ${new Date().toISOString().slice(0, 10)}.${ctx.coverage ? '\nLoaded: ' + ctx.coverage : ''}${ctx.filters ? '\nCurrent map filters: ' + ctx.filters : ''}
How to work:
- Use the tools to act on the map: filter_map to show things, highlight_filings to point at specific projects, open_filing for one project, fly_to to take the user anywhere they describe (with orbit when they ask to circle or orbit). query_filings answers questions without changing the map.
- Base every number and name on tool results. Never invent filings, companies or values. If the data can't answer, say so and say what it can show.
- Keep replies short and conversational: 1–4 sentences or a tight list. Money is an estimate: write "est. $4.2M". Cite filings by id in square brackets, e.g. [TABS2025012345].
- "This", "this property", "here" mean the filing or building card that is open; "me" / "my location" means the user's GPS location. For distance, drive time or traffic use distance_and_drive_time; say whether the time includes live traffic (the tool says so).
- For weather questions use weather_at; to show weather, wind, radar, lightning, hurricanes, traffic or terrain on the map use set_live_layers.
- Uses and developers are AI-tagged from filing text and can be wrong; owners are often single-asset LLCs.`;
}
