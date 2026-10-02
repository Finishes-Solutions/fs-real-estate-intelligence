// Shared vocabulary for enrichment, filters and the ask-the-map endpoint. Also loaded by the browser.
export const USES = ['Retail', 'Restaurant', 'Medical', 'Education', 'Multifamily', 'Single-family', 'Senior living', 'Office', 'Industrial', 'Hospitality',
  'Self-storage', 'Worship', 'Government', 'Recreation', 'Automotive', 'Bank', 'Childcare', 'Mixed-use', 'Infrastructure', 'Other'];

const SUFFIX = /\b(l\s*l\s*c|l\s*l\s*p|p\s*l\s*l\s*c|l\s*p|ltd|limited|inc|incorporated|corp|corporation|co|company|the|a texas limited liability company|a texas limited partnership)\b/g;

// "ABC Holdings, L.L.C." and "ABC HOLDINGS LLC" -> "abc holdings"
export function entityKey(s) {
  return String(s || '').toLowerCase().replace(/&/g, ' and ').replace(/[.,'’"()]/g, '').replace(/[^a-z0-9 ]+/g, ' ')
    .replace(SUFFIX, ' ').replace(/\s+/g, ' ').trim();
}
