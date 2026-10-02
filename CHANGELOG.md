# Changelog

Every push to the repository adds an entry at the top: date and time (US Central), what changed, and the commit(s).
Nightly "Refresh data" commits from the data workflow are left out (they only update `data/`).

## 2026-10-02

### 5:08 PM CT: Building card "Demographics" with the area it covers; new chat icon
- The building card's "Census tract" section is now **Demographics**, with a line saying which census tract the numbers describe and how big it is (e.g. "about 0.6 sq mi, like a 0.4-mile radius"). The numbers are for the tract the building sits in, not a fixed radius: tracts are small in dense areas and large in rural ones (median in this region about 1 sq mi, up to about 200 sq mi).
- The assistant's "New" button is now a new-chat icon.

### 5:07 PM CT: Voice stops answering things you didn't say; web search on request; new voice panel (c45f721)
- Voice no longer posts or acts on messages you didn't say. On silence or background noise the transcriber could "hear" its own hint list of place names ("Houston area, Texas. Cypress, Katy, …") and the assistant acted on it (that's where the TxDOT filter came from). The voice assistant now waits for the transcript, drops noise and those echoes, and only then answers. Your words now always appear above the reply.
- The assistant can search the internet, but only when you ask ("search the web for…", "look it up", "Google it"). It answers in a couple of sentences, and the chip under it links the source sites. It no longer says "let me check" unless it actually runs a tool.
- New voice panel: a glowing orb that breathes while listening, follows your voice while you talk, spins while thinking and turns blue and follows the assistant's voice while it speaks. A live caption shows what it's hearing as you talk.
- Fixed: the Send button in the voice panel showed all the time; it now appears only while you're talking.

### 4:58 PM CT: "Downtown Houston" means the district (27277ea)
- Asking the assistant to highlight or go to Downtown Houston now outlines the whole downtown freeway loop (I-45, I-69, I-10) and frames all of it, instead of outlining the JPMorgan Chase Tower or flying to the "Downtown Split" interchange. Orbiting downtown circles the district at a wide, tilted view. The outline is approximate.
- In general, "downtown", "midtown" and "uptown" requests no longer settle for a street, building or business that merely has that word in its name; if no matching district turns up, the assistant says so instead of guessing.

### 4:47 PM CT: Place pin, More Information, 9 metrics, collapsible panel and more filters (9c1dda2)
- A searched place now gets an amber map pin with its name. It clears when you close the place card, search again, press Reset or filter to the area.
- The place card's main button is now **More Information**. For an address, landmark or building it opens the location card (parcel, size, height, filings, Drive Time, Site Imagery, News). For a town, county or neighborhood it opens an area summary: your metrics, top uses, the five largest projects, Filter to This Area and + Compare.
- **Filings Within ¼ Mile** moved into the location card.
- Headline metrics: pick up to 9, and the default is now 9 (adds New value, Starting in 90 days and Sq ft filed). PDF reports wrap the metrics onto two rows.
- The **Filters** and **List** sections fold away from their headers, and the app remembers which are folded.
- New filters: Use as multi-select chips, Status, a max value, a square footage range, housing units, a company search (developer, owner, architect, GC) and **Exact addresses only**. Links, saved searches, RSS feeds and the assistant all understand them.

### 4:37 PM CT: Shortcut hints removed (cefc21e)
- The "Ctrl+K" badge on the search bar and the "Ctrl+/" badge on the Ask AI button are gone. The shortcuts still work (Ctrl/Cmd+K jumps to search, Ctrl/Cmd+/ opens the assistant).

### 4:25 PM CT: Market data merged to main, map buttons stay clear of open cards, basemap names (8ecabe0)
- With a filing or building card open, the map buttons on the right (zoom, compass, locate, home, time-lapse, layers, globe) and the Layers panel move left of the card, like the Ask AI button, so a tall card no longer hides them.
- Basemap buttons renamed: "Dot Grid" is now **Default**, "Esri Sat" is now **ESRI** (the Sources tab and the assistant use the same names).
- Added this changelog.
- Merged the Market view branch and the Ask AI suggestions branch into main, so main has everything below.

### 3:36 PM CT: Market view and registered businesses (11ded4b)
- New **Market** tab: population, jobs, housing units permitted, new business locations and local development news per county or the whole region, with hover readouts and tables.
- New **Jobs** demographic layers on the map: jobs located here, job growth, jobs per resident (US Census LEHD LODES).
- Building cards list businesses registered at the parcel address (Texas Comptroller sales-tax permits); filing cards have a **Look Up Registered Businesses** button.
- Nightly build adds `data/area.json`: LODES jobs, Census Building Permits Survey, Comptroller new businesses, Google News area headlines. Each source is best effort.
- AI briefs include county permits and jobs; Sources tab and README list the new sources and their limits.

### 3:27 PM CT: Ask AI suggestions and keyboard shortcuts (8d294c6); geocoding retries (c07c5fc)
- Up to 5 suggested questions above Ask AI, based on what's on screen (the open filing or building, the town in view, the filters). With a card open, Ask AI and its suggestions sit left of the card instead of under it.
- Cmd/Ctrl+K focuses the map search; Cmd/Ctrl+/ opens and closes the assistant. Key hints shown on desktop.
- Building card: Select Multiple only on touch screens; with a mouse, Shift-click adds buildings and parcels.
- Geocoding retries cached misses and places addresses that have no usable house number.

