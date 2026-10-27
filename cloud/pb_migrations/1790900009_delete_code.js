/// <reference path="../pb_data/types.d.ts" />

/**
 * Deleting an account takes a code sent to its email (pb_hooks/account.js): the session
 * alone isn't enough. The account keeps the code's hash, until when it lasts and the wrong
 * tries, hidden and only the server's to change; it can't be deleted any other way (only
 * the administrator can).
 */
const FIELDS = ['deleteCode', 'deleteCodeExpires', 'deleteTries'];

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users');
    users.fields.add(new TextField({ name: 'deleteCode', hidden: true, max: 64 }));
    users.fields.add(new NumberField({ name: 'deleteCodeExpires', hidden: true, onlyInt: true }));
    users.fields.add(new NumberField({ name: 'deleteTries', hidden: true, onlyInt: true }));
    users.updateRule += FIELDS.map((name) => ` && @request.body.${name}:isset = false`).join('');
    users.deleteRule = null;
    app.save(users);

    const settings = app.settings();
    settings.rateLimits.rules = [
      ...settings.rateLimits.rules,
      { label: '/api/diaryo/delete-code', duration: 60, maxRequests: 2 },
      { label: '/api/diaryo/delete-account', duration: 60, maxRequests: 20 },
    ];
    app.save(settings);
  },
  (app) => {
    const users = app.findCollectionByNameOrId('users');
    for (const name of FIELDS) users.fields.removeByName(name);
    users.updateRule = users.updateRule.replace(
      FIELDS.map((name) => ` && @request.body.${name}:isset = false`).join(''),
      '',
    );
    users.deleteRule = 'id = @request.auth.id';
    app.save(users);

    const settings = app.settings();
    settings.rateLimits.rules = settings.rateLimits.rules.filter(
      (rule) => !rule.label.startsWith('/api/diaryo/delete-'),
    );
    app.save(settings);
  },
);
