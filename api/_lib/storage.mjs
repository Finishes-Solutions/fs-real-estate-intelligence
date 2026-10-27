// A private Supabase Storage bucket through the server's connection (api/field.js conn): list, sign, read, write and
// remove under paths kept URL-safe. Shared by the reference files (api/sitefiles.js) and the report sets
// (api/feasibility.js).
const J = { 'Content-Type': 'application/json' };
export const enc = p => p.split('/').map(encodeURIComponent).join('/');
export const noBucket = e => /bucket not found/i.test(e?.message || '');
export function storage(db, bucket) {
  return {
    list: prefix => db.json('/storage/v1/object/list/' + bucket, { method: 'POST', headers: J, body: JSON.stringify({ prefix, limit: 200, offset: 0, sortBy: { column: 'created_at', order: 'desc' } }) }),
    signUpload: path => db.json('/storage/v1/object/upload/sign/' + bucket + '/' + enc(path), { method: 'POST', headers: J, body: '{}' }),
    signGet: path => db.json('/storage/v1/object/sign/' + bucket + '/' + enc(path), { method: 'POST', headers: J, body: JSON.stringify({ expiresIn: 600 }) }),
    get: path => db.call('/storage/v1/object/' + bucket + '/' + enc(path)),
    put: (path, body, type) => db.call('/storage/v1/object/' + bucket + '/' + enc(path), { method: 'POST', body, headers: { 'Content-Type': type, 'x-upsert': 'true' } }),
    remove: paths => db.call('/storage/v1/object/' + bucket, { method: 'DELETE', headers: J, body: JSON.stringify({ prefixes: paths }) })
  };
}
// a signed link's full URL (the API has answered with signedURL and with signedUrl)
export const signedUrl = (db, s) => db.url + '/storage/v1' + (s?.signedURL || s?.signedUrl || '');
