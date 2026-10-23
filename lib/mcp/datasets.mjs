// Every dataset the MCP server reads (api/mcp.js): what it covers, how fresh it is, where it comes from and which tools use
// it. Coverage sentences are shared with the tools so "not covered here (covers …)" always says the same thing.
export const HOME = 'the seven home counties (Waller, Harris, Fort Bend, Montgomery, Austin, Washington, Grimes)';
export const COVER = {
  home: HOME, texas: 'Texas', us: 'the United States', world: 'the world',
  houston: 'the City of Houston only (Houston Police Department); unincorporated Harris County and other cities are not included',
  cads: 'Texas: the statewide StratMap parcel layer, plus the Harris, Waller, Austin, Washington and Grimes appraisal districts’ own layers'
};

export const DATASETS = [
  { id: 'geocoder', name: 'US Census Geocoder (addresses to coordinates, with match quality)', covers: COVER.us, fresh: 'live (Census TIGER address ranges, current benchmark)', url: 'https://geocoding.geo.census.gov/geocoder/', tools: 'every tool (location input)' },
  { id: 'parcels', name: 'Parcels: Texas GIO StratMap land parcels and county appraisal district layers (owner, values, land use, outline)', covers: COVER.cads, fresh: 'live; each district’s current appraisal roll', url: 'https://geographic.texas.gov/', tools: 'find_property' },
  { id: 'places_limits', name: 'City limits (US Census TIGERweb incorporated places)', covers: COVER.us, fresh: 'live (current TIGER vintage)', url: 'https://tigerweb.geo.census.gov/', tools: 'find_property, site_facts' },
  { id: 'nfhl', name: 'FEMA National Flood Hazard Layer (zones, base flood elevations, floodways)', covers: COVER.us, fresh: 'live (FEMA’s effective maps)', url: 'https://hazards.fema.gov/femaportal/wps/portal/NFHLWMS', tools: 'flood, site_facts, report_flood' },
  { id: 'openfema', name: 'OpenFEMA NFIP redacted claims (v3) and disaster declarations', covers: COVER.us, fresh: 'live (FEMA updates monthly)', url: 'https://www.fema.gov/about/openfema/data-sets', tools: 'flood, report_flood' },
  { id: 'nri', name: 'FEMA National Risk Index (census tracts)', covers: COVER.us, fresh: 'live (FEMA’s current NRI release)', url: 'https://hazards.fema.gov/nri/', tools: 'flood, report_flood' },
  { id: 'aadt', name: 'TxDOT annual average daily traffic (AADT) count segments', covers: COVER.texas, fresh: 'current count year only (TxDOT keeps no history in this layer)', url: 'https://gis-txdot.opendata.arcgis.com/', tools: 'traffic_counts, site_facts, report_market' },
  { id: 'districts', name: 'Districts: TCEQ water districts (MUDs, WCIDs), CDFI Opportunity Zones, Census school districts, City of Houston TIRZ and METRO stops', covers: COVER.texas + ' (TIRZ and METRO: Houston only)', fresh: 'live', url: 'https://www.tceq.texas.gov/gis', tools: 'site_facts' },
  { id: 'echo', name: 'EPA ECHO regulated facilities (¼ mile)', covers: COVER.us, fresh: 'live', url: 'https://echo.epa.gov/', tools: 'site_facts' },
  { id: 'bars', name: 'Texas Comptroller mixed beverage gross receipts at the address', covers: COVER.texas, fresh: 'live (monthly filings)', url: 'https://data.texas.gov/d/naix-2893', tools: 'site_facts' },
  { id: 'environmental', name: 'Environmental screen: TCEQ cleanup and tank programs, EPA Facility Registry, Railroad Commission wells and pipelines, USFWS wetlands, USDA soils', covers: COVER.texas + ' (EPA, wetlands and soils: US)', fresh: 'live', url: 'https://www.tceq.texas.gov/gis/download-tceq-gis-data', tools: 'environmental, report_environmental' },
  { id: 'utilities', name: 'Utilities: OpenStreetMap power lines and substations (ODbL), PUC water and sewer CCNs, City of Houston water and sewer mains', covers: COVER.texas + ' (mains: Houston only)', fresh: 'live', url: 'https://www.openstreetmap.org/copyright', tools: 'utilities' },
  { id: 'elevation', name: 'USGS 3DEP bare-ground elevation (1 m lidar where flown, else ~10 m)', covers: COVER.us, fresh: 'live (3DEP’s best model at each point)', url: 'https://www.usgs.gov/3d-elevation-program', tools: 'terrain' },
  { id: 'acs', name: 'US Census ACS 5-year tract figures (population, income, home value, rent, vacancy, age), LEHD LODES jobs, modeled consumer spending (ACS × BLS CE)', covers: COVER.home, fresh: 'data/market.json', url: 'https://www.census.gov/programs-surveys/acs', tools: 'demographics, site_facts, report_demographics' },
  { id: 'area', name: 'County market data: Census building permits, Comptroller new business locations and city sales tax, LODES jobs by industry, BLS unemployment, FRED / NY Fed rates, Zillow rents, CFPB HMDA loans, local news headlines', covers: COVER.home + ' (unemployment: every Texas county; rates: national)', fresh: 'data/area.json (nightly)', url: 'https://www.census.gov/construction/bps/', tools: 'market_context, report_market' },
  { id: 'places', name: 'Businesses and places: Overture Maps Places (CDLA-Permissive-2.0) and Foursquare Open Source Places (Apache-2.0)', covers: COVER.home, fresh: 'monthly load', url: 'https://overturemaps.org/', tools: 'businesses' },
  { id: 'tenants', name: 'Texas Comptroller active sales-tax permit holders (businesses at an address)', covers: COVER.texas, fresh: 'live (about weekly)', url: 'https://data.texas.gov/d/jrea-zgmq', tools: 'businesses_at_address' },
  { id: 'entity', name: 'Texas Comptroller franchise tax account status and Public Information Reports; registered agent from the Secretary of State', covers: 'companies registered in Texas (people are not looked up)', fresh: 'live', url: 'https://comptroller.texas.gov/taxes/franchise/account-status/search', tools: 'company_lookup' },
  { id: 'devdata', name: 'Development activity: HCAD building permits, City of Houston plats and county subdivisions, TxDOT projects, TCEQ water districts, TEA schools', covers: COVER.home + ' (permits: Harris County only)', fresh: 'nightly load', url: 'https://hcad.org/', tools: 'development_activity' },
  { id: 'filings', name: 'TDLR TABS construction registrations (every commercial or public project over $50K), with AI-tagged use, developer, architect and contractor', covers: COVER.texas, fresh: 'nightly', url: 'https://www.tdlr.texas.gov/TABS/Search', tools: 'construction_filings, top_companies' },
  { id: 'hpd', name: 'Houston Police Department NIBRS incidents', covers: COVER.houston, fresh: 'nightly load; HPD’s file runs about three months behind', url: 'https://www.houstontx.gov/police/cs/Monthly_Crime_Data_by_Street_and_Police_Beat.htm', tools: 'crime_near, report_crime' },
  { id: 'fbi', name: 'FBI Crime Data Explorer (yearly offenses by police department, state and US rates)', covers: COVER.us, fresh: 'weekly library load, else live; calendar years', url: 'https://cde.ucr.cjis.gov/', tools: 'crime_by_agency, report_crime_agency' },
  { id: 'news', name: 'Local and development news headlines (stored: nightly county and town searches, and articles found for filings)', covers: COVER.home, fresh: 'nightly; headlines kept 120 days', url: 'https://news.google.com/', tools: 'news' },
  { id: 'airports', name: 'OurAirports airports and runways (public domain), FAA diagram links', covers: COVER.world, fresh: 'nightly load', url: 'https://ourairports.com/data/', tools: 'airports_near' }
];

