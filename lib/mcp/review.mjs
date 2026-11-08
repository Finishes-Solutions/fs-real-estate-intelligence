// The calling agent as the plan's reviewer (lib/mcp/siteplan.mjs site_plan, lib/mcp/plans.mjs plan_edit and plan_get):
// each answer carries a picture of the plan (a JPEG of the same drawing the sheet uses) so the agent can look at it, and
// a "Review it" section that tells it how to judge the plan and to send it back with plan_edit until it is satisfactory.
// Each round is its own call (a new plan_id each time), so the loop can go on as long as it takes without any one call
// running long.
import { planSVG } from '../sitesheet.mjs';
import * as G from '../guardrails.mjs';

export const MAX_ROUNDS = 6;

// the plan as an MCP image block, or null when no picture can be made (no browser): the answer still stands without it
export async function picture(plan, shoot, px = 1400) {
  try {
    const { svg } = planSVG(G.effective(plan), { px });
    const [url] = await shoot([svg], { px, quality: 78 });
    const m = /^data:(image\/[\w+.-]+);base64,(.+)$/.exec(url || '');
    return m ? { type: 'image', data: m[2], mimeType: m[1] } : null;
  } catch (e) { return null; }
}

// what the agent does with the answer: judge it, then revise with plan_edit until it is right
export function reviewLines(planId, { verdict = '', round = 0, pictured = true } = {}) {
  if (!planId) return [];
  const v = String(verdict || '').toLowerCase(), ready = v === 'ready';
  return ['', '## Review it before handing it on (you are the reviewer' + (round ? ', round ' + round : '') + ')',
    (pictured ? 'Look at the picture (the street is at the bottom) and the numbers' : 'Read the numbers and pieces (no picture this time: plan_export with formats ["image"] makes one)') + ' as a site planner would, against what was asked. Satisfactory means all of:',
    '- the quality check is READY, or READY WITH NOTES with notes you would accept' + (v ? ' (now: ' + v.toUpperCase() + ')' : '') + ';',
    '- every ask is done (see the asks and "Not done" above), and the count is what was asked or as many as fit;',
    '- the drawing reads well: a clear way in from the street, buildings facing their parking, no stranded or dead-end parking, amenities and the pond where asked, nothing crammed against the lines.',
    ready ? 'If it all holds, it is done: tell the user what it is and why it works.' : 'If anything falls short, send it back:',
    '- call plan_edit with plan_id "' + planId + '" and the specific fixes in plain words (e.g. "fix the parking", "move the pool between the buildings", "add a second entrance", "fewer units, more open space"); lock what is already right first ("lock the pool");',
    '- review plan_edit\'s answer the same way and repeat, usually 1 to 4 rounds; stop after about ' + MAX_ROUNDS + ' and report what is still open and why;',
    '- if a round makes it worse, carry on from the earlier plan_id (every edit is a new plan_id; plan_compare shows the versions side by side);',
    '- if the request itself can\'t fit the site, say so and offer the closest plan rather than editing forever.',
    'Then tell the user what changed in each round and hand over the final plan_id.'];
}

export const REVIEW_HELP = 'Review loop: you are the reviewer of every site plan. site_plan and plan_edit answer with a picture of the plan and a "Review it" checklist: look at it, and if the quality check isn\'t READY, an ask isn\'t done or the drawing reads badly, call plan_edit with the fixes in words and review again, until it is satisfactory (usually 1 to 4 rounds, at most about ' + MAX_ROUNDS + '); then report what changed and the final plan_id.';
