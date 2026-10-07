/// <reference path="../pb_data/types.d.ts" />

/**
 * The vault's version: each change says which one it was made from (see main.pb.js), so of
 * two devices changing it at once (the password on one, a new recovery code on the other)
 * the second is refused instead of undoing the first.
 */
migrate(
  (app) => {
    const vaults = app.findCollectionByNameOrId('vaults');
    vaults.fields.add(new NumberField({ name: 'version', min: 0, onlyInt: true }));
    app.save(vaults);
  },
  (app) => {
    const vaults = app.findCollectionByNameOrId('vaults');
    vaults.fields.removeByName('version');
    app.save(vaults);
  },
);
