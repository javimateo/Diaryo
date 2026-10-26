/**
 * Checks the cloud server's rules against a running PocketBase (see docs/cloud.md):
 * quotas, who reaches what, last write wins, tombstones, deleting an account, the limits
 * on requests. It creates a few throwaway users, who delete their own accounts at the end.
 *
 * The administrator signs in with a second factor: a one-time password made with
 * `pocketbase superuser otp <email>`, whose id and password go in PB_ADMIN_OTP_ID and
 * PB_ADMIN_OTP.
 *
 *   PB_URL=http://127.0.0.1:8090 PB_ADMIN_EMAIL=… PB_ADMIN_PASSWORD=…  *     PB_ADMIN_OTP_ID=… PB_ADMIN_OTP=… node cloud/check.mjs
 *
 * Each part of it comes from its own address (`X-Forwarded-For`, as the proxy in front of
 * the server sends it), so the limits of one don't stop another.
 */
const API = `${process.env.PB_URL ?? 'http://127.0.0.1:8090'}/api`;
const ADMIN = { identity: process.env.PB_ADMIN_EMAIL, password: process.env.PB_ADMIN_PASSWORD };
const address = () => `10.${[0, 0, 0].map(() => Math.floor(Math.random() * 250) + 1).join('.')}`;
const call = async (method, path, body, token, from = address()) => {
  const res = await fetch(API + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Forwarded-For': from,
      ...(token ? { Authorization: token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
};
const results = [];
const check = (name, ok, extra = '') =>
  results.push(`${ok ? 'OK ' : 'FAIL'} ${name} ${ok ? '' : extra}`);

// The administrator needs a second factor: the password alone isn't enough.
const first = await call('POST', '/collections/_superusers/auth-with-password', ADMIN);
check(
  'the administrator needs a second factor',
  first.status === 401 && typeof first.body?.mfaId === 'string',
  // Only the status: the body may carry a token.
  first.status,
);
const su = first.body?.token
  ? first
  : await call('POST', '/collections/_superusers/auth-with-otp', {
      otpId: process.env.PB_ADMIN_OTP_ID,
      password: process.env.PB_ADMIN_OTP,
      mfaId: first.body?.mfaId,
    });
if (!su.body?.token)
  throw new Error(`the administrator couldn't sign in: ${JSON.stringify(su.body)}`);

// The emails' links carry their token after #: it never reaches a server's logs.
const users = (await call('GET', '/collections/users', null, su.body.token)).body;
check(
  "the emails' links carry their token after #",
  users.verificationTemplate.body.includes('/#verify={TOKEN}') &&
    users.resetPasswordTemplate.body.includes('/#reset={TOKEN}'),
);

const stamp = Date.now();
/** A throwaway user, with their email confirmed (by the administrator) unless `verified` is false. */
const mk = async (n, extra = {}, verified = true) => {
  const email = `u${n}-${stamp}@diaryo.test`;
  const c = await call('POST', '/collections/users/records', {
    email,
    password: 'secret12345',
    passwordConfirm: 'secret12345',
    ...extra,
  });
  if (verified) {
    await call(
      'PATCH',
      `/collections/users/records/${c.body.id}`,
      { verified: true },
      su.body.token,
    );
  }
  const a = await call('POST', '/collections/users/auth-with-password', {
    identity: email,
    password: 'secret12345',
  });
  return { email, id: c.body.id, token: a.body.token, record: a.body.record };
};
const a = await mk(1),
  b = await mk(2);
check(
  'new user gets 50 MB free',
  a.record.quotaBytes === 52428800 && a.record.plan === 'free',
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
  greedy.record.quotaBytes === 52428800 && greedy.record.plan === 'free',
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
    mac: 'm',
  },
  a.token,
);
check('owner creates their vault', vault.status === 200, JSON.stringify(vault.body));
check('the vault keeps its signature', vault.body?.mac === 'm', JSON.stringify(vault.body));
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
// Nothing goes up to the cloud until the account's email is confirmed.
const unconfirmed = await mk(5, {}, false);
const early = await call(
  'POST',
  '/collections/items/records',
  { user: unconfirmed.id, key: 'u1', kind: 'element', data: 'x', modified: 1 },
  unconfirmed.token,
);
check('an account without its email confirmed stores nothing', early.status >= 400, early.status);
await call(
  'PATCH',
  `/collections/users/records/${unconfirmed.id}`,
  { verified: true },
  su.body.token,
);
const confirmed = await call(
  'POST',
  '/collections/items/records',
  { user: unconfirmed.id, key: 'u1', kind: 'element', data: 'x', modified: 1 },
  unconfirmed.token,
);
check('once confirmed, it goes up', confirmed.status === 200, confirmed.status);

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

// Limits per address (the proxy's X-Forwarded-For; only its last address counts, the one the
// proxy adds: the ones before it are the client's to write).
const tries = async (n, request) => {
  const answers = [];
  for (let i = 0; i < n; i++) answers.push(await request());
  return answers;
};
const statuses = (answers) => answers.map((r) => r.status);
const guesser = address();
const guesses = await tries(12, () =>
  call(
    'POST',
    '/collections/users/auth-with-password',
    { identity: a.email, password: 'nope1234' },
    null,
    guesser,
  ),
);
check(
  'guessing a password is cut short (429)',
  statuses(guesses).includes(429),
  statuses(guesses).join(),
);
const forged = await call(
  'POST',
  '/collections/users/auth-with-password',
  { identity: a.email, password: 'nope1234' },
  null,
  `${address()}, ${guesser}`,
);
check(
  'a made-up address in front of the real one changes nothing',
  forged.status === 429,
  forged.status,
);
const signer = address();
const signUps = await tries(12, () =>
  call(
    'POST',
    '/collections/users/records',
    {
      email: `spam-${Math.random()}@diaryo.test`,
      password: 'secret12345',
      passwordConfirm: 'secret12345',
    },
    null,
    signer,
  ),
);
check(
  'sign-ups from one address are limited',
  statuses(signUps).includes(429),
  statuses(signUps).join(),
);
// The ones that went in are deleted (by the administrator: they can't sign in from there).
for (const made of signUps.filter((r) => r.status === 200)) {
  await call('DELETE', `/collections/users/records/${made.body.id}`, null, su.body.token);
}
const mailer = address();
const mails = await tries(4, () =>
  call('POST', '/collections/users/request-verification', { email: a.email }, null, mailer),
);
check(
  'emails asked from one address are limited',
  statuses(mails).includes(429),
  statuses(mails).join(),
);

// Each user deletes their own account (as the app does), and their vault and items go
// with it (cascade).
const foreignDelete = await call('DELETE', `/collections/users/records/${a.id}`, null, b.token);
check('nobody deletes someone else', foreignDelete.status === 404, foreignDelete.status);
for (const u of [a, b, greedy, busy, unconfirmed]) {
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
