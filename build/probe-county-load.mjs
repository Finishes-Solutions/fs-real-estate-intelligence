// Diagnostic: run the County data loader (build/county-data.mjs) against the live sources without writing anything
// (DRY), with small per-night caps, to see each source's row count and two parsed rows. Run "Probe services" with
// script=county-load.
process.env.DRY ||= '1';
process.env.LOCATE_MAX ||= '300';
process.env.IWUD_MAX ||= '15';
await import('./county-data.mjs');
