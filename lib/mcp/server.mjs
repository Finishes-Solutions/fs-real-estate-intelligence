// The MCP server for the project app's agents (api/mcp.js): every tool's schema and how it runs. Every tool is read-only
// (annotations readOnlyHint: true, openWorldHint: true). A tool answers with compact text (lib/mcp/text.mjs); a location the
// agent can't be told about, a bad input or a failing upstream comes back as a short sentence, never a crash.
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { UserError } from './resolve.mjs';
import { DATASETS, freshness } from './datasets.mjs';
import { doc } from './text.mjs';
import { load } from '../../api/_lib/data.mjs';
import { USES } from '../taxonomy.mjs';
import { findProperty, siteFactsTool, floodTool, terrainTool, environmentalTool, utilitiesTool, trafficTool } from './site.mjs';
import { demographicsTool, marketTool, businessesTool, tenantsTool, companyTool, developmentTool, filingsTool, topCompaniesTool, crimeNearTool, crimeAgencyTool, newsTool, airportsTool, areaOverviewTool, db } from './area.mjs';
import { GROUPS } from '../places.mjs';
import { reportFlood, reportEnvironmental, reportCrime, reportCrimeAgency, reportDemographics, reportMarket } from './reports.mjs';
import { sitePlanTool } from './siteplan.mjs';

export const SERVER_INFO = { name: 'fs-real-estate-intelligence', version: '1.0.0' };
const str = (description, extra = {}) => ({ type: 'string', description, ...extra });
const num = description => ({ type: 'number', description });
const strs = (description, items = { type: 'string' }) => ({ type: 'array', items, description });
const bool = description => ({ type: 'boolean', description });

// every tool takes a location the same way (lib/mcp/resolve.mjs)
export const LOCATION = {
  address: str('Street address with city and state or ZIP, e.g. "1004 Priya Ln, Waller, TX 77484" (US Census geocoder; the answer says how good the match was), or a town in the Houston region ("Katy").'),
  apn: str('Appraisal district account number (APN). Needs county. Works for Harris, Waller, Austin, Washington and Grimes counties.'),
  county: str('A Texas county name, e.g. "Waller". Alone it means the whole county; with apn it is the APN’s county.'),
  lat: num('Latitude (with lon).'), lon: num('Longitude (with lat).'),
  radius_mi: num('Radius in miles around the address, APN or point (up to 25). Omit to use the property itself (its parcel) or the tool’s default.'),
  bbox: { type: 'array', items: { type: 'number' }, minItems: 4, maxItems: 4, description: '[west, south, east, north] in degrees (at most 3° a side).' },
  geojson: { type: 'object', description: 'A GeoJSON Polygon or MultiPolygon (or a Feature holding one), lon/lat.' }
};
const loc = (extra = {}, required) => ({ type: 'object', additionalProperties: false, properties: { ...LOCATION, ...extra }, ...(required ? { required } : {}) });
const FILTERS = {
  date_from: str('Registered on or after (YYYY-MM-DD).'), date_to: str('Registered on or before (YYYY-MM-DD).'),
  min_cost: num('Minimum estimated value in USD (e.g. 5000000 for $5M).'), max_cost: num('Maximum estimated value in USD.'),
  min_sqft: num('Minimum square feet filed.'), max_sqft: num('Maximum square feet filed.'),
  uses: strs('Real estate uses.', { type: 'string', enum: USES }), types: strs('Project types.', { type: 'string', enum: ['New', 'Reno', 'Addition', 'Other'] }),
  owner: str('Words in the owner name.'), developer: str('Words in the developer name.'), architect: str('Words in the architect name.'), contractor: str('Words in the general contractor name.'),
  company: str('Words in any of the owner, developer, architect or contractor names.')
};

