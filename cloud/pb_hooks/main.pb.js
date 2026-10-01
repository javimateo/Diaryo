/// <reference path="../pb_data/types.d.ts" />

/** Free plan: storage for each new account (OAuth2 sign-ups too). */
onRecordCreate((e) => {
  if (!e.record.getInt('quotaBytes')) e.record.set('quotaBytes', 100 * 1024 * 1024);
  if (!e.record.getString('plan')) e.record.set('plan', 'free');
  e.next();
}, 'users');

// Every saved item goes through the same checks (pb_hooks/items.js). Each hook runs in
// its own context, so the module is required inside.
onRecordCreateRequest((e) => {
  require(`${__hooks}/items.js`).checkItem(e, null);
  e.next();
}, 'items');

onRecordUpdateRequest((e) => {
  require(`${__hooks}/items.js`).checkItem(e, e.record.original());
  e.next();
}, 'items');
