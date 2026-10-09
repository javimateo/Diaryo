# The diary password on the device

Optional, in Settings → Privacy, on three levels:

- **Nothing**: the diary is saved readable on the device (IndexedDB, and the desktop's
  backups), as it always was; the cloud's encryption (see [cloud](cloud.md)) only
  protects what goes up.
- **Only what is private**: the notes marked as private are encrypted, and each one needs
  the diary password to be seen or changed, even with the rest of the diary open (see
  Private notes).
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
  starts the app again. On the desktop it puts the diary away first: the password is
  asked for when it is opened again (the shortcut, the tray), and Esc or a click around
  the lock screen puts it away again. Opened from there, the diary shows at once (the
  window was already visible, so no "shown" comes for it to fade in).

## Private notes

A note marked as private (its context menu, or the command palette) keeps its text and
its link in a `box`, encrypted with the **private key**: HKDF of the diary secret
(`diaryo private`), the same on every device of the diary. Its size, place, color and
style stay as they are, so it shows in its place with a padlock.

- **Each one opens on its own.** Double click (or "Show this note" in its menu) asks for
  the diary password and shows only that note, also on the Windows desktop's desk (the
  dialog opens right there, with the diary put away); the others stay hidden, and showing
  another one asks again. "Show everything private" (the palette, Settings → Privacy)
  shows them all at once. A note shown has an open padlock in its corner: a click there
  hides it again.
- **Hidden, nothing changes it.** It counts as locked (`isLocked` in
  `src/engine/elements.ts`): it isn't selected (not even with its group), moved, styled,
  erased, deleted nor joined with arrows, also with select all, the eraser or the lasso.
  Its own context menu only shows it, or deletes it.
- **Deleting a private note always asks for the password**, shown or hidden: deleting
  (or cutting) a selection with one waits for it (`subscribeDeletePrivate` in the
  engine), the eraser skips them, and so does deleting a page that has them. Once gone,
  they are hidden again, so the key doesn't stay in memory for them. Copying a shown one
  copies its text, in the clear.
- In `src/storage/sealing.ts`, with the rest: a private note is always written with its
  text in the box (`boxNote`), and read with it only if it is one of the notes shown
  (`sealing.shown`) and the private key is in memory; otherwise it comes `concealed`
  (empty text, the box as it is). The key is in memory only while some note is shown.
- **It travels and is backed up with its text in the box**, even while shown
  (`privateForTransport`, in `readPath` and `dumpDiary`): the cloud's items and the
  `.diaryo` files (also readable ones) never carry it in the clear, and any device with
  the diary password opens it. A device without the password set (it came from the cloud)
  asks for the account's diary password the first time, and keeps it for them from then
  on.
- **Shown and hidden** pass to every window (which notes, and the key, through the
  `BroadcastChannel`). Each note hides again by itself 30 seconds, a minute or five
  minutes after it was shown, as the settings say (while it is being edited, it waits);
  the diary's window and the desk's both count, as the desk's is never hidden and its
  timers aren't slowed down (`startPrivacyTimers`). All of them hide when the diary is
  put away, unless the settings say otherwise: minimized, another tab, or on the desktop
  to the tray (its window is hidden then, not minimized: `diaryo://hidden`). Either way
  each window
  keeps the text being written, saves what is pending and loads the page and the desk
  again, so undo starts again and can't bring a text back (`applyPrivacy` in
  `lockState.ts`, `startPrivacy` in `src/ui/privateActions.ts`).
- **Thumbnails and the mini diary** draw them with the padlock even while shown; search
  only finds the text of the ones shown.
- **Removing the password** with private notes asks first: keep them as normal notes
  (their text in the clear) or delete them; the other devices follow.
- **Another account's password**: the first time with an account that had a diary of its
  own, its secret is another one, so the private notes' text goes into boxes with the new
  key (`reboxPrivateNotes`), and the ones shown are hidden. That needs the old secret: if
  the notes are hidden, unlocking that cloud asks to show them first.

## Shared computers

- **Locking by itself** (Settings → Privacy, with the whole diary encrypted): after 5,
  15 or 60 minutes without using it (pointer, keys, wheel), and, with "Lock when put
  away", when the tab changes or it is minimized (on the desktop, also to the tray). It
  is "Lock now" done for the user (`src/ui/autoLock.ts`). Off by default.
- **Signing out, "Leave it encrypted and locked"**: the diary stays on the device, but
  the whole diary is encrypted first if it wasn't (with the cloud's diary password),
  and locked once signed out. It opens offline with that password (its vault is kept
  on the device) or the recovery code.
- **"Keep the session in this browser"** (Settings → Account and cloud, web only), on by
  default. Off, the session lives in the tab's storage (`sessionStorage`, `TabAuthStore`
  in `src/cloud/client.ts`) and the cloud's keys only in memory: closing the tab signs
  out, and another tab asks to sign in. The local copy of the diary stays: for that,
  the option above, or "Remove it from here".

## The Windows desktop

The desk on the Windows desktop is another window (see [architecture](architecture.md)).

- **With the whole diary encrypted, the desk stays out of it** by default, so it shows on
  the desktop while the diary is locked, and can be used there (moving, writing, opening
  a private note with its password). Its rows, its images and the fonts are written in
  the clear (`keptClear` in `src/storage/sealing.ts`); its private notes keep their text
  in their box. Settings → Desktop can put it back in the encryption ("Hidden until
  opened": the desk waits for the password, as the rest). The lock record says which
  (`desk`), and each time the diary is unlocked, or that setting changes, `matchDesk`
  writes again the rows that aren't as they should (an image that left the desk is
  sealed again then).
- **Private notes on the desktop**: with their padlock, or not drawn there at all
  (Settings → Desktop). Not drawn, they aren't loaded in the desk's window (nor touched:
  only changes are saved); in the diary they always show with their padlock.

## Outside the database

- With the whole diary encrypted, **desktop backups** (daily, and the ones before
  replacing the diary) are encrypted too: a `diaryo/sealed` file with the backup sealed with the device's key, plus the vault
  and the wrapped key (`serializeSealed` in `src/storage/files.ts`). It opens at once on
  a device with that diary unlocked, and anywhere else with the diary password or the
  recovery code of when it was made.
- **"Save a copy"** asks: encrypted (the default) or readable.
- **The desktop mini diary**: today's page isn't written to the local storage, only
  its cover. With the diary open, the diary's window passes the page to the desk's in
  memory (`shareToday` in `src/desktop/saved.ts`); locked, it shows the cover, or nothing,
  as the settings say.
- Only private notes encrypted: backups and copies are readable, with the private notes'
  text in their boxes.
- Signing out and **removing the diary from the device** leaves a blank diary without
  encryption.
