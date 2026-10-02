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
  near_place: str('A place, address or landmark to search around (filings are in Texas).'),
  radius_miles: num('Radius around near_place in miles (default 5).'),
  status: strs('TDLR project status.', { type: 'string', enum: ['Registered', 'Review complete', 'Inspection complete', 'Closed'] }),
  sqft_min: num('Minimum square feet filed.'), sqft_max: num('Maximum square feet filed.'),
  company: str('Words to match in the developer, owner, architect or general contractor names only (not project names or addresses).'),
  exact_only: { type: 'boolean', description: 'Only filings located at an exact address (hide ones placed at a town center or along a street).' },
  min_units: num('Minimum housing units (1 = any filing with units).'),
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
      place: str('Address, landmark or place anywhere in the world. Add the city, state or country when it is outside Texas ("Lyon, France", "Eiffel Tower, Paris"). For a venue use its official current name plus city, e.g. "Daikin Park, Houston" for the Astros stadium.'), lat: num('Latitude'), lon: num('Longitude'),
      zoom: num('Only to override: 18 one building, 17 landmark or block, 14.5 neighborhood, 11.5 city, 9.5 county, 6 region.'), orbit: { type: 'boolean', description: 'Slowly circle the camera around the target (tilted 3D view).' }, tilt: { type: 'boolean', description: 'Tilt to a 3D view.' } } } },
  { name: 'highlight_area', description: 'Outline a place on the map: a city or town, county, neighborhood, ZIP code, a whole road (e.g. "Grand Parkway", "FM 1463") or a specific building / address / landmark. Returns how many filings (with the current filters) are inside, or within a quarter mile of a road or building. Optionally filter the map to the area or add it to Compare.',
    parameters: { type: 'object', additionalProperties: false, required: ['place'], properties: {
      place: str('The place, as specific as possible: "Katy", "Fort Bend County", "Grand Parkway", "1004 Priya Ln, Waller", "Daikin Park, Houston"; outside Texas add the country or state ("Bavaria, Germany").'),
      kind: str('What it is, if known.', { enum: ['auto', 'town', 'county', 'area', 'road', 'building'] }),
      filter: { type: 'boolean', description: 'Also filter the map and list to filings inside the area (towns, counties, neighborhoods).' },
      compare: { type: 'boolean', description: 'Also add the area to the Compare tab.' } } } },
  { name: 'compare_areas', description: 'Compare up to 4 areas side by side (filings, value, new builds, averages, uses, trends, largest projects) in the Compare tab. Areas can be towns, counties, neighborhoods or ZIP codes. Returns each area\'s key numbers.',
    parameters: { type: 'object', additionalProperties: false, required: ['places'], properties: {
      places: strs('2 to 4 places, e.g. ["Katy", "Fulshear", "Cypress"].'), replace: { type: 'boolean', description: 'true (default) to clear the areas already in Compare first.' } } } },
  { name: 'nearby_places', description: 'Find the nearest places of a kind (airport, restaurant, coffee, gas station, EV charging, grocery, hospital, urgent care, pharmacy, school, college, hotel, bank, park, gym, hardware store, shopping center, police, fire station, transit station, highway entrance, rail line, water/sewer plant, substation, daycare, self-storage, or a brand / business name like "Buc-ee\'s") from OpenStreetMap, sorted by straight-line distance, and show them on the map. Measures from the open card by default, or from a filing, a place, the user\'s location or coordinates.',
    parameters: { type: 'object', additionalProperties: false, required: ['what'], properties: {
      what: str('What to look for: a category ("airport", "gas station", "restaurant") or a brand / name.'),
      near: str('Where to measure from: "here" (open card, else map center), "me" (the user\'s GPS location), or a place / address (anywhere; add the country outside the US).'),
      id: str('Measure from this filing (TABS number).'), lat: num('Latitude to measure from.'), lon: num('Longitude to measure from.'),
      limit: num('How many (default 5, max 10).') } } },
  { name: 'stop_orbit', description: 'Stop the orbiting camera.', parameters: { type: 'object', additionalProperties: false, properties: {} } },
  { name: 'set_map_options', description: 'Change how the map looks.',
    parameters: { type: 'object', additionalProperties: false, properties: {
      heatmap: str('Activity heatmap.', { enum: ['off', 'count', 'value'] }), show_filings: { type: 'boolean', description: 'Show or hide the filing dots.' }, size_by_value: { type: 'boolean', description: 'Size dots by estimated value (false = all dots the same size).' },
      basemap: str('Base map: dots (the "Default" button: dot grid), streets, sat (MapTiler satellite with labels), topo, esri (the "ESRI" button: Esri World Imagery satellite), free (OpenFreeMap streets).', { enum: ['dots', 'streets', 'sat', 'topo', 'esri', 'free'] }), tilt: { type: 'boolean', description: 'Tilt to 3D.' },
      demographics: str('Census tract overlay.', { enum: ['off', 'gr', 'pop', 'inc', 'val', 'rent', 'vacr'] }) } } },
  { name: 'distance_and_drive_time', description: 'How far a property is and how long the drive takes right now. Straight-line miles plus road miles and minutes; with live traffic when the server has it (also the usual time and the traffic delay). Draws the route on the map. Use for "how far is this from me", "what is the drive time", "how is traffic getting there". By default it measures from the user\'s current GPS location to the property whose card is open.',
    parameters: { type: 'object', additionalProperties: false, properties: {
      target: str('What to measure to: selected = the filing or building card that is open (default; "this", "this property", "here"), nearest_filing = the filing closest to the user, filing = filing_id, place = to_place.', { enum: ['selected', 'nearest_filing', 'filing', 'place'] }),
      filing_id: str('TABS number when target is filing.'), to_place: str('Destination place or address when target is place.'),
      from_place: str('Start somewhere other than the user\'s location (place, address or landmark).'), show_route: { type: 'boolean', description: 'Draw the route on the map (default true).' } } } },
  { name: 'set_live_layers', description: 'Turn live map overlays on or off: weather radar, lightning, satellite clouds (infrared), wind arrows, hurricanes / tropical storms (NHC cones and tracks), live traffic, 3D terrain, NASA recent satellite imagery, live planes (aircraft, anywhere) and low flight paths (30-day history of aircraft below 3,000 ft). Only include the layers to change.',
    parameters: { type: 'object', additionalProperties: false, properties: {
      radar: { type: 'boolean' }, lightning: { type: 'boolean' }, clouds: { type: 'boolean' }, wind: { type: 'boolean' }, storms: { type: 'boolean' }, traffic: { type: 'boolean' }, terrain: { type: 'boolean' },
      nasa_imagery: { type: 'boolean', description: 'NASA HLS (Landsat / Sentinel-2, 30 m) imagery for the most recent clear day over the map view.' },
      planes: { type: 'boolean', description: 'Live aircraft on the map (ADS-B, refreshed every 10 s; zoom 5+).' }, flight_paths: { type: 'boolean', description: 'Low Flight Paths: where aircraft fly below 3,000 ft, last 30 days.' }, all_off: { type: 'boolean', description: 'Turn every live layer off.' } } } },
  { name: 'weather_at', description: 'Current weather and today / tomorrow forecast (temperature, rain chance, wind and gusts) at the open property, the user\'s location or a named place. Also lists any active hurricanes or tropical storms and how far they are.',
    parameters: { type: 'object', additionalProperties: false, properties: { where: str('selected (default when a card is open), me (user location) or place.', { enum: ['selected', 'me', 'place'] }), place: str('Place when where is place.') } } },
  { name: 'weather_forecast', description: 'The daily forecast for the next 7 days (or fewer) at the open property, the user\'s location or a named place: conditions, high and low, chance and amount of rain, wind and gusts. Shows a forecast card in the chat. Use for "forecast", "this week", "next few days", "will it rain on Friday".',
    parameters: { type: 'object', additionalProperties: false, properties: { where: str('selected (default when a card is open), me (user location) or place.', { enum: ['selected', 'me', 'place'] }), place: str('Place when where is place.'), days: num('How many days, 1 to 7 (default 7).') } } },
  { name: 'project_news', description: 'Recent news articles (about the last year, Google News with GDELT as fallback) about a filing\'s developer, tenant or project, or about any company or place. Returns titles, outlets, dates and links.',
    parameters: { type: 'object', additionalProperties: false, properties: { filing_id: str('TABS number; omit to use the open filing.'), query: str('Company, project or topic to search instead.'), near: str('Town to narrow the search, e.g. Katy.') } } },
  { name: 'site_imagery', description: 'Find site imagery for a filing or the open property and show it as preview images in the card: dated high-res aerial versions (Esri World Imagery archive and USDA NAIP, sub-metre, months to years old; good for buildings, parking, equipment) plus recent clear NASA satellite passes (HLS Landsat / Sentinel-2, 30 m, last 60 days; good for "has work started"). It only switches the map to the imagery when show_on_map is true (the user asked to see it on the map). Good for "has work started", "is the land cleared". 30 m pixels show clearing, pads and large roofs, not small detail.',
    parameters: { type: 'object', additionalProperties: false, properties: { filing_id: str('TABS number; omit to use the open filing or building.'), date: str('YYYY-MM-DD to show a specific pass from the list.'), show_on_map: { type: 'boolean', description: 'Also switch the map to that NASA pass. Only when the user asks to see it on the map.' } } } },
  { name: 'show_view', description: 'Switch the main view.',
    parameters: { type: 'object', additionalProperties: false, required: ['view'], properties: { view: str('map, timeline (construction schedule chart), compare (areas side by side), who (developers/architects/GCs ranking), changes (what changed) or market (jobs, housing permits, new businesses and local development news per county) or reports (export reports and see past exports).', { enum: ['map', 'timeline', 'compare', 'who', 'changes', 'market', 'reports'] }) } } },
  { name: 'web_search', description: 'Search the internet and get a short sourced answer. ONLY call this when the user explicitly asks you to search, look something up online, check the web or Google it (e.g. "look up how tall this tower is", "search the web for…"). Also call it for current facts about places outside the filings data (another state or country, e.g. "what\'s being built in Lyon", "how big is Munich\'s airport") when general knowledge isn\'t enough or the user wants something current. Never call it for map data or questions the filings can answer.',
    parameters: { type: 'object', additionalProperties: false, required: ['query'], properties: { query: str('What to search for, as a full question with names and city, e.g. "JPMorgan Chase Tower Houston construction cost 1981".'), near: str('Optional context such as the property or place being discussed.') } } },
  { name: 'summarize_filings', description: 'Summarize a set of filings and show a summary card in the chat (headline metrics, filings per month, breakdown by use and place, largest projects). Use for "summarize the filings in view", "give me an overview of these", "summarize what is highlighted". Does not change the map.',
    parameters: { type: 'object', additionalProperties: false, properties: {
      scope: str('Which filings: view = on the map in the current view (default; "in view", "on screen", "these"), filters = everything matching the current filters, highlighted = the highlighted filings, ids = the ids given.', { enum: ['view', 'filters', 'highlighted', 'ids'] }),
      ids: strs('TABS numbers when scope is ids.') } } },
  { name: 'show_chart', description: 'Show a chart card in the chat: filings or est. value grouped by month, quarter, year, use, county, city, developer, type or status, for the current map filters (default) or the filters given. Use when the user asks for a chart, graph, trend or breakdown. Does not change the map.',
    parameters: { type: 'object', additionalProperties: false, required: ['group_by'], properties: { ...FILTERS,
      group_by: str('What each bar is: month / quarter / year filed, start_month / finish_month (estimated construction start or finish, for schedule and timeline questions), or a category.', { enum: ['month', 'quarter', 'year', 'start_month', 'finish_month', 'use', 'county', 'city', 'developer', 'type', 'status'] }),
      metric: str('count (default) or value (est. USD).', { enum: ['count', 'value'] }),
      keep_current: { type: 'boolean', description: 'true (default) to chart what the map shows now, refined by any filters given; false to start from scratch.' } } } },
  { name: 'location_info', description: 'Look up a location and show a location card in the chat: parcel owner and market value, year built, building size, height and floors, businesses there, and construction filings on the site. For "what is at …", "who owns this", "tell me about this building / address".',
    parameters: { type: 'object', additionalProperties: false, properties: {
      place: str('Address, landmark or business (parcel, owner and filings data cover Texas only). Omit for the open filing or building.'), id: str('A filing (TABS number) whose location to look up.'), lat: num('Latitude'), lon: num('Longitude') } } },
  { name: 'demographics', description: 'Population, median household income, median home value, median rent, vacancy, median age, population growth and jobs for a place, from the US Census (ACS 5-year) tract data already loaded in the app. Shows a demographics card in the chat. Use for any question about income, population, home values, rent, age, growth or demographics of a town, neighborhood, county, address or the open property.',
    parameters: { type: 'object', additionalProperties: false, properties: {
      place: str('Town, neighborhood, address or landmark in Texas, e.g. "Waller", "Cypress", "1004 Priya Ln, Waller". Omit for the open filing or building.'),
      county: str('A whole county instead, e.g. "Harris".'), radius_miles: num('Radius around the place (default: 3 for a town, 1.5 for a neighborhood, 1 for an address).'),
      id: str('A filing (TABS number) to describe the area around.') } } },
  { name: 'air_traffic', description: 'Aircraft over or near a place right now (live ADS-B: callsign, type, altitude, speed, distance) and, for the home region, how much low air traffic passes over it (30-day history of aircraft below 3,000 ft: sightings a day, lowest altitude). Use for "what planes are overhead", "is this site under a flight path", "how noisy is the air traffic here", "what is that plane". Works anywhere for live traffic.',
    parameters: { type: 'object', additionalProperties: false, properties: { place: str('A place or address; omit for the open card, else the map center.'), id: str('A filing (TABS number) to measure around.'),
      radius_miles: num('How far around to look for live aircraft (default 3, max 25).'), history: { type: 'boolean', description: 'Include the 30-day low-flight history (default true).' } } } },
  { name: 'market_data', description: 'The Market view numbers for one county or the whole region: population and growth (ACS), jobs and top industries (LEHD LODES), new housing units permitted per year and year to date (Census Building Permits Survey), new business locations per month and the newest ones (Texas Comptroller sales-tax permits), and recent local development news headlines. Use for questions about growth, jobs, housing permits, new businesses or local news in a county.',
    parameters: { type: 'object', additionalProperties: false, properties: { county: str('County name (e.g. "Waller", "Fort Bend"); omit for all counties together.'),
      topic: str('Which part to return (default all).', { enum: ['all', 'population', 'jobs', 'permits', 'businesses', 'news'] }) } } },
  { name: 'field_notes', description: 'The team\'s field notes (site notes with title, tag, text, location, photos count, who added them) and the watchlist of starred filings and buildings. Use for "what notes do we have near Katy", "what\'s on our watchlist", "notes tagged opportunity".',
    parameters: { type: 'object', additionalProperties: false, properties: { query: str('Words to match in the title, text, tag or label (optional).'), near: str('Only notes near this place (optional).'), radius_miles: num('Radius for near (default 3).'),
      kind: str('notes, watchlist or both (default).', { enum: ['notes', 'watchlist', 'both'] }) } } },
  { name: 'data_sources', description: 'Every data source in the app: what it feeds, its status and how fresh it is (last nightly refresh, next one, live layers on or off). Use for "when was the data last updated", "where does this come from", "is the jobs data loaded yet".', parameters: { type: 'object', additionalProperties: false, properties: {} } },
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
- For "what's the nearest / closest …", "how far is the nearest …" or "what's around this" use nearby_places (it shows them on the map); distances are straight-line, so offer distance_and_drive_time for the drive to the top result.
- To outline or "highlight" a city, county, neighborhood, road or building, use highlight_area (highlight_filings is only for filings). To compare places, use compare_areas.
- To move to or orbit filings, call fly_to with their ids (or highlighted: true), not their address. For a landmark (hotel, stadium, venue, store), pass its current official name and city, e.g. "C. Baldwin Hotel, Houston"; if you know its street address, pass that instead, since an address always resolves. fly_to only moves the map when it finds the place itself; if it returns an error, try once with the street address or official name, otherwise ask the user. Never repeat a place that already failed.
- The map covers the whole world: fly_to, highlight_area, nearby_places, weather and the live layers work anywhere. The filings, demographics, jobs and parcel data cover Texas only. For places elsewhere (Europe, other states) say the filings don't cover it and answer from general knowledge, labeled approximate, or with web_search for current facts.
- If fly_to returns ambiguous with candidates, ask one short question ("Paris, France or Paris, Texas?") and offer the candidates as the follow-up options; never pick one yourself. Whenever a request is unclear (which place, which project, what time frame), ask one short follow-up question instead of guessing.
- Resolve "this", "here", "these", "around me", "the one I clicked" and "what I'm looking at" from what the user is looking at right now (open card, map center, filings in view).
- Base every number and name on tool results. Never invent filings, companies or values. If the data can't answer, say so and say what it can show.
- Decide first whether the user wants the map changed or just an answer:
  * Questions (how many, how much, what, when, who, which, compare, tell me about, will it…) → answer from query_filings / open data only. Do NOT filter, move, highlight or open anything on the map.
  * Only change the map when they ask to show, see, find, pull up, take me, go to, zoom, highlight, outline, orbit, open, filter, or say "on the map". Then act with the tools right away; do not announce what you are about to do ("Sure, I'll locate…"). Report the result in one or two sentences.
  * If unsure, answer and offer the map action as a follow-up instead of doing it.
