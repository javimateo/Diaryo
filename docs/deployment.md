# Deployment

The website and the web app run on a VPS with [Coolify](https://coolify.io), each as a
Docker image built from this repository and served by nginx.

| Resource | Address                              | Dockerfile              | nginx config            |
| -------- | ------------------------------------ | ----------------------- | ----------------------- |
| Website  | <https://diaryo.javiermateo.dev>     | `deploy/web.Dockerfile` | `deploy/web.nginx.conf` |
| Web app  | <https://app.diaryo.javiermateo.dev> | `deploy/app.Dockerfile` | `deploy/app.nginx.conf` |

Both images are built from the repository root: the website's demo uses the app's code,
so its image installs both sets of dependencies. `.dockerignore` keeps local builds and
`node_modules` out.

## DNS

Two `A` records on `javiermateo.dev`, pointing to the VPS: `diaryo` and `app.diaryo`.
Coolify gets the HTTPS certificates.

## Coolify

For each resource: **New resource → Public repository** →
`https://github.com/javimateo/Diaryo`, branch `main`, then:

- **Build pack**: Dockerfile
- **Base directory**: `/`
- **Dockerfile location**: `/deploy/web.Dockerfile` or `/deploy/app.Dockerfile`
- **Domain**: the address above, with **port 80** (also in _Ports Exposes_)
- Automatic deployment on push

The website's image takes these build arguments, with these defaults:

| Argument    | Default                              | What for                                                              |
| ----------- | ------------------------------------ | --------------------------------------------------------------------- |
| `SITE_URL`  | `https://diaryo.javiermateo.dev`     | Canonical and alternate-language links                                |
| `APP_URL`   | `https://app.diaryo.javiermateo.dev` | Links to the web app (without it, the site doesn't offer the web app) |
| `UMAMI_SRC` | (empty)                              | Umami's script, e.g. `https://stats.javiermateo.dev/script.js`        |
| `UMAMI_ID`  | (empty)                              | The website's id in Umami (without both, nothing is counted)          |

When built, the website asks the GitHub API for the latest release (version, installer
size and link), so it has to be **redeployed after publishing a version**. Without an
answer it falls back to the values in `web/src/site.ts`.

GitHub allows 60 unauthenticated API requests per hour; Coolify shows how many are left
when using a public repository. If that ever falls short, connect a GitHub App in
Coolify (Sources) and use it for both resources.

## Visits (Umami)

The website counts visits and a few events with [Umami](https://umami.is), self-hosted
on the same Coolify: no cookies, no personal data, and it only counts on the real domain.
The events are `download` (with `place`: `hero`, `header` or `download`),
`open-web-app` and `copy-download-link`. The apps send nothing.

1. In Coolify: **New resource → Service → Umami**, with a domain such as
   `https://stats.javiermateo.dev` (plus its `A` record).
2. In Umami: log in, change the default password, **Settings → Websites → Add website**
   with the domain `diaryo.javiermateo.dev`, and copy its **Website ID**.
3. In the website's resource in Coolify, add the environment variables `UMAMI_SRC`
   (`https://stats.javiermateo.dev/script.js`) and `UMAMI_ID`, marked as available at
   build time, and redeploy.

## Cloud server (PocketBase)

The cloud sync server ([cloud](cloud.md)): PocketBase with the schema and rules in
`cloud/`, at <https://cloud.diaryo.javiermateo.dev>.

1. DNS: an `A` record `cloud.diaryo` pointing to the VPS.
2. Coolify: a third resource from the same repository (branch `develop` while the cloud
   is being built; **`main` from the first release that uses it**, so only released
   schema changes reach real users' data), **Dockerfile**
   `/deploy/cloud.Dockerfile`, domain `https://cloud.diaryo.javiermateo.dev` with
   **port 8090**, and a **persistent storage** mounted at `/pb/pb_data` (without it,
   every deployment would start with an empty database).
3. First start: create the administrator from the resource's terminal in Coolify:

   ```bash
   /pb/pocketbase superuser upsert you@example.com 'a-long-password' --dir=/pb/pb_data
   ```

   The dashboard is at `https://cloud.diaryo.javiermateo.dev/_/`.

4. **Mail** (Settings → Mail settings), so the accounts can be verified and passwords
   reset. It goes through [Resend](https://resend.com) (free up to 3 000 emails a month),
   with the domain `javiermateo.dev` verified there (its DKIM, SPF and DMARC records are
   in Cloudflare). Sender `diaryo <no-reply@javiermateo.dev>`; SMTP host
   `smtp.resend.com`, **port 587** with TLS "Auto (StartTLS)", user `resend`, password
   an API key. The VPS blocks outgoing port 465, so not that one.
5. **Application URL** (Settings → Application): `https://app.diaryo.javiermateo.dev`,
   used in the links of those emails. Their texts (Spanish and English) come from the
   migration `1790900001_account.js`: the links open the web app (`?verify=…`,
   `?reset=…`), which confirms the email or asks for the new password.
6. **Google sign-in** (Collections → users → Options → OAuth2): enable it and add Google
   with a client id and secret from the Google Cloud console (APIs & Services →
   Credentials → OAuth client ID, type "Web application"), with the authorized redirect
   URI `https://cloud.diaryo.javiermateo.dev/api/oauth2-redirect`. On the consent screen
   (Google Auth Platform → Branding): app name `diaryo`, authorized domain
   `javiermateo.dev`, scopes `openid`, `userinfo.email` and `userinfo.profile`, home page
   `https://diaryo.javiermateo.dev`, privacy policy
   `https://diaryo.javiermateo.dev/privacidad/` and terms
   `https://diaryo.javiermateo.dev/condiciones/`. While it is in **Testing**, only the
   test users added there can sign in: **Publish app** (Audience) opens it to everyone.
   With these basic scopes Google usually doesn't ask for a review, only to verify the
   domain in Google Search Console.
7. Check the rules against it (it creates two throwaway users and deletes them):

   ```bash
   PB_URL=https://cloud.diaryo.javiermateo.dev PB_ADMIN_EMAIL=… PB_ADMIN_PASSWORD=… node cloud/check.mjs
   ```

Privacy: the privacy policy promises no server backups and request logs kept 5 days
(Settings → Logs, PocketBase's default). Changing either means updating the policy. Its
contact address, `privacidad@javiermateo.dev` (`web/src/site.ts`), forwards to a real
inbox with Cloudflare Email Routing (Email → Email Routing → Routing rules). Receiving
and sending don't clash: Email Routing's MX and SPF records are on the root of
`javiermateo.dev`, and Resend's (the server's emails) on `send.javiermateo.dev`.

Backups: the whole server state is `/pb/pb_data` (PocketBase can also make scheduled
backups in Settings → Backups). The diaries in it are encrypted on the devices: a backup
can't be read without the users' keys. A deleted account stays in a backup until the
backup is deleted, so turning them on means saying for how long in the privacy policy.

## Caching

- Website: the hashed files in `/_astro/` are cached for a year; pages are served as is.
- Web app: `/assets/` is cached for a year and `index.html` never, so a new version
  arrives on the next load. Every path falls back to `index.html`.

## Where the data lives

The web app has no server side: each browser keeps its own diary in IndexedDB, on the
app's origin (`app.diaryo.javiermateo.dev`). The website's demo uses a separate database
on the website's origin and empties it on every visit.
