/// <reference path="../pb_data/types.d.ts" />

/**
 * Accounts (see docs/cloud.md): the emails' links open the app ({APP_URL}, the web app),
 * which confirms the email or asks for the new password; and a session lasts 30 days
 * since the last time the app was used (the app renews it).
 */
const email = (es, en, link, button) => `<p>${es[0]}</p>
<p>${es[1]}</p>
<p><a class="btn" href="${link}" target="_blank" rel="noopener">${button}</a></p>
<p style="color:#8c877e">${es[2]}</p>
<hr style="border:0;border-top:1px solid #e7e2d8;margin:24px 0">
<p>${en[0]}</p>
<p>${en[1]}</p>
<p style="color:#8c877e">${en[2]}</p>
<p>diaryo</p>`;

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users');

    users.verificationTemplate.subject = 'Confirma tu email · Confirm your email — diaryo';
    users.verificationTemplate.body = email(
      [
        'Hola:',
        'Pulsa el botón para confirmar tu email en diaryo.',
        'Si no has creado una cuenta, ignora este correo.',
      ],
      [
        'Hi,',
        'Press the button to confirm your email on diaryo.',
        "If you didn't create an account, ignore this email.",
      ],
      '{APP_URL}/?verify={TOKEN}',
      'Confirmar · Confirm',
    );

    users.resetPasswordTemplate.subject = 'Nueva contraseña · New password — diaryo';
    users.resetPasswordTemplate.body = email(
      [
        'Hola:',
        'Pulsa el botón para elegir una contraseña nueva para tu cuenta de diaryo.',
        'Si no lo has pedido tú, ignora este correo: tu contraseña no cambia.',
      ],
      [
        'Hi,',
        'Press the button to choose a new password for your diaryo account.',
        "If you didn't ask for it, ignore this email: your password stays the same.",
      ],
      '{APP_URL}/?reset={TOKEN}',
      'Elegir contraseña · Choose a password',
    );

    users.authToken.duration = 30 * 24 * 60 * 60;
    app.save(users);
  },
  (app) => {
    const users = app.findCollectionByNameOrId('users');
    users.authToken.duration = 7 * 24 * 60 * 60;
    app.save(users);
  },
);
