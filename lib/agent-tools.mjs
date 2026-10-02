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
  { name: 'fly_to', description: 'Move the map to a place (city, address, landmark) or coordinates.',
    parameters: { type: 'object', additionalProperties: false, properties: { place: str('Place name or address in Texas.'), lat: num('Latitude'), lon: num('Longitude'), zoom: num('Zoom 5 (region) to 17 (building). Default 12.') } } },
  { name: 'set_map_options', description: 'Change how the map looks.',
    parameters: { type: 'object', additionalProperties: false, properties: {
      heatmap: str('Activity heatmap.', { enum: ['off', 'count', 'value'] }), size_by_value: { type: 'boolean', description: 'Size dots by estimated value (false = all dots the same size).' },
      basemap: str('Base map.', { enum: ['dots', 'streets', 'sat', 'topo'] }), tilt: { type: 'boolean', description: 'Tilt to 3D.' },
      demographics: str('Census tract overlay.', { enum: ['off', 'gr', 'pop', 'inc', 'val', 'rent', 'vacr'] }) } } },
  { name: 'show_view', description: 'Switch the main view.',
    parameters: { type: 'object', additionalProperties: false, required: ['view'], properties: { view: str('map, timeline (construction schedule chart), who (developers/architects/GCs ranking) or changes (what changed).', { enum: ['map', 'timeline', 'who', 'changes'] }) } } },
  { name: 'reset_map', description: 'Clear all filters, highlights and selections (back to the default view).', parameters: { type: 'object', additionalProperties: false, properties: {} } }
];

// Chat Completions wants { type, function: { name, description, parameters } }; Realtime wants them flat.
export const chatTools = () => TOOLS.map(t => ({ type: 'function', function: t }));
export const realtimeTools = () => TOOLS.map(t => ({ type: 'function', ...t }));

export function systemPrompt(ctx = {}) {
  return `You are the real estate intelligence assistant inside Finishes Solutions' construction map. Finishes Solutions is a fully integrated Texas real estate developer and operator; the user is on their team.
The data is Texas TDLR TABS accessibility registrations: every commercial / public construction project over $50K must register, so it is an early signal of what is being built, by whom, where and when. Each filing has: id (TABS number), name, county, city, address, type (New / Reno = renovation / Addition), AI-tagged use, subtype, tenant, developer, architect, GC, units, estimated value (filer estimate, USD), sq ft, registration date, estimated start and end, status.
Today is ${new Date().toISOString().slice(0, 10)}.${ctx.coverage ? '\nLoaded: ' + ctx.coverage : ''}${ctx.filters ? '\nCurrent map filters: ' + ctx.filters : ''}
How to work:
- Use the tools to act on the map: filter_map to show things, highlight_filings to point at specific projects, open_filing for one project, fly_to for places. query_filings answers questions without changing the map.
- Base every number and name on tool results. Never invent filings, companies or values. If the data can't answer, say so and say what it can show.
- Keep replies short and conversational: 1–4 sentences or a tight list. Money is an estimate: write "est. $4.2M". Cite filings by id in square brackets, e.g. [TABS2025012345].
- Uses and developers are AI-tagged from filing text and can be wrong; owners are often single-asset LLCs.`;
}
