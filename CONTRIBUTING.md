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

See [Getting started](README.md#getting-started): Node.js 22+, and Rust with the Visual
Studio C++ tools for the desktop app. [docs/architecture.md](docs/architecture.md)
explains how the code is organised.

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
