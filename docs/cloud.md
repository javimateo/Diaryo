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

- **Diary key**: a random 256-bit AES-GCM key, created on the first device. It encrypts
  every record.
- **Diary password**: chosen by the user, separate from the account's (a Google account
  has no password). PBKDF2-SHA-256 (600 000 iterations, random salt) turns it into a
  key that **wraps** the diary key.
- **Recovery key**: 24 random words (or an equivalent code) shown once, to print or save.
  It wraps the diary key too, so a forgotten password can be replaced.
- The `vaults` record keeps the salt, the wrapped keys and an encrypted check value (to
  tell a wrong password at once). Never the password or the diary key.
- Each device unlocks once and keeps the diary key in the system's secure storage
  (desktop) or, on the web, in IndexedDB as a non-extractable `CryptoKey`.

Losing both the password and the recovery key means losing the cloud copy: the local
diaries and `.diaryo` files stay readable on the devices that have them.

## What is synced

One **item** per thing that can change on its own:

| Kind      | Content (encrypted)                     | Item key                          |
| --------- | --------------------------------------- | --------------------------------- |
| `page`    | The page row (date, title, tab, paper…) | HMAC(diary key, `page/<id>`)      |
| `element` | One element of a page or of the desk    | HMAC(diary key, `el/<page>/<id>`) |
| `asset`   | An image                                | HMAC(diary key, `asset/<id>`)     |

The HMAC keys are deterministic (every device computes the same one) and opaque (the
server can't tell which page anything belongs to, nor how pages relate).

Each item carries `modified` (the device's time of the change, in ms) and `deleted`
(a tombstone, with its content emptied, so a deletion reaches the other devices
instead of the item coming back from them).

## Protocol

- **Push**: what changed locally since the last push (the local database records it) is
  sent as item upserts. The server rejects an update whose `modified` is older than
  the stored one (`409`): that device then pulls first.
- **Pull**: items whose server `updated` is at or after the last pull, oldest first.
  Applying one is idempotent: an item older than the local copy is ignored.
- **Conflicts**: last write wins, per item. Different elements edited on two devices
  never conflict; the same element edited on both keeps the most recent change.
- **When**: on start, every few seconds after local changes, when the connection comes
  back, and on a realtime notice from the server (another device pushed).
- **First sign-in** with a local diary and a cloud diary: replace one with the other, or
  merge them (the dialog used for opening backups).

## Quota

The server computes each item's size (`size`) and, before saving, checks that the
user's total stays within `quotaBytes`; otherwise it answers `403 quota_exceeded`. The
app shows the usage and warns before the limit. Text and strokes are tiny; images are
what fill it.

## Privacy

- Deleting the account deletes all its items and its vault (cascade).
- The user can export the diary at any time (the usual `.diaryo` backup).
- The server keeps the account's email and the encrypted items; the website's privacy
  policy says so.
