# Cloud sync

The cloud is optional: without an account, and offline, diaryo works as always. With an
account, the diary is synced between devices (desktop app, web app, phone through the
web). The local database stays the one the app uses; the cloud holds an **end-to-end
encrypted** copy that every device keeps up to date.

## Pieces

| Piece  | What it is                                                                                |
| ------ | ----------------------------------------------------------------------------------------- |
| Server | [PocketBase](https://pocketbase.io) on the VPS (Coolify), image `deploy/cloud.Dockerfile` |
| Schema | `cloud/pb_migrations` (collections, fields, rules), applied when it starts                |
| Rules  | `cloud/pb_hooks` (quota, last write wins, server-computed sizes)                          |
| Client | `src/cloud` (account, encryption, sync), on top of `src/storage`                          |

## Accounts

PocketBase's `users` collection: email and password (with email verification and password
reset) and Google (OAuth2). Each user has a storage quota (`quotaBytes`, 100 MB on the
free plan) that only the server can change.

In the app (`src/cloud/account.ts`, Settings → Account and cloud):

- The session is kept in the device's local storage (`diaryo:cloud-session`). A token
  lasts 30 days; the app renews it when it starts and every 12 hours, so it only expires
  after a month without opening the app.
- **Google** on the web opens a popup; on the desktop, the system browser (the
  `open_sign_in` command, which only opens `accounts.google.com`). Either way the server
  tells the app through its realtime connection when Google is done.
- The **emails' links** open the web app: `?verify=<token>` confirms the email and
  `?reset=<token>` asks for the new password. The token leaves the address at once.
- `VITE_CLOUD_URL` points the app to another server (a local PocketBase while
  developing, in `.env.local`).

## Encryption

Everything leaves the device encrypted; the server only stores ciphertext and opaque
ids. Nobody without the keys, the server's administrator included, can read a diary.

All of it is in `src/cloud/crypto.ts` (Web Crypto, with tests); `src/cloud/vault.ts`
keeps the vault and the device's keys.

- **Diary secret**: 32 random bytes, created on the first device. Two keys come from
  it with HKDF-SHA-256: the **diary key** (AES-GCM 256), which encrypts every item, and
  the **naming key** (HMAC-SHA-256), which makes the items' opaque keys.
- **Diary password**: chosen by the user, separate from the account's (a Google account
  has no password). PBKDF2-SHA-256 (600 000 iterations, random salt) turns it into a
  key that **wraps** the secret.
- **Recovery code**: 240 random bits written as 12 groups of 4 characters (Crockford's
  base 32: no I, L, O or U; typing is forgiving about case, spaces and look-alikes).
  Shown once, to download, print or copy; the dialog doesn't close until the user says
  it is saved. It wraps the secret too (HKDF, as it is random already), so a forgotten
  password can be replaced.
- The `vaults` record keeps `kdf` (algorithm, iterations and both salts), the two
  wrapped copies of the secret and `check` (a known text encrypted with the diary key,
  to tell a wrong secret at once). Never the password, the code or the secret.
- **Changing the password** or **making a new recovery code** only wraps the secret
  again (it asks for the current password); the items aren't encrypted again. A new
  code makes the old one useless.
- Each device unlocks once and keeps the two derived keys in IndexedDB
  (`diaryo-keys`), as non-extractable `CryptoKey`s: the app can use them, not read
  them. The desktop app does the same in its webview (the local diary on that computer
  isn't encrypted either, so the system's keychain would add little). Signing out
  forgets them. When the app starts, the kept keys are checked against the vault.

Losing both the password and the recovery code means losing the cloud copy: the local
diaries and `.diaryo` files stay readable on the devices that have them.

**Later**: unlocking with the device's biometrics (Windows Hello, Touch ID, the phone's
fingerprint) instead of typing the password on each new device, through WebAuthn's PRF
extension (a passkey that also gives a key to wrap the secret with).

## What is synced

One **item** per thing that can change on its own:

