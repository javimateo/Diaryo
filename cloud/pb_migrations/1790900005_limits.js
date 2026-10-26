/// <reference path="../pb_data/types.d.ts" />

/**
 * Limits on requests, per address, and a second factor for the administrator (see
 * docs/deployment.md):
 *
 * - The address is the one Coolify's proxy (Traefik) adds last to `X-Forwarded-For`: the
 *   ones before it are the client's to write. Without it, every request would look like the
 *   proxy's, and one person would use up everybody's limits.
 * - Signing in, signing up and the emails are limited, so passwords can't be guessed at
 *   speed, accounts made in a loop, nor emails sent to anyone's address over and over. The
 *   sync's own requests aren't: the first sync of a big diary sends thousands at once.
 * - The administrator signs in with the password and a one-time code by email (from the
 *   server's terminal, `pocketbase superuser otp <email>` makes one, if the email fails).
 */
migrate(
  (app) => {
    const settings = app.settings();
    settings.trustedProxy.headers = ['X-Forwarded-For'];
    settings.trustedProxy.useLeftmostIP = false;
    settings.rateLimits.enabled = true;
    settings.rateLimits.rules = [
      // Signing in (password, Google, codes), per minute.
      { label: '*:auth', duration: 60, maxRequests: 10 },
      { label: '*:requestOTP', duration: 60, maxRequests: 3 },
      // Emails to an address: confirming it, a new password.
      { label: '*:requestVerification', duration: 60, maxRequests: 2 },
      { label: '*:requestPasswordReset', duration: 60, maxRequests: 2 },
      { label: '*:confirmPasswordReset', duration: 60, maxRequests: 5 },
      // New accounts, per hour.
      { label: 'users:create', duration: 3600, maxRequests: 10 },
    ];
    app.save(settings);

    const superusers = app.findCollectionByNameOrId('_superusers');
    superusers.otp.enabled = true;
    superusers.mfa.enabled = true;
    app.save(superusers);
  },
  (app) => {
    const settings = app.settings();
    settings.trustedProxy.headers = [];
    settings.rateLimits.enabled = false;
    app.save(settings);

    const superusers = app.findCollectionByNameOrId('_superusers');
    superusers.otp.enabled = false;
    superusers.mfa.enabled = false;
    app.save(superusers);
  },
);
