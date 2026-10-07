/// <reference path="../pb_data/types.d.ts" />

/**
 * Free plan: storage for each new account (OAuth2 sign-ups too). Always, whatever the
 * sign-up sent: only the server gives a bigger plan, by changing it afterwards.
 */
onRecordCreate((e) => {
  e.record.set('quotaBytes', 100 * 1024 * 1024);
  e.record.set('plan', 'free');
  e.next();
}, 'users');

// Every saved item goes through the same checks (pb_hooks/items.js). Each hook runs in
// its own context, so the module is required inside. Each write runs in a transaction,
// with its checks: PocketBase has a single connection for writing, so they go one at a
// time, each against what is stored then. Writes arriving at once (a device pushes several
// in parallel) can't all pass the quota, nor undo a newer one.
onRecordCreateRequest((e) => {
  e.app.runInTransaction((txApp) => {
    e.app = txApp;
    require(`${__hooks}/items.js`).checkItem(e, null);
    e.next();
  });
}, 'items');

onRecordUpdateRequest((e) => {
  e.app.runInTransaction((txApp) => {
    e.app = txApp;
    require(`${__hooks}/items.js`).checkItem(e, txApp.findRecordById('items', e.record.id));
    e.next();
  });
}, 'items');

// The vault changes from the version it was read at (the app sends the next one): a change
// made from an older one is refused, so it doesn't undo another device's.
onRecordUpdateRequest((e) => {
  e.app.runInTransaction((txApp) => {
    e.app = txApp;
    const stored = txApp.findRecordById('vaults', e.record.id);
    if (e.record.getInt('version') !== stored.getInt('version') + 1) {
      throw new ApiError(409, 'vault_changed');
    }
    e.next();
  });
}, 'vaults');

// How much of their space the signed-in user is using (the app shows it).
routerAdd(
  'GET',
  '/api/diaryo/usage',
  (e) => {
    const used = new DynamicModel({ total: 0 });
    e.app
      .db()
      .newQuery('SELECT COALESCE(SUM(size), 0) AS total FROM items WHERE user = {:user}')
      .bind({ user: e.auth.id })
      .one(used);
    return e.json(200, { used: used.total, quota: e.auth.getInt('quotaBytes') });
  },
  $apis.requireAuth('users'),
);
