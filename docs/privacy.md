# The diary encrypted on the device

Optional. Without it, the diary is saved readable on the device (IndexedDB, and the
desktop's backups), as it always was; the cloud's encryption (see [cloud](cloud.md)) only
protects what goes up. With it, what is saved on the device is encrypted too, and the
app asks for the diary password when it opens.

It protects the diary **at rest**: someone with the computer, its disk or a copy of the
browser's profile can't read it. It doesn't protect a diary that is open (whoever uses
the app then sees it), the system's memory (swap, hibernation) or what the browser
itself keeps besides the database.

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
- With the diary encrypted, the cloud's keys aren't kept on disk (`diaryo-keys`): they
  come from the secret each time the diary is unlocked.

All of it is in `src/cloud/lock.ts` (the actions) and `src/cloud/lockState.ts` (what is
kept: `diaryo:lock` in the local storage, with the vault, its version, the account and the
wrapped key; and the secret, only in memory).

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

## Outside the database

- **Desktop backups** (daily, and the ones before replacing the diary) are encrypted
  too: a `diaryo/sealed` file with the backup sealed with the device's key, plus the vault
  and the wrapped key (`serializeSealed` in `src/storage/files.ts`). It opens at once on
  a device with that diary unlocked, and anywhere else with the diary password or the
  recovery code of when it was made.
- **"Save a copy"** asks: encrypted (the default) or readable.
- **The desktop mini diary** only shows the cover: today's page isn't written to the
  local storage.
- Signing out and **removing the diary from the device** leaves a blank diary without
  encryption.