export const TOOLS = [
  { name: 'list_datasets', title: 'List datasets', description: 'Every dataset this server reads: what it covers, how fresh it is, where it comes from (with a link) and which tools use it. Call it first to see what can be answered where.',
    inputSchema: { type: 'object', additionalProperties: false, properties: {} }, run: listDatasets },
  { name: 'find_property', title: 'Find a property', description: 'Resolve a location (address, APN + county, coordinates, county, box or polygon) to coordinates with the geocoder’s match quality, its county, whether it is inside city limits or near enough to a city to be in its extraterritorial jurisdiction (ETJ, 0.5 mile rule), and the free county appraisal parcel: owner, situs address, APN, land use, acreage, market / land / improvement values, year built, acquisition date, legal description and the parcel outline as GeoJSON. Texas parcels only.',
    inputSchema: loc(), run: findProperty },
  { name: 'site_facts', title: 'Site facts', description: 'One call for most facts about a Texas property: its parcel, city or ETJ, FEMA flood zone at the point, TxDOT traffic counts on the roads beside it, water / utility district (MUD, WCID), Houston TIRZ, Opportunity Zone, school district, METRO stops, EPA-regulated facilities within ¼ mile, Houston crime within ½ mile, alcohol sales at the address, and the census tract (population, growth, income, home value, rent, vacancy, jobs, spending).',
    inputSchema: loc(), run: siteFactsTool },
  { name: 'flood', title: 'Flood and hazard', description: 'FEMA flood facts: the zone at the point (with base flood elevation where published), each flood risk class’s share of the parcel or area (high 100-year, moderate 500-year, minimal; floodway), distance to the nearest high-risk zone, NFIP flood insurance claims paid in the surrounding census tracts (by year and by storm such as Harvey), federal disaster declarations for its counties since 2000, and FEMA’s National Risk Index (overall rating, expected annual loss by hazard). Whole US. For a point it uses the parcel there, else a ¼ mile circle.',
    inputSchema: loc(), run: floodTool },
  { name: 'terrain', title: 'Terrain', description: 'Ground elevations over a parcel or area for site design: minimum, maximum and mean elevation (NAVD 88 ft, bare ground), relief, the share of the site in slope bands (0–2, 2–5, 5–10, 10–15, over 15 %), the general drainage direction and fall, low channels, and the data source and resolution (USGS 3DEP lidar). For a point it uses the parcel there. Sites up to 5 miles across. Planning numbers, not a survey.',
    inputSchema: loc(), run: terrainTool },
  { name: 'environmental', title: 'Environmental screen', description: 'The Environmental Report’s data as a summary: TCEQ Superfund, hazardous-waste and voluntary cleanups, brownfields, dry cleaners, leaking and registered petroleum tanks, landfills, groundwater restrictions; EPA Superfund, toxic release, hazardous waste, air and water permits; Railroad Commission oil and gas wells, orphan wells and pipelines; wetlands; and the soils under the site (drainage, flooding, building ratings). Counts within Phase I style search distances of the site’s edge, what is on the site, and the nearest records. Texas. For a point it uses the parcel there, else a 0.1 mile circle.',
    inputSchema: loc(), run: environmentalTool },
  { name: 'utilities', title: 'Utilities', description: 'Utilities near a Texas site: nearest mapped power lines (transmission and distribution, voltage, operator) and substations, who holds the water and sewer service areas (PUC CCNs), water facility lines, and City of Houston water and sewer mains (size, material) with distances from the parcel edge.',
    inputSchema: loc(), run: utilitiesTool },
  { name: 'traffic_counts', title: 'Traffic counts', description: 'TxDOT annual average daily traffic (vehicles a day, both directions) for an area in Texas: the busiest roads, average and busiest count by road type, and the TxDOT file date. Default ½ mile around a point. Counts only (no live speeds).',
    inputSchema: loc(), run: trafficTool },
  { name: 'demographics', title: 'Demographics', description: 'US Census ACS figures for rings around a place (default 1, 3 and 5 miles), a county or a polygon: population and growth, households, median household income, home value and rent (approx. where tracts are combined), vacancy, median age, households by income band, jobs located there (LEHD LODES) and estimated consumer spending by category. Home counties only.',
    inputSchema: loc({ radii: { type: 'array', items: { type: 'number' }, description: 'Ring radii in miles (up to 4, each up to 25). Default [1, 3, 5].' } }), run: demographicsTool },
  { name: 'market_context', title: 'Market context', description: 'County-level market figures (the app’s Market view) for a home county, the county a location is in, or "all" for the region: population and growth, jobs and top industries, unemployment, housing units permitted by year and year to date, new business locations per month and the newest ones, city sales tax collected, modeled consumer spending, Zillow rents, home loans, interest rates, the construction pipeline from TDLR filings and local development news.',
    inputSchema: loc({ topic: str('One part only (default all).', { enum: ['all', 'population', 'jobs', 'permits', 'businesses', 'sales_tax', 'spending', 'rents', 'housing', 'loans', 'rates', 'pipeline', 'news'] }) }), run: marketTool },
  { name: 'businesses', title: 'Businesses and places', description: 'Businesses and places in the home counties (Overture Maps and Foursquare open data): search by name (closest to a location first), the nearest ones to a point (optionally one category), and counts by category in an area.',
    inputSchema: loc({ query: str('Business name or brand, e.g. "Buc-ee\'s".'), category: str('Only this category.', { enum: Object.keys(GROUPS) }), limit: num('How many to list (default 15, max 40).') }), run: businessesTool },
  { name: 'businesses_at_address', title: 'Registered businesses at an address', description: 'Businesses registered at a Texas street address from the Texas Comptroller’s active sales-tax permits: retail, restaurant and service tenants, their legal owner, suite and the date the location’s permit was issued. Offices and medical practices mostly don’t hold one.',
    inputSchema: { type: 'object', additionalProperties: false, required: ['address'], properties: { address: str('Street address with a house number, e.g. "24600 Katy Fwy, Katy, TX 77494".'), zip: str('ZIP code, if not in the address.'), city: str('City, if there is no ZIP.') } }, run: tenantsTool },
  { name: 'company_lookup', title: 'Company lookup', description: 'Who is behind a company that owns property, from the Texas Comptroller’s franchise tax records: status, formation date and state, Secretary of State file number, registered agent, mailing address, and officers / managers from its latest Public Information Report. Companies only: people’s names are not looked up.',
    inputSchema: { type: 'object', additionalProperties: false, properties: { name: str('Company name as on the deed or appraisal roll, e.g. "PROLOGIS-A4 TX LP".'), taxpayer_id: str('11-digit Texas taxpayer number from an earlier answer.') } }, run: companyTool },
  { name: 'development_activity', title: 'Development activity', description: 'Development activity in the home counties from the app’s nightly county data: building permits (Harris County, HCAD: new commercial, new homes, remodels, demolitions), plats and new subdivisions, TxDOT road projects, water districts / MUDs (creation date, tax rate) and public schools (enrollment). Counts by kind and category and the newest rows. Default 1 mile around a point.',
    inputSchema: loc({ kinds: strs('Which kinds (default all).', { type: 'string', enum: ['permit', 'plat', 'txdot', 'district', 'school'] }), months: num('How far back for permits and plats (default 12).'),
      date_from: str('Permits and plats on or after (YYYY-MM-DD); overrides months.'), date_to: str('Permits and plats on or before (YYYY-MM-DD).'), limit: num('Rows to list per kind (default 10).') }), run: developmentTool },
  { name: 'construction_filings', title: 'Construction filings', description: 'Texas TDLR TABS construction registrations (every commercial or public project over $50K must register: an early signal of what is being built, by whom, where and when). Filter by area, county, registration dates, value, square feet, use, type and owner / developer / architect / contractor; returns totals (count, value, square feet, units, by use, type and city) and the top rows. Statewide. A point uses a 2-mile circle unless radius_mi is given.',
    inputSchema: loc({ ...FILTERS, sort: str('Row order.', { enum: ['value', 'newest'] }), limit: num('Rows to list (default 15, max 50).') }), run: filingsTool },
  { name: 'top_companies', title: 'Top companies', description: 'Developers / owners, architects and general contractors ranked by construction activity (TDLR filings: number and estimated value) in an area or county, with each one’s largest project. Takes the same filters as construction_filings.',
    inputSchema: loc({ ...FILTERS, roles: strs('Which rankings (default all three).', { type: 'string', enum: ['developer', 'architect', 'contractor'] }), rank_by: str('Rank by estimated value (default) or number of filings.', { enum: ['value', 'count'] }), limit: num('How many per ranking (default 10).') }), run: topCompaniesTool },
  { name: 'crime_near', title: 'Crime near a place (Houston)', description: 'Crime from Houston Police incident reports (NIBRS) for a radius or area of Houston: the 12 months through the latest month published (about three months behind) vs the 12 before, violent / property / other, incidents per square mile vs the citywide rate, per 1,000 residents, top offenses, premises and monthly counts. City of Houston only (outside it the answer says so; use crime_by_agency). Default ½ mile around a point.',
    inputSchema: loc(), run: crimeNearTool },
  { name: 'crime_by_agency', title: 'Crime by police department', description: 'Yearly crime for the police department covering a location anywhere in the US (or one named, or by FBI agency ID), from the FBI Crime Data Explorer: violent and property crimes per 100,000 for the newest full year against the state and the US, the change from the year before, the share solved, the offense mix, rates by year, its rank among the state’s departments of the same kind, and the other departments in the county. With rankings: true, the state’s departments ranked by crime rate.',
    inputSchema: loc({ ori: str('FBI agency ID (ORI), e.g. TX1010000.'), agency_name: str('Department name, e.g. "Katy Police" (with state).'), state: str('Two-letter state for agency_name or rankings (default TX).'),
      rankings: bool('Also rank the state’s departments by crime rate.'), rank_type: str('City police (default) or County sheriffs.', { enum: ['City', 'County'] }), order: str('Rank by violent (v, default) or property (p) crime.', { enum: ['v', 'p'] }),
      highest_first: bool('Highest crime first (default lowest first).'), min_population: num('Smallest population in the ranking (default 10,000).'), limit: num('How many to rank (default 15).') }), run: crimeAgencyTool },
  { name: 'news', title: 'Local and project news', description: 'Local and development news the app has stored: headlines for a home county or one of its busiest towns (searched nightly), and articles found for construction filings that mention a project or company.',
    inputSchema: loc({ place: str('A home county or town, e.g. "Waller" or "Katy".'), query: str('A project, company or word to find in the headlines.'), limit: num('How many (default 10).') }), run: newsTool },
  { name: 'airports_near', title: 'Airports near a place', description: 'The nearest public airports to a location (OurAirports data): codes, type, distance, scheduled service and runways (length, surface), and whether the place sits under a runway’s approach or departure path. No live flights.',
    inputSchema: loc({ limit: num('How many airports (default 6).') }), run: airportsTool },
  { name: 'report_flood', title: 'FEMA flood & hazard report (PDF)', report: true, description: 'The website’s FEMA flood & hazard report as a PDF, for a property (its parcel), a radius, a county or a polygon: flood zone shares, floodway and base flood elevation, NFIP claims by year and storm, disaster declarations and FEMA’s National Risk Index, on a street map, in the Finishes Solutions report style. Returns a short summary and the PDF as an embedded resource (report://flood/…pdf); include_csv adds the data as CSV. Whole US.',
    inputSchema: loc({ include_csv: bool('Also attach the report’s data as CSV.') }), run: reportFlood },
  { name: 'report_environmental', title: 'Environmental report (PDF)', report: true, description: 'The website’s Environmental screening report as a PDF for a Texas property (its parcel), radius, county or polygon: cleanup and contamination sites, tanks, permitted facilities, oil and gas wells, pipelines, wetlands and soils within Phase I style search distances, on a street map. Returns a short summary and the PDF as an embedded resource (report://environmental/…pdf); include_csv adds every record listed as CSV. A screen of public records, not a Phase I.',
    inputSchema: loc({ include_csv: bool('Also attach the records as CSV.') }), run: reportEnvironmental },
  { name: 'report_crime', title: 'Houston crime report (PDF)', report: true, description: 'The website’s Crime report as a PDF for an area of Houston (default ½ mile around a point): 12 months vs the 12 before, per square mile vs the city, per resident, monthly and time-of-day charts, year by year, top offenses and premises, the incidents on a street map and listed newest first. City of Houston only (outside it the answer says so). Returns a summary and the PDF (report://crime/…pdf); include_csv adds the incidents as CSV.',
    inputSchema: loc({ include_csv: bool('Also attach the incidents as CSV.') }), run: reportCrime },
  { name: 'report_crime_agency', title: 'City / County Crime Report (PDF)', report: true, description: 'The website’s City / County Crime Report as a PDF for the police department covering a location anywhere in the US (or one FBI agency ID): rates per 100,000 against the state and the US, trends, year by year and the offense mix, from the FBI Crime Data Explorer. Returns a summary and the PDF (report://crime_agency/…pdf); include_csv adds the years as CSV.',
    inputSchema: loc({ ori: str('FBI agency ID (ORI), instead of a location.'), include_csv: bool('Also attach the years as CSV.') }), run: reportCrimeAgency },
  { name: 'report_demographics', title: 'Demographics report (PDF)', report: true, description: 'A demographics report PDF for a property: 1, 3 and 5-mile rings (or the radii given) with population and growth, households, income, home value, rent, vacancy, age, households by income, jobs located there and estimated consumer spending by category, on a street map with the rings, in the Finishes Solutions report style. For a county or a drawn area it reports the area as one. Returns a summary and the PDF (report://demographics/…pdf); include_csv adds the figures as CSV. Home counties only.',
    inputSchema: loc({ radii: { type: 'array', items: { type: 'number' }, description: 'Ring radii in miles (up to 4, each up to 25). Default [1, 3, 5].' }, include_csv: bool('Also attach the figures as CSV.') }), run: reportDemographics },
  { name: 'report_market', title: 'Market report (PDF)', report: true, description: 'The Market report as a PDF for a home county (or the county a location is in), several counties, or "all" for the region: what is moving, the construction pipeline (under construction by month, by use, the largest projects, what starts in 90 days), housing permits, new businesses, jobs by industry, unemployment, city sales tax, consumer spending, census housing and incomes, Zillow rents by ZIP, the Houston for-sale market, material prices and rates, Houston crime, the busiest roads (TxDOT) and local news. A static print version of the Market page’s interactive charts. Returns a summary and the PDF (report://market/…pdf); include_csv adds the numbers as CSV.',
    inputSchema: loc({ counties: strs('Several home counties together, e.g. ["Waller", "Harris"].'), include_csv: bool('Also attach the numbers as CSV.') }), run: reportMarket },
  { name: 'site_plan', title: 'Site plan (layout + PDF sheet)', report: true, description: 'A concept site plan for a Texas parcel, several parcels together (apns, up to 20, merged as one site) or a drawn outline (geojson), laid out by the app’s own site layout engine: buildings, parking, drives, detention pond, landscaping, within setbacks, with the front and side streets found from the roads beside it. Give request (what to build, e.g. "25,000 sf retail strip with 2 pad sites", "200 apartments, 3 stories", "warehouse with truck court, as big as fits") or leave it out to have the AI suggest best uses for the site (from its size, frontage, flood zone, utilities, traffic, what is nearby and the market) and lay out the best one (idea picks another). effort: low (seconds, request read directly), medium (default, about 1–2 min: the AI plans the site, reads the request, then reviews the layouts and picks one) or high (2–4 min: may revise the program once). Returns the layouts compared (floor area, units, parking, coverage, checks, AI score), the pick and why, and the conceptual site plan sheet as a PDF resource (report://site_plan/…pdf, 11 × 17 or 24 × 36); include_geojson adds the picked layout as GeoJSON. Concept only, not for permitting. Inside the City of Waller or its ETJ it follows the app’s Waller planning guardrails.',
    inputSchema: { type: 'object', additionalProperties: false, properties: { address: LOCATION.address, apn: LOCATION.apn, county: str('Texas county of the apn or apns.'), lat: LOCATION.lat, lon: LOCATION.lon, geojson: { type: 'object', description: 'The site outline: a GeoJSON Polygon or MultiPolygon (or a Feature holding one), lon/lat.' },
      apns: strs('Several APNs (same county) laid out as one site, as the app merges parcels.'), request: str('What to build. Omit for best-use ideas.'), goal: str('With no request: what the owner is after, for the best-use ideas (e.g. "income property", "sell pads").'),
      idea: num('With no request: which best-use idea to lay out (1 = the first listed; default the best fit).'), effort: { type: 'string', enum: ['low', 'medium', 'high'], description: 'How hard the AI works (default medium).' },
      sheet: { type: 'string', enum: ['11x17', '24x36'], description: 'Sheet size of the PDF (default 11x17).' }, project_name: str('Project name for the title block.'), prepared_for: str('Prepared for (title block).'), include_geojson: bool('Also attach the picked layout as GeoJSON (lon/lat).') } }, run: sitePlanTool },
  { name: 'area_overview', title: 'Area overview', description: 'One call for most of an area: demographics (1 mile around a point, or the area), construction filings in the last 12 months, development activity counts, businesses by category, Houston crime where covered, and the county’s market headline. Use the specific tools for detail.',
    inputSchema: loc(), run: areaOverviewTool }
];
export const ANNOTATIONS = { readOnlyHint: true, openWorldHint: true };

