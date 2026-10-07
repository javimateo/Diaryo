/**
 * Checks the cloud server's rules against a running PocketBase (see docs/cloud.md):
 * quotas, who reaches what, last write wins, tombstones, deleting an account. It creates
 * four throwaway users, who delete their own accounts at the end.
 *
 *   PB_URL=http://127.0.0.1:8090 PB_ADMIN_EMAIL=… PB_ADMIN_PASSWORD=… node cloud/check.mjs
 */
const API = `${process.env.PB_URL ?? 'http://127.0.0.1:8090'}/api`;
const ADMIN = { identity: process.env.PB_ADMIN_EMAIL, password: process.env.PB_ADMIN_PASSWORD };
const call = async (method, path, body, token) => {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
};
const results = [];
const check = (name, ok, extra = '') =>
  results.push(`${ok ? 'OK ' : 'FAIL'} ${name} ${ok ? '' : extra}`);

const stamp = Date.now();
const mk = async (n, extra = {}) => {
  const email = `u${n}-${stamp}@diaryo.test`;
  const c = await call('POST', '/collections/users/records', {
    email,
    password: 'secret12345',
    passwordConfirm: 'secret12345',
    ...extra,
  });
  const a = await call('POST', '/collections/users/auth-with-password', {
    identity: email,
    password: 'secret12345',
  });
  return { id: c.body.id, token: a.body.token, record: a.body.record };
};
const a = await mk(1),
  b = await mk(2);
check(
  'new user gets 100 MB free',
  a.record.quotaBytes === 104857600 && a.record.plan === 'free',
  JSON.stringify(a.record),
);
const selfQuota = await call(
  'PATCH',
  `/collections/users/records/${a.id}`,
  { quotaBytes: 999999999 },
  a.token,
);
check('user cannot raise their own quota', selfQuota.status >= 400, selfQuota.status);
const greedy = await mk(3, { quotaBytes: 999999999, plan: 'pro' });
check(
  'a sign-up cannot choose its quota or plan',
  greedy.record.quotaBytes === 104857600 && greedy.record.plan === 'free',
  JSON.stringify(greedy.record),
);

const vault = await call(
  'POST',
  '/collections/vaults/records',
  {
    user: a.id,
    kdf: { alg: 'PBKDF2', iterations: 600000, salt: 'c2FsdA' },
    wrappedKey: 'w',
    recoveryKey: 'r',
    check: 'c',
  },
  a.token,
);
check('owner creates their vault', vault.status === 200, JSON.stringify(vault.body));
const vault2 = await call(
  'POST',
  '/collections/vaults/records',
  { user: a.id, kdf: {}, wrappedKey: 'w', recoveryKey: 'r', check: 'c' },
  a.token,
);
check('only one vault per user', vault2.status >= 400, vault2.status);
const foreignVault = await call(
  'POST',
  '/collections/vaults/records',
  { user: a.id, kdf: {}, wrappedKey: 'w', recoveryKey: 'r', check: 'c' },
  b.token,
);
check('nobody creates a vault for someone else', foreignVault.status >= 400, foreignVault.status);

const item = await call(
  'POST',
  '/collections/items/records',
  { user: a.id, key: 'k1', kind: 'element', data: 'x'.repeat(1000), modified: 100, size: 1 },
  a.token,
);
check(
  'owner saves an item; the server sets its size',
  item.status === 200 && item.body.size === 1200,
  JSON.stringify(item.body),
);
const otherList = await call('GET', '/collections/items/records', null, b.token);
check(
  'another user sees none of it',
  otherList.status === 200 && otherList.body.totalItems === 0,
  JSON.stringify(otherList.body),
);
const otherView = await call('GET', `/collections/items/records/${item.body.id}`, null, b.token);
check('another user cannot open it', otherView.status === 404, otherView.status);
const anon = await call('GET', '/collections/items/records', null, null);
check(
  'without signing in, nothing',
  anon.status === 200 && anon.body.totalItems === 0,
  JSON.stringify(anon.body),
);

const stale = await call(
  'PATCH',
  `/collections/items/records/${item.body.id}`,
  { data: 'old', modified: 50 },
  a.token,
);
check(
  'an older change is refused (409)',
  stale.status === 409,
  `${stale.status} ${JSON.stringify(stale.body)}`,
);
const newer = await call(
  'PATCH',
  `/collections/items/records/${item.body.id}`,
  { data: 'new', modified: 150 },
  a.token,
);
check('a newer change goes in', newer.status === 200 && newer.body.data === 'new', newer.status);
const bigTomb = await call(
  'PATCH',
  `/collections/items/records/${item.body.id}`,
  { data: 'x'.repeat(1001), deleted: true, modified: 200 },
  a.token,
);
check('a tombstone carries no content', bigTomb.status === 400, bigTomb.status);
const tomb = await call(
  'PATCH',
  `/collections/items/records/${item.body.id}`,
  { data: 'sealed', deleted: true, modified: 200 },
  a.token,
);
check(
  'a tombstone keeps only its sealed deletion',
  tomb.status === 200 && tomb.body.data === 'sealed' && tomb.body.deleted === true,
  JSON.stringify(tomb.body),
);
const future = await call(
  'PATCH',
  `/collections/items/records/${item.body.id}`,
  { data: 'n', deleted: false, modified: Number.MAX_SAFE_INTEGER },
  a.token,
);
check(
  'a change stamped in the future is stamped now',
  future.status === 200 && Math.abs(future.body.modified - Date.now()) < 60_000,
  JSON.stringify(future.body),
);
const del = await call('DELETE', `/collections/items/records/${item.body.id}`, null, a.token);
check('items are never hard-deleted by clients', del.status >= 400, del.status);
const dup = await call(
  'POST',
  '/collections/items/records',
  { user: a.id, key: 'k1', kind: 'element', data: 'y', modified: 300 },
  a.token,
);
check('one item per key', dup.status >= 400, dup.status);

