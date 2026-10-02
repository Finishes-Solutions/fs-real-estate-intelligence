// AI enrichment prompt and output schema, shared by the build (build/enrich.mjs) and the site's /api/pipeline-ai proxy.
import { USES } from './taxonomy.mjs';

export const CHUNK = 15;
const str = { type: 'string' };
export const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['items'],
  properties: { items: { type: 'array', items: {
    type: 'object', additionalProperties: false,
    required: ['id', 'use', 'subtype', 'tenant', 'developer', 'architect', 'gc', 'units', 'summary'],
    properties: {
      id: str,
      use: { type: 'string', enum: USES },
      subtype: { type: 'string', description: 'Short specific type, e.g. "urgent care", "QSR with drive-thru", "Class A office", "tilt-wall warehouse". Empty if unclear.' },
      tenant: { type: 'string', description: 'Brand, tenant or operator named in the filing (e.g. "H-E-B", "Chick-fil-A", "Memorial Hermann"). Empty if none.' },
      developer: { type: 'string', description: 'Owner/developer organization in clean title case without LLC/Inc suffixes. Empty if only an individual or unknown.' },
      architect: { type: 'string', description: 'Design / architecture firm if named. Empty otherwise.' },
      gc: { type: 'string', description: 'General contractor if named. Empty otherwise.' },
      units: { type: ['integer', 'null'], description: 'Residential units / beds / keys if stated, else null.' },
      summary: { type: 'string', description: 'One plain sentence (max 140 characters) on what is being built.' }
    } } } }
};
export const SYSTEM = `You classify Texas TDLR accessibility (TABS) construction registrations for a real estate developer's market-intelligence map.
For every filing in the input, return exactly one item with the same id. Use only facts in the filing text; never guess names that are not present.
"use" is the primary real estate use. Owners that are cities, counties, ISDs or the state are Government or Education. Apartments and build-to-rent are Multifamily.`;