- Write plain text only: no markdown at all (no **bold**, no # headings, no * or - bullets, no backticks). For lists, write short numbered lines like "1. …", each on its own line; a short line ending in ":" can introduce a list.
- Most tools show a card in the chat with their numbers (summaries, charts, filings, areas, nearby places, drive time, weather, news, imagery, locations). Don't repeat what the card shows: add 1–3 sentences of insight (what stands out, what it means, what to look at next).
- Never open another tab (show_view) or leave the map unless the user asks for that tab by name ("open the Timeline tab", "switch to Compare"). For schedule or timeline questions answer in the chat (show_chart by start_month or finish_month, or query_filings sorted by start) and offer "Open the Timeline tab" as one of the follow-up options; do the same for Compare, Activity, Market and Reports.
- For income, population, home values, rent, age, vacancy, growth or "demographics" of a place use demographics (US Census data already in the app). Don't say the data isn't available; say area medians are approximate.
- For "summarize the filings in view / these / what's highlighted" use summarize_filings. For a chart, graph or trend use show_chart. For "what's at this address / who owns it" use location_info.
- Keep replies short and conversational: 1–4 sentences or a tight list. Money is an estimate: write "est. $4.2M". Cite filings by id in square brackets, e.g. [TABS2025012345].
- "This", "this property", "here" mean the filing or building card that is open; "me" / "my location" means the user's GPS location. For distance, drive time or traffic use distance_and_drive_time; say whether the time includes live traffic (the tool says so).
- For weather right now use weather_at; for a forecast (this week, the next few days, a day ahead) use weather_forecast; to show weather, wind, radar, lightning, hurricanes, traffic, terrain, live planes or low flight paths on the map use set_live_layers.
- Everything in the app can be asked about: filings (query_filings, summarize_filings, show_chart), places and buildings (location_info), demographics, the Market view numbers (market_data: jobs, housing permits, new businesses, local news), air traffic (air_traffic: planes overhead now and low-flight history), weather, news, site imagery, the team's field notes and watchlist (field_notes), and where the data comes from and how fresh it is (data_sources). Use the tool rather than saying you don't have the data.
- Uses and developers are AI-tagged from filing text and can be wrong; owners are often single-asset LLCs.
- You can search the internet with web_search when the user asks you to (search, look it up, check online, Google it), or for current facts about places the filings don't cover. Otherwise answer from the map data, or from general knowledge clearly labeled as approximate, and offer to search. When you do search, give the answer and name the source sites; never claim you looked something up unless web_search returned it. Never say you will check something unless you are calling a tool for it in the same turn.${ctx.followups ? FOLLOWUPS : ''}`;
}

const FOLLOWUPS = `
- End every reply with one final line of 2–4 follow-up options the user can tap, in double square brackets separated by |, e.g. [[Take me to Waller County | Show similar medical projects | When will IDV Brookshire finish?]]. Make them specific to what was just discussed (name the county, project or company): one map action ("Take me there", "Show these on the map", "Outline Katy"), one related search, and one deeper question. When the reply is about one project, place, building or company, make the first option "Tell me more about <its short name>". Each option under 45 characters, written as the user would say it. Nothing after that line.`;

export const VOICE_STYLE = '\nYou are speaking out loud: answer in one or two short spoken sentences, say numbers naturally ("about four point two million"), and do not read out TABS ids unless asked. Act on the map with tools while you talk. The user is in the Houston area: "Cyprus" means Cypress, TX. If you misheard a place or company name, ask once rather than guess. Ignore background talk, filler and fragments that are not a request to you: stay silent rather than answer them.';
