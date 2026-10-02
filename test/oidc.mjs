// verifyGitHub: accepts a token signed by the (mocked) GitHub JWKS for this repo; rejects the rest.
import assert from 'node:assert';
import { verifyGitHub, REPO, AUDIENCE } from '../lib/oidc.mjs';
const { publicKey, privateKey } = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const jwk = { ...(await crypto.subtle.exportKey('jwk', publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
globalThis.fetch = async url => { assert.match(String(url), /token\.actions\.githubusercontent\.com\/\.well-known\/jwks/); return new Response(JSON.stringify({ keys: [jwk] })); };
const b64 = o => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
async function sign(claims, kid = 'k1') {
  const h = b64({ alg: 'RS256', kid }), p = b64(claims);
  const s = Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, new TextEncoder().encode(h + '.' + p))).toString('base64url');
  return h + '.' + p + '.' + s;
}
const now = Math.floor(Date.now() / 1000), good = { iss: 'https://token.actions.githubusercontent.com', aud: AUDIENCE, repository: REPO, exp: now + 300, nbf: now - 5 };
assert.equal((await verifyGitHub(await sign(good))).repository, REPO);
for (const [name, c] of [['other repo', { ...good, repository: 'evil/repo' }], ['other audience', { ...good, aud: 'x' }], ['expired', { ...good, exp: now - 10 }], ['other issuer', { ...good, iss: 'https://evil' }]])
  await assert.rejects(verifyGitHub(await sign(c)), Error, name);
const t = await sign(good), forged = t.split('.'); forged[1] = b64({ ...good, repository: REPO + 'x' });
await assert.rejects(verifyGitHub(forged.join('.')), /signature|repository/);
await assert.rejects(verifyGitHub(await sign(good, 'nope')), /unknown/);
console.log('oidc tests passed');
