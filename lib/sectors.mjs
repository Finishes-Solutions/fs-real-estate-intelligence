// NAICS sectors, shared by the build (LODES jobs, Comptroller permits), api/tenants and the browser.
// In LODES column order (CNS01..CNS20); the 2-digit codes let the Comptroller's NAICS codes share the labels
export const SECTORS = [['11', 'Agriculture'], ['21', 'Mining, oil & gas'], ['22', 'Utilities'], ['23', 'Construction'], ['31', 'Manufacturing'], ['42', 'Wholesale'],
  ['44', 'Retail'], ['48', 'Transportation & warehousing'], ['51', 'Information'], ['52', 'Finance & insurance'], ['53', 'Real estate'], ['54', 'Professional services'],
  ['55', 'Corporate offices'], ['56', 'Admin & support services'], ['61', 'Education'], ['62', 'Health care'], ['71', 'Arts & recreation'], ['72', 'Hotels & restaurants'],
  ['81', 'Other services'], ['92', 'Public administration']];
const N2S = { 32: '31', 33: '31', 45: '44', 49: '48' };
export function sectorOf(naics) { const two = String(naics || '').slice(0, 2), k = N2S[two] || two, i = SECTORS.findIndex(s => s[0] === k); return i < 0 ? null : i; }
