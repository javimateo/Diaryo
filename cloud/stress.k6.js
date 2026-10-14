/**
 * Load test of the cloud server with k6 (https://k6.io): many users syncing at once.
 * Each virtual user creates a throwaway account, then loops like the app does: pushes a
 * few encrypted-looking elements (now and then an image) and pulls what changed. At the
 * end the throwaway accounts are deleted (with their items).
 *
 *   k6 run -e PB_URL=https://cloud.diaryo.javiermateo.dev \
 *     -e PB_ADMIN_EMAIL=… -e PB_ADMIN_PASSWORD=… cloud/stress.k6.js
 *
 * `-e MAX_USERS=50` sets the peak (default 50); each run moves a few hundred MB.
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import encoding from 'k6/encoding';
import { randomBytes } from 'k6/crypto';

const API = `${__ENV.PB_URL ?? 'http://127.0.0.1:8090'}/api`;
const MAX = Number(__ENV.MAX_USERS ?? 50);
/** Every account of this run starts like this (to delete them at the end). */
const RUN = `stress-${Date.now()}`;

export const options = {
  stages: [
    { duration: '1m', target: Math.ceil(MAX / 5) },
    { duration: '2m', target: Math.ceil(MAX / 2) },
    { duration: '2m', target: MAX },
    { duration: '2m', target: MAX },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{kind:push}': ['p(95)<800'],
    'http_req_duration{kind:pull}': ['p(95)<800'],
  },
};

const json = (token) => ({
  headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: token } : {}) },
});

/** Random data, base 64, as an encrypted item looks. */
const sealed = (bytes) => encoding.b64encode(randomBytes(bytes), 'std');

let me = null;
let cursor = '';

function signUp() {
  const email = `${RUN}-${__VU}@diaryo.test`;
  const password = 'stress-password-123';
  http.post(
    `${API}/collections/users/records`,
    JSON.stringify({ email, password, passwordConfirm: password }),
    json(),
  );
  const auth = http.post(
    `${API}/collections/users/auth-with-password`,
    JSON.stringify({ identity: email, password }),
    json(),
  );
  check(auth, { 'signed in': (r) => r.status === 200 });
  return auth.status === 200 ? { id: auth.json('record.id'), token: auth.json('token') } : null;
}

export default function () {
  me ??= signUp();
  if (!me) return sleep(5);

  // Push: a few elements, and now and then an image.
  const items = Array.from({ length: 5 }, () => 2_000);
  if (Math.random() < 0.1) items.push(300_000);
  for (const size of items) {
    const res = http.post(
      `${API}/collections/items/records`,
      JSON.stringify({
        user: me.id,
        key: encoding.b64encode(randomBytes(32), 'rawurl'),
        kind: size > 10_000 ? 'asset' : 'element',
        data: sealed(size),
        modified: Date.now(),
        deleted: false,
      }),
      { ...json(me.token), tags: { kind: 'push' } },
    );
    check(res, { pushed: (r) => r.status === 200 });
  }

  // Pull: what changed since the last time.
  const filter = cursor ? `&filter=${encodeURIComponent(`updated > "${cursor}"`)}` : '';
  const pulled = http.get(
    `${API}/collections/items/records?perPage=200&sort=updated&skipTotal=1&fields=id,updated${filter}`,
    { ...json(me.token), tags: { kind: 'pull' } },
  );
  check(pulled, { pulled: (r) => r.status === 200 });
  const list = pulled.status === 200 ? pulled.json('items') : [];
  if (list.length > 0) cursor = list[list.length - 1].updated;

  sleep(2 + Math.random() * 3);
}

/** Deletes this run's accounts (their items go with them). */
export function teardown() {
  const admin = http.post(
    `${API}/collections/_superusers/auth-with-password`,
    JSON.stringify({ identity: __ENV.PB_ADMIN_EMAIL, password: __ENV.PB_ADMIN_PASSWORD }),
    json(),
  );
  if (admin.status !== 200) {
    console.error(`Couldn't sign in as superuser: delete the accounts starting with ${RUN} by hand`);
    return;
  }
  const token = admin.json('token');
  for (;;) {
    const page = http.get(
      `${API}/collections/users/records?perPage=200&fields=id&filter=${encodeURIComponent(`email ~ "${RUN}"`)}`,
      json(token),
    );
    const users = page.status === 200 ? page.json('items') : [];
    if (users.length === 0) break;
    for (const user of users) http.del(`${API}/collections/users/records/${user.id}`, null, json(token));
  }
}
