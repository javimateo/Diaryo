# The diary password on the device

Optional, in Settings → Privacy, on three levels:

- **Nothing**: the diary is saved readable on the device (IndexedDB, and the desktop's
  backups), as it always was; the cloud's encryption (see [cloud](cloud.md)) only
  protects what goes up.
- **Only what is private**: the notes marked as private are encrypted, and need the
  diary password to be seen, even with the rest of the diary open (see Private notes).
- **The whole diary**: everything saved on the device is encrypted, and the app asks for
  the diary password when it opens. Private notes still ask for it again.

The whole diary encrypted protects it **at rest**: someone with the computer, its disk or
a copy of the browser's profile can't read it. Private notes protect their text from
whoever uses the app while it is open too. Neither protects the system's memory (swap,
hibernation) or what the browser itself keeps besides the database.

## One diary password

The password and the recovery code are the cloud's ones (`src/cloud/crypto.ts`): one
password and one code for the whole diary, on every device.

- **The device's key**: 32 random bytes that encrypt the diary on this device. It never
  changes: changing the password, making a new code or signing in with another account
  only wraps it again; the diary is never encrypted again.
- It is wrapped with a key that comes from the **diary secret** (HKDF, `diaryo device`).
  The secret comes from the password or the recovery code, as in the cloud.
- **Without an account**, the device has its own vault (the same format as the cloud's).
  Setting the cloud up afterwards uploads that vault as it is: same password, same code.
- **Signed in with a cloud diary**, the device keeps a copy of the account's vault, to
  open without a connection. A password changed on another device reaches it the next
  time it sees the cloud (and, if the old one no longer opens it there, the new one is
  tried against the cloud's vault). The first time with an account that had a diary of
  its own, unlocking its cloud wraps the device's key with that account's secret: from
  then on, the password here is that account's (the app says so).
- With the whole diary encrypted, the cloud's keys aren't kept on disk (`diaryo-keys`):
  they come from the secret each time the diary is unlocked.

All of it is in `src/cloud/lock.ts` (the actions) and `src/cloud/lockState.ts` (what is
kept: `diaryo:lock` in the local storage, with the level, the vault, its version, the
account and the wrapped key; and the secret, only in memory).

Losing both the password and the recovery code means losing the diary on this device,
and the cloud's copy too (it is encrypted with the same secret). The devices where it is
open keep it. The lock screen offers to delete it from this device and start a new one.

## What is encrypted

`src/storage/sealing.ts` is a Dexie middleware right above IndexedDB: every row of the
diary's tables keeps in the clear only what IndexedDB indexes, and the rest goes,
encrypted, in `sealed`.

| Table      | In the clear (indexes)       | Encrypted                                    |
| ---------- | ---------------------------- | -------------------------------------------- |
| `pages`    | `id`, `date`, `updatedAt`    | Title, thumbnail, view, bookmark, paper…     |
| `elements` | `pageId`, `id`               | The whole element                            |
| `assets`   | `id`                         | The image                                    |
| `fonts`    | `id`                         | Its name and file                            |
| `tracked`  | Everything (paths and times) | — (ids and times, as the cloud's are opaque) |

So which days have pages shows, not what they say. The cipher is XChaCha20-Poly1305
(`@noble/ciphers`), with a random nonce per row, bound to the table and the row's key (a
row moved elsewhere doesn't open). It is synchronous on purpose: Web Crypto is
asynchronous, and waiting for it inside an IndexedDB transaction closes the transaction.
That way the rest of `storage` and the sync don't know about it, and their tests run
again with every diary encrypted (the `sealed` Vitest project, `vite.config.ts`).

Measured (Node): decrypting 5 000 elements takes about 130 ms; a 1.5 MB image, about 20 ms.
Search reads every text from the database, as before.

**Turning it on or off** rewrites the whole diary in batches of 100 rows (`rewriteDiary`
in `src/storage/db.ts`), showing the progress. Both kinds of rows are read, so a rewrite
cut halfway (the app closed) is carried on the next time the diary is unlocked. It isn't a
change for the other devices.

## Locked and unlocked

- `startLock` runs before anything reads the diary. Encrypted, the app shows only the
  lock screen (`src/ui/LockScreen.tsx`): the canvas, the sync and the account start once
  it is open. On the desktop, the locked window still answers the desktop side (it is
  shown in its mode, put away and quit).
- **Several windows** (tabs, the desk on the Windows desktop): they share the secret
  through a `BroadcastChannel`, only in memory. One that starts locked asks for it;
  unlocking one opens the others; "Lock now" locks them all (each one starts again, so
  nothing stays in memory). Turning it on or off in one is told to the others.
- **"Lock now"** (Settings → Privacy, and the command palette) saves what is pending and
  starts the app again.

## Private notes

A note marked as private (its context menu, or the command palette) keeps its text and
its link in a `box`, encrypted with the **private key**: HKDF of the diary secret
(`diaryo private`), the same on every device of the diary. Its size, place, color and
style stay as they are, so it shows in its place with a padlock, and can be moved, styled,
deleted or joined with arrows while hidden; seeing or editing its text asks for the
password (double click, or "Show what is private").

- In `src/storage/sealing.ts`, with the rest: a private note is always written with its
  text in the box (`boxNote`), and read with it only while the private key is in memory;
  otherwise it comes `concealed` (empty text, the box as it is). A note moved while hidden
  keeps its box.
- **It travels and is backed up with its text in the box**, even while shown
  (`privateForTransport`, in `readPath` and `dumpDiary`): the cloud's items and the
  `.diaryo` files (also readable ones) never carry it in the clear, and any device with
  the diary password opens it. A device without the password set (it came from the cloud)
  asks for the account's diary password the first time, and keeps it for them from then
  on.
- **Shown and hidden**: showing them asks for the password and passes the key to every
  window; hiding them (by hand, after 15 minutes or an hour, or on minimizing, as the
  settings say) drops it. Either way each window saves what is pending, switches the key
  and loads the page and the desk again, so undo starts again and can't bring a text
  back (`applyPrivateKey` in `lockState.ts`, `startPrivacy` in `src/ui/privateActions.ts`).
- **Thumbnails and the mini diary** draw them with the padlock even while shown; search
  only finds their text while shown.
- **Removing the password** with private notes asks first: keep them as normal notes
  (their text in the clear) or delete them; the other devices follow.
- **Another account's password**: the first time with an account that had a diary of its
  own, its secret is another one, so the private notes' text goes into boxes with the new
  key (`reboxPrivateNotes`). That needs the old secret: if the notes are hidden, unlocking
  that cloud asks to show them first.

## Outside the database

- With the whole diary encrypted, **desktop backups** (daily, and the ones before
  replacing the diary) are encrypted too: a `diaryo/sealed` file with the backup sealed with the device's key, plus the vault
  and the wrapped key (`serializeSealed` in `src/storage/files.ts`). It opens at once on
  a device with that diary unlocked, and anywhere else with the diary password or the
  recovery code of when it was made.
- **"Save a copy"** asks: encrypted (the default) or readable.
- **The desktop mini diary** only shows the cover: today's page isn't written to the
  local storage.
- Only private notes encrypted: backups and copies are readable, with the private notes'
  text in their boxes.
- Signing out and **removing the diary from the device** leaves a blank diary without
  encryption.
