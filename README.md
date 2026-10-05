# diaryo

**English** · [Español](README.es.md)

An infinite diary for your PC: every day is a double page with no edges, to write, draw,
stick notes, circle things and connect ideas with arrows. It lives on your computer, pops
up over the desktop with a shortcut and keeps your notes to yourself.

**Website and download:** <https://diaryo.javiermateo.dev> · **Web app:**
<https://app.diaryo.javiermateo.dev> · **Releases:**
[GitHub](https://github.com/javimateo/Diaryo/releases/latest)

## Features

- **A real diary**: one double page per day, turned by pulling the corner, with an index,
  a calendar, tabs for important pages and a map of the whole diary.
- **Infinite canvas**: pencil, highlighter, eraser, text, sticky notes, rectangles,
  ellipses and arrows that stay attached to what they connect. Tasks with checkboxes
  (type `[]` and a space), links between pages, images, groups and layers.
- **The desk**: whatever lies outside the book is shared by every page.
- **Desktop app (Windows)**:
  - a floating diary over the desktop (`Ctrl+Alt+D`, the same shortcut hides it);
  - the desk and a mini diary of today on the Windows desktop itself (`Ctrl+Alt+N`);
  - tray icon, starts with Windows, automatic daily backups to a folder;
  - updates itself (it can be turned off in Settings).
- **Your way**: leather, cloth or cardboard covers, lined, grid, dotted, Cornell or
  planner paper, and a wood, cork or linen desk. Light and dark theme.
- **Search** (`Ctrl+K`): any word, day, task or command.
- **English or Spanish** (Settings → Appearance).
- **Phones too**: the web app works with a finger (two fingers to zoom and move, hold to
  open the menu).
- **Private**: everything is saved on your computer (or in the browser, for the web app),
  with no account needed. Copies can be saved to a file and opened elsewhere.
- **Optional cloud**: with an account, the diary syncs between devices, end-to-end
  encrypted: the server can't read it.

Press `?` inside the app to see every shortcut.

## Getting started

Requirements: [Node.js](https://nodejs.org) 22 or later.

```bash
npm install
npm run dev
```

Open <http://localhost:5173>: that is the web version of the app.

### Desktop app (Windows)

Also requires [Rust](https://rustup.rs) and the Visual Studio C++ build tools (the
"Desktop development with C++" workload).

```bash
npm run desktop
```

To build the installer (it ends up in `src-tauri/target/release/bundle/nsis`):

```bash
npm run desktop:build
```

### Website

The website (presentation, live demo and downloads) lives in `web/` and reuses the app's
code, so both sets of dependencies are needed:

```bash
npm install
npm --prefix web install
npm --prefix web run dev
```

Open <http://localhost:4321>.

## Scripts

| Command                    | What it does                                  |
| -------------------------- | --------------------------------------------- |
| `npm run dev`              | App development server                        |
| `npm run build`            | Type-checks and builds the web app in `dist/` |
| `npm run desktop`          | Opens the desktop app (development)           |
| `npm run desktop:build`    | Builds the desktop installer                  |
| `npm test`                 | Runs the tests (Vitest)                       |
| `npm run lint`             | Lints the code (ESLint)                       |
| `npm run format`           | Formats everything (Prettier)                 |
| `npm --prefix web run dev` | Website development server                    |

## Documentation

- [Architecture](docs/architecture.md): how the code is organised (layers, the canvas
  engine, the diary, the desktop app and the website).
- [Tech stack](docs/tech-stack.md): technologies, libraries and fonts, with their licenses.
- [Releasing](docs/releasing.md): versions, the release workflow and automatic updates.
- [Deployment](docs/deployment.md): the website and the web app on Coolify.
- [Contributing](CONTRIBUTING.md): setting up, checks and conventions.
- [PLAN.md](PLAN.md) (in Spanish): the project's phases and decisions.

Code and comments are in English; the app's texts live in `src/i18n`.

## License

diaryo is **source-available** under the
[PolyForm Noncommercial License 1.0.0](LICENSE): you may read, use, change and share the
code for any **non-commercial** purpose (personal use, study, research, hobby projects,
charities, education…). Commercial use — selling it, including it in a paid product or
service, or using it to make money — is not allowed. For anything else, get in touch.

The libraries and fonts it uses keep their own licenses (see
[docs/tech-stack.md](docs/tech-stack.md)).

Copyright © 2026 Javier Mateo.
