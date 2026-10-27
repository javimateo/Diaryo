/// <reference path="../pb_data/types.d.ts" />

/**
 * A vault is never deleted on its own, not even by its owner: the app never does it (it
 * goes with the account, by cascade), and without it the diary in the cloud can't be
 * opened. Someone with the session but not the keys could otherwise make the devices
 * believe there is no cloud diary, and set up a new one over it.
 */
migrate(
  (app) => {
    const vaults = app.findCollectionByNameOrId('vaults');
    vaults.deleteRule = null;
    app.save(vaults);
  },
  (app) => {
    const vaults = app.findCollectionByNameOrId('vaults');
    vaults.deleteRule = 'user = @request.auth.id';
    app.save(vaults);
  },
);
