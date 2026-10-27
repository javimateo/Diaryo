/**
 * Deleting an account with a code sent to its email (see main.pb.js): someone with the
 * session but not the email can't delete it. The code has 6 digits, lasts 10 minutes and
 * allows 5 wrong tries; only its hash is kept.
 */

const LASTS = 10 * 60 * 1000;
const TRIES = 5;

const email = (code) => `<p>Hola:</p>
<p>Este es el código para borrar tu cuenta de diaryo y su diario de la nube:</p>
<p style="font-size:28px;letter-spacing:6px;font-weight:600">${code}</p>
<p style="color:#8c877e">Caduca en 10 minutos. Si no lo has pedido tú, no lo compartas con nadie y cambia la contraseña de tu cuenta.</p>
<hr style="border:0;border-top:1px solid #e7e2d8;margin:24px 0">
<p>Hi,</p>
<p>This is the code to delete your diaryo account and its diary in the cloud: <strong>${code}</strong></p>
<p style="color:#8c877e">It expires in 10 minutes. If you didn't ask for it, don't share it with anyone and change your account's password.</p>
<p>diaryo</p>`;

module.exports = {
  /** @param {core.RequestEvent} e */
  sendDeleteCode(e) {
    const user = e.app.findRecordById('users', e.auth.id);
    const code = $security.randomStringWithAlphabet(6, '0123456789');
    user.set('deleteCode', $security.sha256(code));
    user.set('deleteCodeExpires', Date.now() + LASTS);
    user.set('deleteTries', 0);
    e.app.save(user);
    const meta = e.app.settings().meta;
    e.app.newMailClient().send(
      new MailerMessage({
        from: { address: meta.senderAddress, name: meta.senderName },
        to: [{ address: user.email() }],
        subject: 'Código para borrar tu cuenta · Code to delete your account — diaryo',
        html: email(code),
      }),
    );
    return e.noContent(204);
  },

  /** @param {core.RequestEvent} e */
  deleteAccount(e) {
    const user = e.app.findRecordById('users', e.auth.id);
    const code = String(e.requestInfo().body.code ?? '');
    const stored = user.getString('deleteCode');
    const tries = user.getInt('deleteTries');
    const valid = stored !== '' && user.getInt('deleteCodeExpires') > Date.now() && tries < TRIES;
    if (!valid || !$security.equal($security.sha256(code), stored)) {
      if (valid) {
        user.set('deleteTries', tries + 1);
        e.app.save(user);
      }
      throw new BadRequestError('The code is wrong or expired.', {
        code: new ValidationError('invalid_code', 'The code is wrong or expired.'),
      });
    }
    // Its vault and items go with it (cascade).
    e.app.delete(user);
    return e.noContent(204);
  },
};
