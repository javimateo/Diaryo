# Security review — diaryo 1.0.0

A review of the release 1.0.0 (`main` at `e6ee6ff`), made on 2026-10-25: the end-to-end
encryption, the cloud server, the web and desktop apps, the local privacy features, the
websites' headers, the dependencies and the CI. Nothing was tested against the real cloud
server or the real websites: every server test ran against a local PocketBase 0.40.4 (the
version in `deploy/cloud.Dockerfile`) with the repository's migrations and hooks.

**Contents**: [How to read it](#how-to-read-it) · [Summary](#summary) ·
[High](#high) · [Medium](#medium) · [Low](#low) · [What held up](#what-held-up) ·
[Not security](#not-security) · [Proposed fixes](#proposed-fixes) ·
[Reproducing](#reproducing)

## How to read it

Each finding says how sure it is:

| Status           | Meaning                                                                   |
| ---------------- | ------------------------------------------------------------------------- |
| **Verified**     | Reproduced: a test against the code, or a request to the local server     |
| **Code reading** | Follows from reading the code; not run                                    |
| **Config**       | True with the repository's configuration; the production panel may differ |
| **Theoretical**  | A known class of attack that should apply; not reproduced here            |

"Someone with the session" means someone holding a user's PocketBase auth token (or the
account password), but not the diary password nor the recovery code. The docs promise that
such a person, or the server itself, can't read a diary, delete things on the devices or
bring old versions back. Reading holds; destroying doesn't (H1, M1).

## Summary

| #   | Severity | Status       | Finding                                                                        |
| --- | -------- | ------------ | ------------------------------------------------------------------------------ |
| H1  | High     | Verified     | A rewritten vault is adopted by the devices: the diary can no longer be opened |
| H2  | High     | Config       | No rate limits: password guessing, sign-up and email floods                    |
| M1  | Medium   | Verified     | The cloud copy can be overwritten with garbage, and nobody notices             |
| M2  | Medium   | Verified     | Unverified accounts get the full 50 MB                                         |
| M3  | Medium   | Code reading | The updater signing key is exposed to every build dependency                   |
| M4  | Medium   | Theoretical  | Google sign-in can be hijacked with a crafted link (OAuth2 realtime flow)      |
| M5  | Medium   | Verified     | Outdated server images: PocketBase, Alpine, nginx; the server runs as root     |
| L1  | Low      | Verified     | Sign-up tells whether an email has an account                                  |
| L2  | Low      | Code reading | Email links carry their token in the query string (logs, history)              |
| L3  | Low      | Code reading | The website sends no security headers; small gaps in the app's                 |
| L4  | Low      | Verified     | Deleting the account or the vault needs only the token                         |
| L5  | Low      | Config       | The admin dashboard is public and its MFA is off by default                    |
| L6  | Low      | Code reading | On the web, private notes can be read with the devtools while unlocked         |
| L7  | Low      | Code reading | A private note's box isn't bound to its note                                   |
| L8  | Low      | Code reading | What the server learns besides the ciphertext                                  |
| L9  | Low      | Code reading | A crafted backup file can freeze the tab for a while                           |
| L10 | Low      | Theoretical  | AES-GCM doesn't commit to its key (vault partitioning oracle)                  |
| L11 | Low      | Verified     | Dependencies: advisories only in dev tooling and in TLS crates of the updater  |
| L12 | Info     | —            | Limits that come with the design (rollback, web-delivered code)                |

The client-side code is in good shape: no HTML is built from diary content (everything is
drawn on a canvas), the file parsers validate every field, the CSPs are strict and the
Tauri commands check their inputs. The weak spots are the trust the clients place in the
vault and the items the server returns, and the server's configuration, which lives in the
admin panel instead of the repository.

## High

### H1 — A rewritten vault is adopted by the devices: the diary can no longer be opened

**Verified** (a Vitest test over `lock.ts` and `vault.ts`, with the fake server of
`lock.test.ts`; and the server accepting the change, against the local PocketBase).

**Who**: every user with the diary password set on a device (private notes or the whole
diary encrypted) and a cloud account. Cloud-only users are hit too, less (below).

**How**: the server lets the owner change the vault freely: `updateRule` only stops
changing `user`, and the hook only asks for `version = stored + 1`. Someone with the
session sends the vault with `wrappedKey` and `recoveryKey` replaced by random bytes,
`check` untouched and the next `version`. The next time a device is unlocked,
`checkVault` sees that its keys still match `check`, sees a newer `version` and calls
`follow`, which copies that vault into `diaryo:lock`. From then on the device's diary key
is wrapped by a secret that nothing can unwrap: on the next start neither the password nor
the recovery code opens the diary (`unlockDiary` and `recoverDiary` both fail; the cloud's
vault is broken the same way).

The test (to be added to `src/cloud/lock.test.ts` with the fix): create a vault, encrypt
the whole diary, replace `wrappedKey`/`recoveryKey` with junk and bump `version` on the
fake server, start and unlock (works, and the junk is adopted: `readLock().version === 2`),
start again: `unlockDiary(password)` and `recoverDiary(code, …)` reject.

**Impact**: no reading, but the diary is destroyed on every device that follows the
vault, and in the cloud. On the desktop, the daily encrypted backups made before still
open (they carry their own copy of the vault); on the web nothing does. For cloud-only
users (no diary password on the device) the devices keep working with their stored keys,
but no new device can unlock, the password can't be changed (it needs the current one
against the vault), and the recovery code doesn't work: the cloud diary has to be started
again. The same can be done by a compromised server.

Who can get a session: anyone who guesses the account password (H2), a stolen token, the
Google sign-in issue (M4).

**Fix**: authenticate the vault with the diary secret. Add a field, for example
`mac = HMAC(HKDF(secret, "diaryo vault"), kdf ‖ wrappedKey ‖ recoveryKey ‖ version)`,
written by every device that changes the vault (it has the secret then). A device only
adopts a vault (`follow`, `secretFor`) if it holds the secret and the MAC verifies;
otherwise it keeps its own copy and says the cloud's vault was changed outside diaryo.
Vaults without a MAC get one the next time a device with the secret sees them; once a
device has seen one, it requires it. As defence in depth, the server could refuse a vault
change that keeps `check` but changes both wrapped keys (no legitimate change does that),
though the real fix is on the client.

### H2 — No rate limits: password guessing, sign-up and email floods

**Config** (verified with the repository's configuration: PocketBase's rate limits exist
but are off by default, and no migration turns them on; whether they are on in the
production panel can't be checked from here).

Against the local server: 40 wrong passwords in a row, in parallel, all answered `400`,
and the right one still worked; 30 wrong superuser passwords, the same; 5 verification
emails asked for the same address at once, all `204`. `trustedProxy` is empty, so behind
Coolify's proxy every request would look like it comes from the proxy's address: limits
per IP wouldn't work even if turned on, and the request logs keep the proxy's address.

**Impact**: online guessing of account passwords (8 characters at least) gives a session,
which is what H1 and M1 need. Scripted sign-ups (M2) fill the disk. Verification and
reset emails can be sent in a loop to anyone's address: it spends the Resend quota
(3 000 a month) and the sending domain's reputation.

**Fix**: a migration that turns the rate limits on and sets the proxy header Coolify's
Traefik sends (`X-Forwarded-For`, leftmost or rightmost depending on the chain; check it),
with rules such as `*:auth` (a few per minute), `*:create` for `users`,
`*:requestVerification` and `*:requestPasswordReset` (a couple per minute), and a general
one for `/api/`. `check.mjs` gets a case: the n-th wrong password in a row answers `429`.

## Medium

### M1 — The cloud copy can be overwritten with garbage, and nobody notices

**Verified** (a Vitest test over `sync.ts` with the fake server of `sync.test.ts`; the
server accepting it, against the local PocketBase).

**Who**: every cloud user.

**How**: someone with the session updates every item with random `data` and
`modified = now + 59 s` (the server only stamps times more than a minute ahead). The
devices pull them, can't decrypt them, write `console.error` and skip them
(`Sync.open`). A device that changes one of those items within that minute gets `409`,
and `markStale` marks it as not pending: it never goes up again until it changes again.
Nothing in the app says anything.

The test (for `src/cloud/sync.test.ts`): push a text, overwrite the server's items with
junk 59 s ahead, change the text and push: nothing is pending; a new device pulls nothing.

**Impact**: the cloud copy is silently gone. The devices keep their own copy, so it
shows only when a device is added or reinstalled, or the user picks "use the cloud's
diary" (which keeps a file of the local one first, so not a total loss).

**Fix**: an item that doesn't open (decrypt, key or seal check) counts as missing: if
this device has the item, it pushes its version again with a time above the stored one
(`max(stored, local) + 1`, as it is the only valid one); if not, it is counted. The
settings show "N items in the cloud couldn't be opened" instead of only the console. A
`409` is only believed after a pull has seen that newer version open.

### M2 — Unverified accounts get the full 50 MB

**Verified**. A sign-up with any address, never confirmed, creates items up to the quota
(the `items` rules don't look at `verified`). With H2, a script can create accounts in a
loop and fill the VPS's disk, 50 MB at a time.

**Fix**, one of: require `@request.auth.verified = true` in the `items` and `vaults`
create rules (the app then asks to confirm the email before the first sync: a UX change),
or give unverified accounts a small quota (for example 5 MB) that becomes 50 MB once
verified (`onRecordUpdate` on `verified`). Plus H2's limits on sign-ups.

### M3 — The updater signing key is exposed to every build dependency

**Code reading**. In `release.yml`, `TAURI_SIGNING_PRIVATE_KEY` is in the environment of
the `tauri-action` step, which runs `beforeBuildCommand` (`npm run build`: Vite, its
plugins and everything they load) in that same process tree. `npm ci` runs install
scripts. A compromised npm package that runs at build time can read the key and sign a
malicious update that every installed app would accept.

**Fix**: build the page in its own step, without secrets (`npm ci --ignore-scripts`,
`npm run build`), then call `tauri-action` with `beforeBuildCommand` emptied
(`args: --config '{"build":{"beforeBuildCommand":""}}'`), so the key only meets the
Rust build and the bundler. Add Dependabot (npm, cargo, actions, docker) to hear about
advisories. Optionally, protect the release job with a GitHub environment and protect `v*`
tags. Keep the key's password set (`TAURI_SIGNING_PRIVATE_KEY_PASSWORD`).

### M4 — Google sign-in can be hijacked with a crafted link

**Theoretical** (not reproduced: it needs a Google OAuth client; PocketBase's source
wasn't checked for a mitigation).

PocketBase's "all-in-one" OAuth2 flow, the one the app uses on the web and the desktop,
sends Google's code to whichever realtime client the `state` names. An attacker starts a
sign-in on their side, takes the Google URL (with their `state` and their PKCE challenge)
and gets the victim to open it. If the victim is signed in to Google and has used diaryo
with Google before, Google may redirect at once, and the code reaches the attacker's
client, which finishes the sign-in as the victim.

**Impact**: a session (the email, and H1/M1), never the diary's content.

**Fix**: first confirm it with a test Google client against the local server. If it
holds: on the server, `onRecordAuthWithOAuth2Request` can't see the browser, so the
mitigation is on the flow: use the manual code flow with PKCE kept by the app (the web:
a popup to the app's own redirect page; the desktop: a loopback redirect or a deep link),
so the code only reaches whoever started it. At least, make Google always show the
account chooser (`prompt=select_account`), which removes the silent redirect.

### M5 — Outdated server images; the server runs as root

**Verified** (versions read from the files and from the releases).

- PocketBase **0.40.4**; the latest is 0.40.6. 0.40.5 ships Go's `net/http` fixes,
  "one of them a DoS that could affect PocketBase applications" (its notes advise
  updating); 0.40.6 updates `golang.org/x` and Go for the emSign CA distrust. The release
  notes also say future releases will no longer be published on GitHub: the Dockerfile and
  the CI download from there, with a checksum, and will need another source.
- `alpine:3.20` (cloud image) is out of support since April 2026; `nginx:1.27-alpine`
  (app and website) is a branch that no longer gets updates.
- The cloud container runs PocketBase as root.

**Fix**: PocketBase 0.40.6 (Dockerfile and CI, with the new checksum), `alpine:3.22`,
`nginx:1.28-alpine` (stable) or the current mainline, and a non-root user in the cloud
image (the volume's owner changes once). `check.mjs` in CI already covers the rules.

## Low

### L1 — Sign-up tells whether an email has an account

**Verified**: creating an account with a taken email answers
`400 {"email":{"code":"validation_not_unique"}}` (the app shows "email taken"). Password
reset doesn't tell (`204` both ways). Common trade-off; H2's limits make it slow. Accept
and document, or answer sign-ups the same way in both cases (a hook that sends an email
to the existing account instead).

### L2 — Email links carry their token in the query string

**Code reading**. `{APP_URL}/?verify={TOKEN}` and `?reset={TOKEN}` reach nginx, whose
default access log keeps the whole request line (Coolify keeps the container's output),
and the browser's history keeps the visited address even after `replaceState`. A reset
token lasts 30 minutes. Fix: put them after `#` (`/#reset=…`), which never leaves the
browser, and keep reading the old form for emails already sent.

### L3 — The website sends no security headers; small gaps in the app's

**Code reading** (`deploy/*.nginx.conf`). The website (`web.nginx.conf`) sends none: no
CSP, HSTS, `X-Content-Type-Options`, `frame-ancestors` nor `Referrer-Policy` (Coolify's
proxy may add some; not checked). It is static and has no secrets, so the risk is small.
The app's are good; it lacks `form-action 'none'` (not covered by `default-src`),
`Permissions-Policy`, and HSTS has no `includeSubDomains`. PocketBase's API sends no HSTS
either. Fix: headers for the website (its CSP needs the hashes of its two inline scripts
and Umami's origin), and the small additions to the app's.

### L4 — Deleting the account or the vault needs only the token

**Verified**. `DELETE /api/collections/users/records/<id>` and the vault's delete answer
`204` with the token alone; the email typed in the app is only checked by the app. A
stolen session can delete the account and its cloud diary (the devices keep theirs). Fix:
require a recent sign-in for deleting (the app signs in again with the password, or
Google, right before; a hook checks the token's age), and refuse deleting a vault that
has items.

### L5 — The admin dashboard is public and its MFA is off by default

**Config**. `/_/` answers on the public address, and superusers have MFA/OTP off by
default (the panel's setting in production is unknown). With H2, the superuser password
can be guessed online. Fix: turn on MFA (OTP by email) for `_superusers` (a migration
can), and if possible reach `/_/` only through Coolify's terminal or an IP allowlist in
Traefik.

### L6 — On the web, private notes can be read with the devtools while unlocked

**Code reading**. With the whole diary encrypted and unlocked, the diary secret is in
memory (`lockState.ts`), and the private key comes from it (`privateKeyOf`). Someone at
the open web app can open the devtools and read any private note without the password.
The desktop release has no devtools. It contradicts privacy.md's "private notes protect
their text from whoever uses the app while it is open too". Fix: say it in privacy.md
(the web is the weaker place for private notes), or keep only the device key and the
cloud keys in memory, and derive the private key from the password each time (the
password is already asked for).

### L7 — A private note's box isn't bound to its note

**Code reading**. `boxNote` seals with the constant context `PRIVATE`, not with the note's
id: someone who can write the device's database could move one note's box into another.
Only integrity, only with the disk. Fix: bind it to the note's id (with old boxes still
read, and rewritten when shown).

### L8 — What the server learns besides the ciphertext

**Code reading**. For each item: its kind, its time to the millisecond, whether it is a
tombstone and its size; the number of items; when each device pushes (so the elements
pushed together with a page say they belong to it, despite the opaque keys); the account's
writing times. cloud.md says the server "can't tell which page anything belongs to, nor
how pages relate", which timing partly undoes. Fix: say it in cloud.md and the privacy
policy; optionally round `modified` to the second and pad small items to a few sizes.

### L9 — A crafted backup file can freeze the tab for a while

**Code reading**. A `.diaryo` file's vault may ask for up to 10 000 000 PBKDF2 iterations
(`MAX_ITERATIONS`, about 10–20 s of a frozen tab), and elements have no size limits (a
stroke with millions of points). Only the person who opens the file is affected. Fix: a
lower cap (for example 5 000 000) and limits in `parseElement`.

### L10 — AES-GCM doesn't commit to its key

**Theoretical**. A malicious server can craft a vault whose `wrappedKey` and `check`
decrypt under many password keys at once ("partitioning oracle", Len et al., 2021), and
learn from whether the app accepts it whether the password is among those candidates. It
needs the user to type the password into that vault, and works only with guessable
passwords. Fix: add a key commitment (for example the MAC of H1 also binds the password
key: unlock only if `HMAC(passwordKey, …)` verifies before decrypting).

### L11 — Dependencies

**Verified** (`npm audit`, `cargo audit` on 2026-10-25).

- App: 5 advisories (3 high, 2 moderate), all in development tools: Vite's dev server
  and `launch-editor`, Vitest, `source-map-js`, `zod`. None ships in the app. Website:
  7 (6 high), all at build time (`sharp`/librsvg, `undici`, `http-cache-semantics`,
  `fast-uri`, Vite). Update when convenient (`npm audit fix`, then the tests).
- Desktop: `rustls` 0.23.45, `rustls-webpki` 0.103.15 and `webpki-root-certs` 1.0.9
  (fixed in 0.23.46, 0.103.16, 1.0.10), used by the updater's HTTP client; the update's
  signature still protects what is installed. `zip` 4.6.1 (in the updater) has
  extraction advisories that apply to Unix permissions and symlinks, not to the Windows
  NSIS update. `cargo update -p rustls -p rustls-webpki -p webpki-root-certs` fixes the
  first three. The rest are "unmaintained" notices of transitive crates.

### L12 — Limits that come with the design (info)

- **Withholding and rollback by the server**: a server can hand a new device an older
  copy of an item it kept, or nothing; devices that already have a newer one ignore it.
  cloud.md says part of this; say it plainly.
- **The web app is code from the same operator**: a compromised web server, or its
  operator, could serve a page that reads the diary password. End-to-end encryption on
  the web protects against the cloud server, not against whoever serves the app. The
  desktop app (signed updates) is the stronger option; worth a line in cloud.md.
- PocketBase answers CORS for any origin. With tokens in a header (not cookies) that is
  harmless, but it could be limited to the app's origins.

## What held up

Checked, and fine:

- **Rules**: `check.mjs` passes entirely on 0.40.4. Nobody reads, lists, changes or
  deletes another user's records; anonymous requests see nothing; a user can't raise
  their quota, set `verified`, change their email directly, nor change their password
  without the old one; items can't be hard-deleted.
- **Quota and parallel writes**: each write is checked inside a transaction on
  PocketBase's single writing connection; ten writes at once stay within the quota.
- **Encryption**: AES-256-GCM with a fresh random 96-bit IV per item; PBKDF2-SHA-256 with
  600 000 iterations and random salts (a vault's iterations are capped); HKDF for the
  recovery code (240 random bits) and the derived keys, with distinct labels; keys kept
  as non-extractable `CryptoKey`s. An item's path is sealed inside and checked against its
  HMAC key, so items can't be swapped between keys; times and tombstones are sealed, so
  the server can't delete things on the devices or pass old versions as new (beyond L12).
- **On the device**: XChaCha20-Poly1305 with a random 192-bit nonce per row, bound to
  the table and the row's key.
- **No HTML from content**: texts, notes, links and dates are drawn on the canvas; the
  only `innerHTML` writes a constant. Links between pages are page ids, never URLs.
- **Files**: `.diaryo` files and pasted elements go through `parseElement`, which checks
  every field; images must be `data:image/…` (an SVG drawn as an image runs no script);
  fonts must be `data:`. The `.ics` export escapes its text.
- **CSP**: strict in the web app (nginx) and in the desktop app (`tauri.conf.json` sets
  one; only the development build, `devCsp`, has none). A script slipped into a diary
  couldn't run nor send anything out.
- **Tauri**: few capabilities (no file system, shell or opener permissions for the
  page); `open_sign_in` and `open_website` only open their own sites; backup names are
  validated (no `../`); files are saved through the system dialog; no remote page gets
  IPC; updates are signed (minisign) and only newer ones install.
- **CI**: actions pinned to commits, `contents: read` for the checks, `pull_request`
  (not `pull_request_target`); PocketBase's download is checked against its checksum.

## Not security

Found on the way:

- **N1 — Undecryptable items are only logged** (`Sync.open`): a broken item, for any
  reason, disappears from the user's view without a word. Part of M1's fix.
- **N2 — The quota check sums all the user's items on every write**
  (`SELECT SUM(size) … WHERE user = …`), inside the single writing connection: the bigger
  an account, the slower its writes, and the writes of everyone behind it. Code reading,
  not measured (`cloud/stress.k6.js` with a big account would show it). Fix: a `used`
  counter on the user, changed in the same transaction.
- **N3 — The desktop's "source code" link does nothing**: `sourceUrl` is GitHub's, and
  `open_website` only allows diaryo's website; the rejected promise is ignored. Code
  reading.
- **N4 — Pasted image ids are checked with `in`** (`parseElements` in
  `engine/clipboard.ts`): an id like `toString` passes, and the element points to an image
  that doesn't exist. Harmless, but `Object.hasOwn` is the right check.
- **N5 — PocketBase leaves GitHub after 0.40.6** (see M5): updating it will need a new
  download source and checksum process.
- **N6 — Default English emails**: PocketBase's "login from a new location" alert is on
  with its default English template, and the email change and OTP templates are the
  defaults (the app doesn't use them yet). Verified in the local configuration.
- **N7 — An item's `kind` can be changed on update, and `modified` may be negative.**
  Harmless today (the app reads the sealed path), but the rules could forbid both.

## Proposed fixes

Each one in its own branch from `develop`, with a test that fails before and passes after.

| Fix | For        | What                                                                        | Test                                 |
| --- | ---------- | --------------------------------------------------------------------------- | ------------------------------------ |
| 1   | H1         | Vault MAC with the diary secret; devices only adopt a vault that verifies   | `lock.test.ts`: the PoC above        |
| 2   | M1, N1     | An item that doesn't open counts as missing: pushed again, and shown        | `sync.test.ts`: the PoC above        |
| 3   | H2, L5     | Migration: rate limits, trusted proxy header, superuser OTP                 | `check.mjs`: `429` after n tries     |
| 4   | M2         | Verified accounts only (or a small quota until verified)                    | `check.mjs`                          |
| 5   | M5, L11    | PocketBase 0.40.6, Alpine 3.22, nginx 1.28, non-root; `cargo update` rustls | CI, `check.mjs`, `cargo audit`       |
| 6   | M3         | Release: page built without the key; Dependabot                             | A release from a test tag (draft)    |
| 7   | M4         | Confirm with a test Google client; then PKCE flow kept by the app           | Manual, local server                 |
| 8   | L2         | Email links with `#` instead of `?` (old ones still read)                   | `links.test.ts`                      |
| 9   | L3         | Website headers; `form-action`, `Permissions-Policy` in the app             | `curl -I` on the built images        |
| 10  | L4         | Recent sign-in to delete the account; vault with items can't be deleted     | `check.mjs`                          |
| 11  | N2         | Running `used` counter instead of the sum                                   | `check.mjs` (quota cases)            |
| 12  | L6–L9, L12 | Docs: private notes on the web, metadata, rollback, web trust; lower caps   | `files` / `clipboard` tests for caps |
| 13  | L7, N3, N4 | Small ones: box bound to the note, the source link, `Object.hasOwn`         | Unit tests                           |

Recommended order: 1 and 2 (they close the "destroy without the keys" gap), 3 and 4
(they take away the cheap ways to get a session), 5, 6, then the rest.

## Reproducing

- **Server**: PocketBase 0.40.4 (checksum checked) started as in CLAUDE.md on
  `127.0.0.1:8091`, a throwaway superuser, `node cloud/check.mjs` (all OK), then a probe
  script that reads the settings and tries each request in H2, M1, M2, L1, L4 and L5. It
  belongs in `cloud/check.mjs` as each fix lands (the checks that must hold afterwards).
- **Client**: the two PoCs are Vitest tests written over the fake servers of
  `lock.test.ts` and `sync.test.ts`, as described in H1 and M1; both passed (that is, the
  weakness is there). They become the failing tests of fixes 1 and 2.
- **Dependencies**: `npm audit` in the root and in `web/`, `cargo audit` in `src-tauri`.
