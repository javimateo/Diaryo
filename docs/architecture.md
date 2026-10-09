# Architecture

diaryo is one TypeScript codebase that runs in three places:

- the **web app** (`npm run dev` / `dist/`), which saves in the browser;
- the **desktop app** for Windows, the same web app inside [Tauri](https://tauri.app)
  (`src-tauri/`, in Rust) plus what only a desktop can do;
- the **website** (`web/`), whose live demo reuses the app's engine and diary.

## Layers

```
src/
  lib/       Pure helpers any layer may use (dates, what is saved in the browser)
  engine/    The canvas engine: plain TypeScript, no React, no storage, no diary
  i18n/      The app's texts in Spanish and English, and dates in the chosen language
  storage/   The database (Dexie / IndexedDB), its encryption on the device, autosave and
             backup files
  diary/     The diary: one double page per day, turning pages, the desk, search
  cloud/     The account, the end-to-end encryption, the sync (see cloud.md) and the diary
             encrypted on the device (privacy.md)
  store/     The interface state (Zustand)
  desktop/   The bridge with the desktop app (Tauri): modes, shortcuts, backups, updates
  ui/        React components (toolbar, panels, dialogs; ui/desktop, the desktop ones)
  styles/    Design tokens (light and dark) and styles, one file per part of the UI
  fonts.ts   The bundled fonts (the website's demo imports it too)
src-tauri/   The desktop side, in Rust
web/         The website (Astro)
```

Each layer only uses the ones above it, in this order (the store only names the desktop's
types, to hold its state). The engine knows nothing about
React, storage or the diary: it takes elements in, draws them, handles input and tells
the outside what changed. Texts are passed to it (`BookSpread.labels`,
`setLinkLabels`), so it is language-agnostic too.

## The canvas engine (`src/engine`)

`Engine` (`engine.ts`) is the only public entry point. It owns two stacked canvases —
the **scene** (everything drawn) and the **overlay** (what is being drawn right now,
selection handles, the turning sheet) — and redraws only when something changed, on
`requestAnimationFrame`.

| Area                     | Files                                                                                                                                                             |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Elements and their model | `elements.ts` (strokes, texts, notes, shapes, arrows, images), `types.ts`                                                                                         |
| Scene and hit testing    | `scene.ts` (elements + an R-tree spatial index), `hit.ts`, `geometry.ts`                                                                                          |
| Camera                   | `camera.ts` (world ↔ screen), `cameraMotion.ts` (smooth zoom, inertia, flights)                                                                                   |
| Input and tools          | `handlers/` (select, draw, erase, create, shape, arrow), `tools.ts`, `cursors.ts`                                                                                 |
| Drawing                  | `render.ts`, `drawing.ts`, `strokes.ts` (perfect-freehand), `shapes.ts` (Rough.js), `text.ts`, `notes.ts`, `grid.ts`                                              |
| Arrows and links         | `arrows.ts`, `arrowGeometry.ts` (ends attached to elements), `links.ts` (page links)                                                                              |
| Editing                  | `editing.ts`, `containers.ts` (text inside shapes), `tasks.ts` (checkboxes), `restyle.ts`, `selectionStyle.ts`                                                    |
| Selection                | `selection.ts`, `transform.ts`, `arrange.ts` (layers, align, flip)                                                                                                |
| Undo                     | `history.ts` (changes are maps of element id → new value or deletion)                                                                                             |
| The diary's look         | `book.ts` (the open book, paper styles), `cover.ts`, `desk.ts` and `noise.ts` (procedural wood, cork and linen), `pageTurn.ts` (the sheet you pull by its corner) |
| Other                    | `clipboard.ts`, `assets.ts` (images), `fonts.ts`, `palette.ts` (named colors per theme)                                                                           |

Input goes through Pointer Events: one pointer drives the active tool; with a finger,
two fingers pinch and move the view and holding still opens the context menu. Sizes set
in screen pixels (stroke width, font size, new notes) are divided by the zoom when
creating, so things look the same size on screen at any zoom.

Options: `transparent` (the floating diary over the desktop), `deskLayer` (only the
desk, on the Windows desktop), `embedded` (the website demo: fixed view, the page keeps
scrolling) and `noteSize`.

## The diary (`src/diary`, `src/storage`)

`Diary` decides which pages exist and which one is open. Each page belongs to a day
(`YYYY-MM-DD`) and is a canvas; when changing page the previous one is saved and the next
one loaded into the engine, turning the sheet if it is a neighbour. Empty pages are not
kept. What lies outside the book is **the desk**, one for the whole diary: its elements
are saved apart (the `desk` page) and stay loaded when turning pages; an element changes
between page and desk only when it crosses the book's edge.

Storage is IndexedDB through Dexie (`storage/db.ts`): a `pages` table and an `elements`
table (one row per element, so changing one only writes that one), plus images and
custom fonts. `Autosave` writes the changes shortly after they happen. A whole diary can
be dumped to a `.diaryo` file and merged back (`storage/files.ts`). Optionally, everything
is encrypted on the device (`storage/sealing.ts`, see [privacy](privacy.md)).

## The interface (`src/ui`, `src/store`)

React only draws the chrome around the canvas: toolbar, style panel, top actions, page
navigation, dialogs (settings, help, map, search, links) and the text editor — a
`<textarea>` laid exactly over the text being edited. The state lives in one Zustand
store (`store/ui.ts`); settings and the diary's look are saved in the browser
(`lib/saved.ts`). On narrow screens `styles/mobile.css` rearranges everything for a
thumb.

## The desktop app (`src/desktop`, `src-tauri`)

The Rust side (`src-tauri/src`) owns what a web page can't do:

| File                                     | What it does                                                                                                                                                |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib.rs`                                 | Starts the app: plugins, windows, tray, shortcuts                                                                                                           |
| `window.rs`                              | The main window: normal window or floating diary over the desktop                                                                                           |
| `desk_layer.rs`                          | The desk on the Windows desktop: a transparent window right above the wallpaper and behind the other windows, letting clicks through where there is nothing |
| `shortcuts.rs`                           | Global shortcuts (`Ctrl+Alt+D`, `Ctrl+Alt+N`)                                                                                                               |
| `tray.rs`                                | The tray icon and its menu                                                                                                                                  |
| `backup.rs`                              | Daily backups to a folder, keeping the last two weeks                                                                                                       |
| `settings.rs`, `state.rs`, `commands.rs` | Desktop settings and the commands the page can call                                                                                                         |
| `texts.rs`                               | The desktop side's texts in both languages                                                                                                                  |

The window and the floating diary are the same window: the desktop side decides which
one it is and tells the page, and every time it shows the window it says the mode again,
so a page that missed a change (it was loading) catches up. A request to hide it after
the floating diary's fade carries the showing it came from, and is ignored if the window
was shown again meanwhile.

On the TypeScript side, `desktop/tauri.ts` wraps Tauri (imported only on the desktop, so
the web build doesn't load it), `desktop/bridge.ts` connects the diary with the window
modes and backups, `desktop/deskLayer.ts` drives the desk window, and
`desktop/updates.ts` checks GitHub for new versions (see [releasing](releasing.md)).

## The website (`web/`)

An [Astro](https://astro.build) site with static pages in Spanish (`/`) and English
(`/en/`). The hero's live demo (`web/src/demo`) is a React island that imports the app's
code through the `@app` alias (`../src`): the same engine and diary, with its own
database that is emptied on every visit. It only loads on computers (`client:media`); on
phones the page shows a picture instead. The feature scenes are CSS animations that play
only while in view. When built, the site asks GitHub for the latest release to link the
installer (`web/src/release.ts`).

## Tests

Vitest runs the unit tests next to the code (`*.test.ts`): the engine's geometry, arrows,
selection and history, the diary's pages and desk, storage (with fake-indexeddb),
search, dates and the desktop helpers. On the Rust side, `cargo test`.

The CI (`.github/workflows/ci.yml`) runs them on every push to `develop` or `main` and on
every pull request, with the types, lint and format checks, and `cloud/check.mjs` against
a PocketBase with the repository's schema and rules.
