# Changelog

What changes in each version of diaryo. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[semantic versioning](https://semver.org) (see [releasing](docs/releasing.md)).

## [Unreleased]

### Security

- The emails' links carry their token after `#`, so it never reaches the web server's logs
  (the links already sent still work).
- The website sends security headers (it couldn't be framed by another site, among
  others), and the web app turns off the browser features it doesn't use.

## [1.0.1] — 2026-10-26

### Security

- The cloud's vault is signed with the diary secret: a device no longer follows a vault
  changed by someone with the account's session but not the diary password, which could
  leave the diary impossible to open on that device (needs the server's new migration).
- An item in the cloud changed outside diaryo (it doesn't open) no longer goes unnoticed:
  a device that has it puts its version back, and the app says so.
- The cloud server limits sign-ins, sign-ups and emails per address (they could be
  repeated without end), and its administrator signs in with a code by email too.
- Nothing goes up to the cloud until the account's email is confirmed (the app says so,
  and keeps the changes until then).
- The cloud server runs PocketBase 0.40.6 (Go's network fixes) as a user without root
  rights, on supported images (Alpine 3.24, nginx 1.30); the desktop app's TLS libraries
  are up to date.

## [1.0.0] — 2026-10-20

The first stable version.

### Added

- **The cloud** (optional): an account with email and password or Google, and the diary
  synced between the desktop app, the web and the phone, **end-to-end encrypted** with a
  diary password only you know (and a recovery code). Works offline and catches up
  later; the most recent change wins, element by element. Images are compressed and
  unused ones cleaned up. Your data can be downloaded and the account deleted at any
  time; privacy policy and terms on the website.
- **Tasks and appointments**: an `@` date in a line (with a picker while typing it) makes
  a dated task or an appointment, shown as a label like "tomorrow 10:00". **Upcoming**
  lists what is pending; the desktop app reminds you with Windows notifications (also
  of what you missed while it was closed), and anything can go to your calendar as an
  `.ics` file.
- **Privacy on the device**: one diary password encrypts the private notes or the whole
  diary at rest. **Private notes** open one by one and hide again by themselves. For
  shared computers: locking by itself, leaving the diary encrypted on signing out and a
  session only for the tab.
- **The cover**: the closed diary looks like a real one, and its cover can be decorated
  (or started from one of six templates). It shows on the lock screen and in the locked
  mini diary.
- More covers (canvas, denim) and desks (walnut, marble, felt, concrete), with lit
  textures that stay sharp at any zoom.
- Photo frames (polaroid, white border, rounded) with a soft shadow.
- Bold, italic and underline for texts, and 8 more fonts.
- Guides while placing things.
- A welcome page with a short tour, whose steps are little scenes drawn by the engine;
  a welcome window for a new diary (start, sign in, open a copy, language).
- Help: a "How to use" tab with every tool and gesture.
- Settings in seven pages, restorable to their usual values.
- A new brand: the terracotta notebook, new icon and installer images.
- Cloud accounts get 50 MB for free.

### Changed

- The page exported as a PNG shows it as the screen does: the desk, the book and
  everything on them.
- Phones: dialogs fit the visible screen, phones held sideways get their own layout, and
  the cover's editor can be left.

### Fixed

- Strokes drawn very zoomed in keep their shape.
- Reminders of things written right at their time aren't lost.
- The diary doesn't lock by itself in the middle of signing in with Google.
- Parallel writes can't go past the cloud quota, and two vault changes at once can't undo
  each other.
- A sync could keep running with keys that weren't the session's.

### Security

- Cloud items carry their time and deletion sealed inside the encryption: neither the
  server nor someone with the session but not the keys can delete things or bring an old
  version back.
- Vaults asking for absurd PBKDF2 iterations are refused instead of hanging.

## [0.2.0]

See the [release notes on GitHub](https://github.com/javimateo/Diaryo/releases/tag/v0.2.0).

[Unreleased]: https://github.com/javimateo/Diaryo/compare/v1.0.1...develop
[1.0.1]: https://github.com/javimateo/Diaryo/releases/tag/v1.0.1
[1.0.0]: https://github.com/javimateo/Diaryo/releases/tag/v1.0.0
[0.2.0]: https://github.com/javimateo/Diaryo/releases/tag/v0.2.0