async function listDatasets() {
  const fr = await freshness({ load, db: (() => { const d = db(); return d && d.via === 'key' ? d : null; })() });
  return doc('Datasets', DATASETS.map(d => '- ' + d.name + '. Covers ' + d.covers + '. Freshness: ' + (fr[d.id] ? 'current as of ' + fr[d.id] : d.fresh) + '. Source: ' + d.url + '. Tools: ' + d.tools + '.'), [],
    ['Not included on purpose: Google Places, TomTom traffic, Regrid parcels, Open-Meteo weather, live flights and public routing services (licensing). Sale prices and lease comps aren’t public in Texas.']);
}

// one tool call: the text, or a short sentence when the input or an upstream service fails
export async function callTool(name, args = {}, ctx = {}) {
  const t = TOOLS.find(x => x.name === name);
  if (!t) return { content: [{ type: 'text', text: 'Unknown tool ' + name + '.' }], isError: true };
  if (ctx.limit && !ctx.limit(t)) return { content: [{ type: 'text', text: 'Too many requests for ' + name + ' just now. Try again in a minute.' }], isError: true };
  try {
    const out = await t.run(args || {}, ctx);
    return typeof out === 'string' ? { content: [{ type: 'text', text: out }] } : out;
  } catch (e) {
    if (!(e instanceof UserError)) console.error('mcp', name, e.message);
    const msg = e instanceof UserError ? e.message : /time|abort/i.test(e.message) ? 'A data service didn’t answer in time. Try again in a moment.' : 'This lookup failed: ' + String(e.message || e).slice(0, 200) + '. Try again in a moment.';
    return { content: [{ type: 'text', text: msg }], isError: true };
  }
}

export function createServer(ctx = {}) {
  const server = new Server(SERVER_INFO, { capabilities: { tools: {} }, instructions: 'Finishes Solutions real estate intelligence: Texas property, site, flood, terrain, environmental, demographic, market, construction-filing, crime and news data, read-only. Call list_datasets for coverage. Every answer lists its sources, how current they are and what they cover.' });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS.map(t => ({ name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema, annotations: { title: t.title, ...ANNOTATIONS } })) }));
  server.setRequestHandler(CallToolRequestSchema, async req => callTool(req.params.name, req.params.arguments, ctx));
  return server;
}
