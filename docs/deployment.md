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

The website's image takes two build arguments, with these defaults:

| Argument   | Default                              | What for                                                              |
| ---------- | ------------------------------------ | --------------------------------------------------------------------- |
| `SITE_URL` | `https://diaryo.javiermateo.dev`     | Canonical and alternate-language links                                |
| `APP_URL`  | `https://app.diaryo.javiermateo.dev` | Links to the web app (without it, the site doesn't offer the web app) |

When built, the website asks the GitHub API for the latest release (version, installer
size and link), so it has to be **redeployed after publishing a version**. Without an
answer it falls back to the values in `web/src/site.ts`.

GitHub allows 60 unauthenticated API requests per hour; Coolify shows how many are left
when using a public repository. If that ever falls short, connect a GitHub App in
Coolify (Sources) and use it for both resources.

## Caching

- Website: the hashed files in `/_astro/` are cached for a year; pages are served as is.
- Web app: `/assets/` is cached for a year and `index.html` never, so a new version
  arrives on the next load. Every path falls back to `index.html`.

## Where the data lives

The web app has no server side: each browser keeps its own diary in IndexedDB, on the
app's origin (`app.diaryo.javiermateo.dev`). The website's demo uses a separate database
on the website's origin and empties it on every visit.
