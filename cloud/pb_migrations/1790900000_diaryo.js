/// <reference path="../pb_data/types.d.ts" />

/**
 * diaryo's cloud schema (see docs/cloud.md): the users' quota, the vaults (the wrapped
 * diary key) and the items (each page, element and image, encrypted). Everyone only
 * reaches their own records.
 */
migrate(
  (app) => {
    // The quota and the plan are the server's to change, never the user's.
    const users = app.findCollectionByNameOrId('users');
    users.fields.add(new NumberField({ name: 'quotaBytes', min: 0, onlyInt: true }));
    users.fields.add(new TextField({ name: 'plan', max: 20 }));
    users.updateRule =
      'id = @request.auth.id && @request.body.quotaBytes:isset = false && @request.body.plan:isset = false';
    app.save(users);

    const owner = 'user = @request.auth.id';
    const ownerCreates = "@request.auth.id != '' && user = @request.auth.id";

    const vaults = new Collection({
      type: 'base',
      name: 'vaults',
      listRule: owner,
      viewRule: owner,
      createRule: ownerCreates,
      updateRule: `${owner} && @request.body.user:isset = false`,
      deleteRule: owner,
      fields: [
        {
          type: 'relation',
          name: 'user',
          required: true,
          maxSelect: 1,
          collectionId: users.id,
          cascadeDelete: true,
        },
        // How the diary password becomes a key: algorithm, salt and iterations.
        { type: 'json', name: 'kdf', required: true, maxSize: 2000 },
        // The diary key, wrapped with the password's key and with the recovery key.
        { type: 'text', name: 'wrappedKey', required: true, max: 2000 },
        { type: 'text', name: 'recoveryKey', required: true, max: 2000 },
        // A known value encrypted with the diary key: tells a wrong password at once.
        { type: 'text', name: 'check', required: true, max: 2000 },
        { type: 'autodate', name: 'created', onCreate: true },
        { type: 'autodate', name: 'updated', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE UNIQUE INDEX idx_vaults_user ON vaults (user)'],
    });
    app.save(vaults);

    const items = new Collection({
      type: 'base',
      name: 'items',
      listRule: owner,
      viewRule: owner,
      createRule: ownerCreates,
      // The owner and the key never change; nothing is really deleted (tombstones).
      updateRule: `${owner} && @request.body.user:isset = false && @request.body.key:isset = false`,
      deleteRule: null,
      fields: [
        {
          type: 'relation',
          name: 'user',
          required: true,
          maxSelect: 1,
          collectionId: users.id,
          cascadeDelete: true,
        },
        // Opaque: an HMAC of what it is, computed on the device.
        { type: 'text', name: 'key', required: true, max: 100, pattern: '^[A-Za-z0-9_-]+$' },
        {
          type: 'select',
          name: 'kind',
          required: true,
          maxSelect: 1,
          values: ['page', 'element', 'asset'],
        },
        // The encrypted content (base64). Images go here too, so the quota counts it all.
        { type: 'text', name: 'data', max: 15000000 },
        // When the device changed it (ms): the most recent change wins.
        { type: 'number', name: 'modified', required: true, onlyInt: true },
        { type: 'bool', name: 'deleted' },
        // Computed by the server (pb_hooks/items.js), for the quota.
        { type: 'number', name: 'size', onlyInt: true },
        { type: 'autodate', name: 'created', onCreate: true },
        { type: 'autodate', name: 'updated', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_items_user_key ON items (user, key)',
        'CREATE INDEX idx_items_user_updated ON items (user, updated)',
      ],
    });
    app.save(items);
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId('items'));
    app.delete(app.findCollectionByNameOrId('vaults'));
    const users = app.findCollectionByNameOrId('users');
    users.fields.removeByName('quotaBytes');
    users.fields.removeByName('plan');
    users.updateRule = 'id = @request.auth.id';
    app.save(users);
  },
);
