/// <reference path="../pb_data/types.d.ts" />

/**
 * Nothing goes up to the cloud until the account's email is confirmed (with Google it
 * always is): accounts made with any address, in a loop, can't fill the server. Signing in,
 * the vault and pulling work as before; the app keeps the changes here until then.
 */
const VERIFIED = ' && @request.auth.verified = true';

migrate(
  (app) => {
    const items = app.findCollectionByNameOrId('items');
    items.createRule += VERIFIED;
    items.updateRule += VERIFIED;
    app.save(items);
  },
  (app) => {
    const items = app.findCollectionByNameOrId('items');
    items.createRule = items.createRule.replace(VERIFIED, '');
    items.updateRule = items.updateRule.replace(VERIFIED, '');
    app.save(items);
  },
);
