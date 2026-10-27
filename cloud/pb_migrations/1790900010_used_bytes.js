/// <reference path="../pb_data/types.d.ts" />

/**
 * Each user's space used, kept as each write goes (pb_hooks/items.js) instead of adding up
 * all their items on every write. Hidden and only the server's to change; filled here
 * from the items there are.
 */
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users');
    users.fields.add(new NumberField({ name: 'usedBytes', hidden: true, onlyInt: true }));
    users.updateRule += ' && @request.body.usedBytes:isset = false';
    app.save(users);
    app
      .db()
      .newQuery(
        'UPDATE users SET usedBytes = (SELECT COALESCE(SUM(size), 0) FROM items WHERE items.user = users.id)',
      )
      .execute();
  },
  (app) => {
    const users = app.findCollectionByNameOrId('users');
    users.fields.removeByName('usedBytes');
    users.updateRule = users.updateRule.replace(' && @request.body.usedBytes:isset = false', '');
    app.save(users);
  },
);