| Kind      | Content (encrypted)                             | Item key                           |
| --------- | ----------------------------------------------- | ---------------------------------- |
| `page`    | The page (date, order, title, tab, paper)       | HMAC(naming key, `page/<id>`)      |
| `element` | One element of a page or of the desk            | HMAC(naming key, `el/<page>/<id>`) |
| `asset`   | An image (`asset/<id>`) or a font (`font/<id>`) | HMAC(naming key, the path)         |

The keys are deterministic (every device computes the same one) and opaque (the server
can't tell which page anything belongs to, nor how pages relate). The encrypted content
carries its path, so a device knows what an item is.

**Not synced**: each page's view (zoom and position) and its thumbnail. The view is each
device's own; thumbnails are drawn again on each device (a page that changed there gets
a new one in the background).

Each item carries `modified` (the device's time of the change, in ms) and `deleted`
(a tombstone, with its content emptied, so a deletion reaches the other devices
instead of the item coming back from them).

## Protocol

The pieces: `src/storage/tracking.ts` (what changed), `src/cloud/sync.ts` (pushing and
pulling, with tests against a fake server and two devices), `src/cloud/pbRemote.ts`
(PocketBase) and `src/ui/cloudSync.ts` (when, and the state the app shows).

- **Tracking**: every write to the local database notes, in the same transaction, the
  paths it touched in the `tracked` table: the time of the change and whether it is
  still to push. Nothing is lost if the app is closed at once. A change is always later
  than the one it replaces, even with a clock behind. Only moving the view isn't a change.
- **Push**: the pending paths, pages first, then images and fonts, then elements (four
  at a time). Each one is read, encrypted and written (created, or updated if its
  record is known). The server refuses an older change (`409`): the newer one there
  wins and comes with the next pull. Another device created the same key first: it is
  found and updated.
- **Pull**: items written after the last one seen (by the server's `updated`, then id),
  200 at a time. Applying is idempotent: an item older than (or as old as) the local
  copy is skipped, so this device's own changes coming back change nothing. Before
  applying, whatever is pending in the open page is saved, so a newer change here wins;
  if the open page or the desk changed, they are loaded again — after the user finishes
  the stroke or text in progress.
- **Conflicts**: last write wins, per item. Different elements edited on two devices
  never conflict; the same element edited on both keeps the most recent change.
- **When** (mode **Automatic**, the default): on start, a few seconds after each change,
  when the connection comes back, when the app is shown again, on a realtime notice from
  the server (another device pushed) and every five minutes. **Manual**: only with "Sync
  now". **With password**: only with "Sync now", which asks for the diary password each
  time; this device doesn't keep the keys (switching to this mode forgets them).
- **First sync** of a device with the account: with nothing here, the cloud's diary
  comes; with nothing there, all of this one goes up; with a diary on both sides, the
  user chooses: **merge** them (everything is pushed and pulled; the most recent wins) or
  **use the cloud's one**, keeping this device's diary in a `.diaryo` file first (the
  backups folder, or a download on the web), to open it whenever they like. Replacing
  the diary this way deletes nothing in the cloud; replacing it with a backup ("Open a
  copy") does: the other devices follow.
- Signing in with another account forgets the records of the previous one: the first
  sync runs again.

## Quota

The server computes each item's size (`size`) and, before saving, checks that the
user's total stays within `quotaBytes`; otherwise it answers `403 quota_exceeded`.
`GET /api/diaryo/usage` (pb_hooks/main.pb.js) gives the signed-in user their usage.

When the space is full, pushing stops: the diary keeps working and saving on the device,
and the changes stay pending. The cloud next to "Saved" turns orange and the settings
say so, with the usage and how many changes wait. Deleting always goes through (it frees
space), and pulling too. With room again (deleting things, or a bigger plan), the
pending changes go up by themselves. Text and strokes are tiny; images are what fill it.

## Privacy

- Deleting the account deletes all its items and its vault (cascade).
- The user can export the diary at any time (the usual `.diaryo` backup).
- The server keeps the account's email and the encrypted items; the website's privacy
  policy says so.
