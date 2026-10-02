// GitHub Actions OIDC: lets the data workflow call our own endpoints without a stored secret.
//   Workflow side: idToken(audience) -> short-lived JWT signed by GitHub (needs `permissions: id-token: write`).
//   Server side:   verifyGitHub(token, { audience, repository }) -> claims, or throws.
const ISS = 'https://token.actions.githubusercontent.com';
export const REPO = 'Finishes-Solutions/fs-real-estate-intelligence';
export const AUDIENCE = 'fs-real-estate-pipeline';

const b64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), c => c.charCodeAt(0));
let jwks = null, jwksAt = 0;
async function keyFor(kid) {
  if (!jwks || Date.now() - jwksAt > 36e5 || !jwks.keys.some(k => k.kid === kid)) { jwks = await (await fetch(ISS + '/.well-known/jwks')).json(); jwksAt = Date.now(); }
  const jwk = jwks.keys.find(k => k.kid === kid); if (!jwk) throw new Error('unknown signing key');
  return crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
}
export async function verifyGitHub(token, { audience = AUDIENCE, repository = REPO } = {}) {
  const [h, p, s] = String(token || '').split('.'); if (!s) throw new Error('missing token');
  const head = JSON.parse(new TextDecoder().decode(b64u(h))), claims = JSON.parse(new TextDecoder().decode(b64u(p)));
  if (head.alg !== 'RS256') throw new Error('bad alg');
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', await keyFor(head.kid), b64u(s), new TextEncoder().encode(h + '.' + p));
  if (!ok) throw new Error('bad signature');
  const now = Date.now() / 1000;
  if (claims.iss !== ISS || claims.exp < now || (claims.nbf && claims.nbf > now + 60)) throw new Error('expired or wrong issuer');
  if ([].concat(claims.aud).indexOf(audience) < 0) throw new Error('wrong audience');
  if (String(claims.repository).toLowerCase() !== repository.toLowerCase()) throw new Error('wrong repository');
  return claims;
}

// Workflow side. Tokens are cached ~4 minutes.
let tok = null, tokAt = 0;
export function canMintToken(env = process.env) { return !!(env.ACTIONS_ID_TOKEN_REQUEST_URL && env.ACTIONS_ID_TOKEN_REQUEST_TOKEN); }
export async function idToken(audience = AUDIENCE, env = process.env) {
  if (tok && Date.now() - tokAt < 24e4) return tok;
  const r = await fetch(env.ACTIONS_ID_TOKEN_REQUEST_URL + '&audience=' + encodeURIComponent(audience), { headers: { Authorization: 'Bearer ' + env.ACTIONS_ID_TOKEN_REQUEST_TOKEN } });
  if (!r.ok) throw new Error('GitHub OIDC token request failed: ' + r.status);
  tok = (await r.json()).value; tokAt = Date.now(); return tok;
}
