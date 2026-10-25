/// <reference path="../pb_data/types.d.ts" />

/**
 * The vault's signature (see `signVault` in src/cloud/crypto.ts): made with the diary
 * secret, so the devices only follow a change made on a device of the diary, never one
 * made with the session alone. The server only keeps it.
 */
migrate(
  (app) => {
    const vaults = app.findCollectionByNameOrId('vaults');
    vaults.fields.add(new TextField({ name: 'mac', max: 200 }));
    app.save(vaults);
  },
  (app) => {
    const vaults = app.findCollectionByNameOrId('vaults');
    vaults.fields.removeByName('mac');
    app.save(vaults);
  },
);
