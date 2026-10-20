# Security

diaryo encrypts diaries on the device and in its cloud, so a weakness there matters a lot.
Thank you for reporting one carefully.

## Reporting a vulnerability

**Please don't open a public issue.** Report it privately through GitHub:
[**Report a vulnerability**](https://github.com/javimateo/Diaryo/security/advisories/new)
(the repository's Security tab → "Report a vulnerability"). Only the maintainer sees it.

Helpful to include:

- what is affected (the web app, the desktop app, the cloud server, a backup file…) and
  which version;
- the steps to reproduce it, or a proof of concept;
- what an attacker would need (the device, a copy of the disk, the session, the server…)
  and what they would get.

## What to expect

- An answer within **7 days**, saying whether it is confirmed.
- A fix as soon as it can be made, in a patch release; the installed apps update
  themselves.
- Once it is fixed, a published advisory crediting you (unless you'd rather not).

This is a project maintained by one person in their free time: there is no bug bounty.

## Scope

Especially welcome:

- the encryption: the vault, the key derivation, the cloud items, the diary encrypted on
  the device, private notes, encrypted backups ([cloud](docs/cloud.md),
  [privacy](docs/privacy.md));
- the cloud server's rules (`cloud/pb_hooks`, `cloud/pb_migrations`): reading or changing
  another user's data, going past the quota;
- a diary's content running code (a script in a text, an image, a backup file), or
  leaving the app;
- the desktop app's updates and the commands the page can call.

Known limits, documented on purpose, aren't vulnerabilities by themselves: for example,
that the encryption is as strong as the diary password, or that IndexedDB may keep old
readable rows for a while after turning the encryption on (see
[privacy](docs/privacy.md)).

Please test only against your own accounts and a local server (see
[CONTRIBUTING](CONTRIBUTING.md#the-cloud-locally)), never against other users' data or
by overloading the public server.

## Supported versions

Only the latest release gets fixes.