### 3:17 PM CT: Project news from Google News (9f78567, 817338f)
- News searches Google News first, GDELT as a fallback (GDELT was refusing or rate-limiting the site's server).
- One-word company names get construction context added so the search finds the right company.

### 3:14 PM CT: High-res site imagery (e064153)
- Site Imagery shows dated sub-metre aerial versions from the Esri World Imagery archive (Wayback) and USDA NAIP, alongside NASA's 30 m passes.

### 3:10 PM CT: Data pipeline fixes (f6d574b, ddb95f9)
- A push conflict on `data/` no longer throws away a nightly run.
- Statewide load strips NUL characters before writing to Supabase (a Fort Bend filing failed on one).

### 2:59 PM CT: Assistant and map fixes (6e9e070, 6bda349, 80112c3)
- Assistant stops detouring to the wrong street, adds a "Tell me more" pill, wider drawer.
- The open filing always shows on the map, even when filters would hide it.
- Downtown zooms stop at district level; outlines no longer jump to the globe.

### 2:52 PM CT: Search, camera, list and Sources tab; team notes without sign-in (e2bdf41, 617d1fd)
- Fixed address search and the 3D camera getting stuck; the list panel is resizable; new **Sources** tab with every data source and how fresh it is.
- Team field notes sync through `/api/field` with no sign-in (optional team passcode).

### 2:43 PM CT: Button labels, NASA previews, drive routes (73495ab)
- Title Case buttons; NASA image previews with download; the drive route clears when the card closes.

### 2:31 PM CT: Team field notes in Supabase (b098fb7)
- Shared notes and photos and personal watchlists stored in Supabase (email-code sign-in prepared).

### 2:23 PM CT: Building size and heights (8236ae5, dff7f56, b52ed08)
- Building square footage and roof heights from USGS 3DEP lidar; select multiple buildings or parcels; nearest-place search.

### 2:14 PM CT: Live-data history (b7c03a6)
- News, NASA passes, weather, storms and census tracts saved to Supabase nightly so they build up a history.

### 2:06 PM CT: Search sections and assistant behavior (7be1e77)
- Search results split into addresses, places, projects, companies and filings.
- Assistant answers without moving the map unless asked; follow-up pills; plain-text replies.
- County lines from Census TIGER/Line.

### 1:35 PM CT: Live layers, map search, Compare, export (e5153b1, 75248a0)
- Rain radar, lightning, clouds, hurricanes, wind, traffic, 3D terrain, NASA imagery; drive time, weather, site imagery and news on every card and by voice.
- Map search with place outlines, Compare areas, custom metrics, export dialog, costs with cents.

### 1:02 PM CT: Assistant camera and statewide fix (4cb2456, 8a6e0cf)
- Assistant orbits exact filings and landmarks, zooms close on buildings, drops stray filters.
- Statewide load rounds costs to whole dollars (a decimal cost broke the Harris insert).

### 12:02 PM CT: Voice (383e588)
- Voice assistant answers when you stop talking, shows the full transcript and sees what's on screen.

### 11:25 AM CT: Assistant fix, tabs, workflows (a9a0d28, efa3a10)
- Assistant moved to the Responses API; building highlight and notes menu fixed; Activity and Updates tabs; more spacing.
- Workflows use the Production environment, where the secrets are stored.

### 8:54 AM CT: AI assistant, geocoding, statewide loader (645a91c, 7fe6148, 493f280, 57cc4f8, e94fbe8, 7c9722e)
- AI assistant with map tools and voice; activity heatmap; uniform dots; quieter dot grid; timeline selection.
- Geocoding with Texas 911 address points; the building panel uses parcel identify (the parcel service refuses queries).
- Statewide loader sized for the Supabase free tier (3 years); diagnostic probe workflows for the parcel and address services.

### 1:01 AM CT: Statewide database, accurate geocoding (cb40277, ca65f1c)
- All Texas counties backfilled into Supabase.
- Geocoding checks parcels first and validates every point; the data workflows authenticate with GitHub OIDC (no stored keys).

### 12:18 AM CT: Nightly refresh and AI model settings (af5e2fd, 091a477, 96110e4, d698f65)
- Data refreshes nightly; "this week" covers the last 7 days of runs; 13 months of change history kept.
- Default OpenAI model and reasoning effort settings; optional cheaper model for bulk tagging.

## 2026-10-01

### 11:56 PM CT: Census fix (9a01af1)
- Census ACS requests use the documented form and log the reply on errors.

### 11:08 PM CT: Phone and tablet (7e61404)
- Phone and tablet layouts, field notes, watchlist, installable app.

### 10:18 PM CT: 3D buildings and fixes (626fd66, d2302b9, 8c2fca4)
- 3D buildings and a free building click-in panel (parcel, businesses, filings).
- Holding page instead of a failed deploy before the first data run; data commit step fixed.

### 8:43 PM CT: AI, timelines, change feed (7f45a72, 6b1b16b)
- AI tagging of filings, construction timelines, the nightly change feed and census market context.

### 5:42 PM CT: First version (17d820f)
- Map of TDLR TABS construction filings for Waller and the six surrounding counties.
