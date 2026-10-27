/// <reference path="../pb_data/types.d.ts" />

/**
 * Free plan: storage for each new account (OAuth2 sign-ups too). Always, whatever the
 * sign-up sent: only the server gives a bigger plan, by changing it afterwards.
 */
onRecordCreate((e) => {
  e.record.set('quotaBytes', 50 * 1024 * 1024);
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
    const items = require(`${__hooks}/items.js`);
    const change = items.checkItem(e, null);
    e.next();
    items.addUsed(txApp, e.record.getString('user'), change);
  });
}, 'items');

onRecordUpdateRequest((e) => {
  e.app.runInTransaction((txApp) => {
    e.app = txApp;
    const items = require(`${__hooks}/items.js`);
    const change = items.checkItem(e, txApp.findRecordById('items', e.record.id));
    e.next();
    items.addUsed(txApp, e.record.getString('user'), change);
  });
}, 'items');

// An item deleted (by the administrator; the users never delete them) frees its space.
onRecordAfterDeleteSuccess((e) => {
  require(`${__hooks}/items.js`).addUsed(
    e.app,
    e.record.getString('user'),
    -e.record.getInt('size'),
  );
  e.next();
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
    const user = e.app.findRecordById('users', e.auth.id);
    return e.json(200, { used: user.getInt('usedBytes'), quota: user.getInt('quotaBytes') });
  },
  $apis.requireAuth('users'),
);

// Deleting the account: a code to its email first, then the code (pb_hooks/account.js).
routerAdd(
  'POST',
  '/api/diaryo/delete-code',
  (e) => require(`${__hooks}/account.js`).sendDeleteCode(e),
  $apis.requireAuth('users'),
);
routerAdd(
  'POST',
  '/api/diaryo/delete-account',
  (e) => require(`${__hooks}/account.js`).deleteAccount(e),
  $apis.requireAuth('users'),
);
