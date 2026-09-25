# diaryo

**English** · [Español](README.es.md)

An infinite diary: every page is a boundless canvas to draw, write, circle and connect
ideas. Free, open source and made for quick note-taking on the PC.

> In development. See [PLAN.md](PLAN.md) (in Spanish) for the phases and decisions.

## What it does

- **A real diary**: one double page per day, turned by dragging the corner, with an
  index, a calendar, tabs for important pages and a map of the whole diary.
- **Infinite canvas**: pen, highlighter, text, sticky notes, shapes and arrows that stick
  to what they connect; tasks with checkboxes (`[]` and space).
- **The desk**: whatever is outside the book is shared by every page.
- **Desktop app (Windows)**: a floating diary over the desktop (`Ctrl+Alt+D`), the desk and
  a mini diary of today right on the Windows desktop (`Ctrl+Alt+N`), a tray icon and
  automatic backups to a folder.
- **In English or Spanish** (Settings → Appearance).
- Everything is saved automatically on your computer; copies can be saved and opened.

## Getting started

Requirements: [Node.js](https://nodejs.org) 20 or later.

```bash
npm install
npm run dev
```

Open <http://localhost:5173>.

## Desktop app (Windows)

Requirements, besides Node.js: [Rust](https://rustup.rs) and the Visual Studio C++ tools
(the "Desktop development with C++" workload).

```bash
npm run desktop
```

To build the installer (it ends up in `src-tauri/target/release/bundle/nsis`):

```bash
npm run desktop:build
```

## Scripts

| Command                 | What it does                        |
| ----------------------- | ----------------------------------- |
| `npm run dev`           | Development server                  |
| `npm run build`         | Type-checks and builds `dist/`      |
| `npm run desktop`       | Opens the desktop app (development) |
| `npm run desktop:build` | Builds the desktop installer        |
| `npm test`              | Runs the tests                      |
| `npm run lint`          | Lints the code with ESLint          |
| `npm run format`        | Formats with Prettier               |

## Code

TypeScript with its own canvas engine (Canvas 2D, no React) and React only for the UI;
the desktop app uses [Tauri](https://tauri.app) (Rust). The folders and the order of the
layers are described in [PLAN.md](PLAN.md#arquitectura). Code and comments are in
English; the app's texts live in `src/i18n`.

## Shortcuts

Press `?` inside the app to see them all.

## License

[MIT](LICENSE)
