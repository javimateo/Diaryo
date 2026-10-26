/// <reference path="../pb_data/types.d.ts" />

/**
 * The emails' links carry their token after `#` (`{APP_URL}/#verify=…`): the browser
 * never sends that part to a server, so it isn't kept in the web server's logs. The app
 * still reads the ones sent before, with `?`.
 */
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users');
    users.verificationTemplate.body = users.verificationTemplate.body.replace(
      '/?verify={TOKEN}',
      '/#verify={TOKEN}',
    );
    users.resetPasswordTemplate.body = users.resetPasswordTemplate.body.replace(
      '/?reset={TOKEN}',
      '/#reset={TOKEN}',
    );
    app.save(users);
  },
  (app) => {
    const users = app.findCollectionByNameOrId('users');
    users.verificationTemplate.body = users.verificationTemplate.body.replace(
      '/#verify={TOKEN}',
      '/?verify={TOKEN}',
    );
    users.resetPasswordTemplate.body = users.resetPasswordTemplate.body.replace(
      '/#reset={TOKEN}',
      '/?reset={TOKEN}',
    );
    app.save(users);
  },
);