// Quota: the superuser lowers it to 3 KB.
const su = await call('POST', '/collections/_superusers/auth-with-password', ADMIN);
await call('PATCH', `/collections/users/records/${a.id}`, { quotaBytes: 3000 }, su.body.token);
const fits = await call(
  'POST',
  '/collections/items/records',
  { user: a.id, key: 'k2', kind: 'page', data: 'z'.repeat(1500), modified: 1 },
  a.token,
);
check(
  'within the quota it goes in',
  fits.status === 200,
  `${fits.status} ${JSON.stringify(fits.body)}`,
);
const over = await call(
  'POST',
  '/collections/items/records',
  { user: a.id, key: 'k3', kind: 'asset', data: 'z'.repeat(2000), modified: 1 },
  a.token,
);
check(
  'beyond the quota it is refused (403)',
  over.status === 403,
  `${over.status} ${JSON.stringify(over.body)}`,
);
const shrink = await call(
  'PATCH',
  `/collections/items/records/${fits.body.id}`,
  { data: 'z', modified: 2 },
  a.token,
);
check('shrinking is always allowed', shrink.status === 200, shrink.status);

// Many writes at once (a device pushes several in parallel) can't add up past the quota.
const busy = await mk(4);
await call('PATCH', `/collections/users/records/${busy.id}`, { quotaBytes: 3000 }, su.body.token);
await Promise.all(
  Array.from({ length: 10 }, (_, i) =>
    call(
      'POST',
      '/collections/items/records',
      { user: busy.id, key: `p${i}`, kind: 'element', data: 'z'.repeat(1000), modified: 1 },
      busy.token,
    ),
  ),
);
const busyUsage = await call('GET', '/diaryo/usage', null, busy.token);
check(
  'writes at once stay within the quota',
  busyUsage.body.used <= 3000,
  JSON.stringify(busyUsage.body),
);

// The vault changes from the version it was read at: of two changes made from the same
// one (the password on one device, a new recovery code on another), the second is refused
// instead of undoing the first.
const busyVault = await call(
  'POST',
  '/collections/vaults/records',
  { user: busy.id, kdf: { alg: 'PBKDF2' }, wrappedKey: 'w0', recoveryKey: 'r0', check: 'c' },
  busy.token,
);
const vaultUrl = `/collections/vaults/records/${busyVault.body.id}`;
const both = await Promise.all(
  ['w1', 'w2'].map((wrappedKey) =>
    call('PATCH', vaultUrl, { wrappedKey, version: busyVault.body.version + 1 }, busy.token),
  ),
);
check(
  'of two changes to the same vault version, only one goes in',
  both
    .map((r) => r.status)
    .sort()
    .join() === '200,409',
  both.map((r) => r.status).join(),
);
const unversioned = await call('PATCH', vaultUrl, { wrappedKey: 'w3' }, busy.token);
check('a vault change says its version', unversioned.status === 409, unversioned.status);

check(
  'an account keeps no name or picture',
  !('name' in a.record) && !('avatar' in a.record),
  JSON.stringify(a.record),
);

// Each user deletes their own account (as the app does), and their vault and items go
// with it (cascade).
const foreignDelete = await call('DELETE', `/collections/users/records/${a.id}`, null, b.token);
check('nobody deletes someone else', foreignDelete.status === 404, foreignDelete.status);
for (const u of [a, b, greedy, busy]) {
  const gone = await call('DELETE', `/collections/users/records/${u.id}`, null, u.token);
  check('a user deletes their own account', gone.status === 204, gone.status);
}
const left = async (collection) =>
  (
    await call(
      'GET',
      `/collections/${collection}/records?filter=${encodeURIComponent(`user = "${a.id}"`)}`,
      null,
      su.body.token,
    )
  ).body.totalItems;
const [vaultsLeft, itemsLeft] = [await left('vaults'), await left('items')];
check(
  'its vault and items go with it',
  vaultsLeft === 0 && itemsLeft === 0,
  `${vaultsLeft} ${itemsLeft}`,
);

console.log(results.join('\n'));
if (results.some((line) => line.startsWith('FAIL'))) process.exit(1);