// the dates the stored datasets are current as of (best effort: a source that can't be read is left out)
export async function freshness({ load, db }) {
  const out = {}, safe = async (k, fn) => { try { const v = await fn(); if (v) out[k] = v; } catch (e) { /* unknown */ } };
  await Promise.all([
    safe('acs', async () => { const m = await load('market.json'); return 'ACS ' + (m.year - 4) + '–' + m.year + ' (5-year), jobs ' + m.jobsYear + ', spending ' + m.spendYear; }),
    safe('area', async () => String((await load('area.json')).built || '').slice(0, 10)),
    safe('filings', async () => { const f = await load('filings.json'); return String(f.built || '').slice(0, 10) + ' (home-county file; statewide table in the database)'; }),
    safe('places', async () => { if (!db) return null; const [r] = await db.select('places_loads', 'select=at&order=at.desc&limit=1'); return r?.at?.slice(0, 10); }),
    safe('devdata', async () => { if (!db) return null; const m = await db.rpc('county_meta', {}); const at = Object.values(m || {}).map(x => x.at).filter(Boolean).sort().pop(); return at?.slice(0, 10); }),
    safe('hpd', async () => { if (!db) return null; const d = await db.rpc('crime_latest', {}); return d ? 'incidents through ' + d : null; }),
    safe('news', async () => String((await load('area.json')).built || '').slice(0, 10))
  ]);
  return out;
}
