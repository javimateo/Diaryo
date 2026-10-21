# Contributing

Thanks for wanting to help! Bug reports, ideas and pull requests are welcome.

## Before you start

- diaryo is under the [PolyForm Noncommercial License 1.0.0](LICENSE). By contributing
  you agree that your contribution is licensed under the same terms, and that the
  maintainer may also license it under other terms (for example, to allow a specific
  commercial use of the whole project).
- For anything bigger than a small fix, open an issue first to talk about it: the
  project follows a plan ([PLAN.md](PLAN.md), in Spanish) and a consistent design.

## Setting up

See [Running it locally](README.md#running-it-locally): Node.js 22+, and Rust with the Visual
Studio C++ tools for the desktop app. [docs/architecture.md](docs/architecture.md)
explains how the code is organised.

### The cloud locally

To work on the sync, run a local [PocketBase](https://pocketbase.io) with the
repository's schema and rules (`<a scratch folder>` keeps its data):

```bash
pocketbase serve --http=127.0.0.1:8091 --dir=<a scratch folder> --automigrate=false --migrationsDir=cloud/pb_migrations --hooksDir=cloud/pb_hooks
```

and point the app to it with `VITE_CLOUD_URL=http://127.0.0.1:8091` in `.env.local`
(git-ignored). Without `--automigrate=false`, changes made in its admin panel write new
migration files into the repository. See [docs/cloud.md](docs/cloud.md).

### The README's animations

They are recorded from the engine's scenes: after changing a scene, the book's look or
its texts, run `npm run media` (about ten minutes) and check the new
`docs/media/*.webp` before committing ([how it works](docs/architecture.md#the-readmes-animations)).

## Checks

Everything must pass before a pull request:

```bash
npx tsc --noEmit
npm run lint
npm test
npx prettier --check .
```

If you touched the desktop side:

```bash
cd src-tauri
cargo fmt --check
cargo clippy
cargo test
```

If you touched the website:

```bash
npm --prefix web run check
npm --prefix web run build
```

## Branches

A simple Git Flow:

| Branch           | What for                                                                                                                                                 |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `main`           | Released versions only; each one tagged `vX.Y.Z`. Deploys the website and the web app.                                                                   |
| `develop`        | Finished work waiting for the next version.                                                                                                              |
| `feature/<name>` | One piece of work, from `develop` and back into it.                                                                                                      |
| `release/X.Y.Z`  | Preparing a version (bump the number, last touches), from `develop`; merged into `main` and `develop`, then tagged (see [releasing](docs/releasing.md)). |
| `hotfix/<name>`  | An urgent fix to what is released, from `main`; merged into `main` and `develop`.                                                                        |

Pull requests go to `develop` (hotfixes, to `main`).

## Conventions

- **Code and comments in English**, written as plain sentences that explain the why.
  Every text the user sees goes in `src/i18n` (`es.ts` is the reference, `en.ts` follows
  its shape; the website's in `web/src/i18n`).
- **Layers**: each layer only imports from the ones above it (see the architecture). The
  engine must stay free of React, storage and the diary.
- TypeScript strict, no `any`. Prettier decides the format.
- Tests next to the code (`*.test.ts`) for anything with logic.
- The interface must work in light and dark themes, in both languages and, for the web
  app, on a phone.
- Commit messages: a short sentence in English saying what changes.
- Something users will notice goes in the `Unreleased` part of the
  [CHANGELOG](CHANGELOG.md).

## Security

Never report a vulnerability in a public issue: see [SECURITY.md](SECURITY.md).

## Behaviour

Be kind and patient, assume good intent and keep discussions about the work. The
maintainer may remove comments, or block people, that don't.
