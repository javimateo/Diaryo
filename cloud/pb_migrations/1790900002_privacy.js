/// <reference path="../pb_data/types.d.ts" />

/**
 * The server keeps only what it needs (see the privacy policy): an account is its email.
 * Google's name and picture aren't copied any more, and the fields that held them (and
 * what they held) go away.
 */
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users');
    users.oauth2.mappedFields.name = '';
    users.oauth2.mappedFields.avatarURL = '';
    users.fields.removeByName('name');
    users.fields.removeByName('avatar');
    app.save(users);
  },
  (app) => {
    const users = app.findCollectionByNameOrId('users');
    users.fields.add(new TextField({ name: 'name', max: 255 }));
    users.fields.add(
      new FileField({
        name: 'avatar',
        maxSelect: 1,
        mimeTypes: ['image/jpeg', 'image/png', 'image/svg+xml', 'image/gif', 'image/webp'],
      }),
    );
    users.oauth2.mappedFields.name = 'name';
    users.oauth2.mappedFields.avatarURL = 'avatar';
    app.save(users);
  },
);
