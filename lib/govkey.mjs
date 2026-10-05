// The api.data.gov key (GOV_API_KEY on Vercel). One key works for every federal API behind api.data.gov: the FBI Crime
// Data Explorer, NREL, FEC, regulations.gov, USDA, FDA and others. Server-side only; never sent to the browser.
// FBI_API_KEY is still read for older setups.
export const govKey = (env = process.env) => env.GOV_API_KEY || env.FBI_API_KEY || null;
