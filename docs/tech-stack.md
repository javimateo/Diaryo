# Tech stack

What diaryo is built with, and the license of each piece. diaryo itself is under the
[PolyForm Noncommercial License 1.0.0](../LICENSE); every library and font keeps its own
license, all of them permissive and compatible with that.

## Overview

| Part                 | Technology                                                                                   |
| -------------------- | -------------------------------------------------------------------------------------------- |
| Language             | [TypeScript](https://www.typescriptlang.org) (strict), Rust for the desktop side             |
| Canvas engine        | Our own, on the HTML Canvas 2D API (no framework)                                            |
| Interface            | [React](https://react.dev) 19 + [Zustand](https://zustand.docs.pmnd.rs) for its state        |
| Storage              | IndexedDB through [Dexie](https://dexie.org)                                                 |
| Build and dev server | [Vite](https://vite.dev)                                                                     |
| Desktop app          | [Tauri](https://tauri.app) 2 (Rust + the system WebView2), Windows                           |
| Website              | [Astro](https://astro.build) with a React island for the live demo                           |
| Tests                | [Vitest](https://vitest.dev) (+ fake-indexeddb for the storage)                              |
| Quality              | [ESLint](https://eslint.org), [Prettier](https://prettier.io), `cargo clippy` / `cargo fmt`  |
| Releases             | GitHub Actions + [tauri-action](https://github.com/tauri-apps/tauri-action), GitHub Releases |
| Hosting              | [Coolify](https://coolify.io) on a VPS, Docker + nginx                                       |

## App libraries (npm)

| Library                                                             | What for                                               | License           |
| ------------------------------------------------------------------- | ------------------------------------------------------ | ----------------- |
| [react](https://react.dev), react-dom                               | The interface (toolbar, panels, dialogs)               | MIT               |
| [zustand](https://github.com/pmndrs/zustand)                        | Interface state                                        | MIT               |
| [dexie](https://dexie.org)                                          | The diary's database (IndexedDB)                       | Apache-2.0        |
| [@noble/ciphers](https://github.com/paulmillr/noble-ciphers)        | Encrypting the diary on the device (XChaCha20)         | MIT               |
| [perfect-freehand](https://github.com/steveruizok/perfect-freehand) | Pressure-sensitive pencil and highlighter strokes      | MIT               |
| [roughjs](https://roughjs.com)                                      | The hand-drawn look of shapes and arrows               | MIT               |
| [rbush](https://github.com/mourner/rbush)                           | Spatial index: hit testing and drawing only what shows | MIT               |
| [lucide-react](https://lucide.dev)                                  | Icons                                                  | ISC               |
| [@tauri-apps/api](https://tauri.app)                                | Talking to the desktop side                            | Apache-2.0 OR MIT |
| [@tauri-apps/plugin-updater](https://tauri.app/plugin/updater/)     | Automatic updates                                      | MIT OR Apache-2.0 |
| [@tauri-apps/plugin-process](https://tauri.app/plugin/process/)     | Restarting after an update                             | MIT OR Apache-2.0 |

## Desktop libraries (Rust crates)

| Crate                                                  | What for                                                  | License           |
| ------------------------------------------------------ | --------------------------------------------------------- | ----------------- |
| [tauri](https://tauri.app)                             | The desktop app: windows, tray, commands                  | Apache-2.0 OR MIT |
| tauri-plugin-global-shortcut                           | `Ctrl+Alt+D` / `Ctrl+Alt+N` from anywhere                 | Apache-2.0 OR MIT |
| tauri-plugin-autostart                                 | Starting with Windows                                     | Apache-2.0 OR MIT |
| tauri-plugin-single-instance                           | Only one diaryo at a time                                 | Apache-2.0 OR MIT |
| tauri-plugin-dialog                                    | Choosing the backups folder                               | Apache-2.0 OR MIT |
| tauri-plugin-opener                                    | Opening the backups folder                                | Apache-2.0 OR MIT |
| tauri-plugin-updater, tauri-plugin-process             | Automatic updates and restarting                          | Apache-2.0 OR MIT |
| [serde](https://serde.rs), serde_json                  | Settings and messages                                     | MIT OR Apache-2.0 |
| [windows-sys](https://github.com/microsoft/windows-rs) | The desk on the Windows desktop, foreground window checks | MIT OR Apache-2.0 |

## Website libraries

| Library                                      | What for                                       | License   |
| -------------------------------------------- | ---------------------------------------------- | --------- |
| [astro](https://astro.build), @astrojs/react | Static pages in two languages, the demo island | MIT       |
| react, react-dom, lucide-react               | The live demo (it reuses the app's engine)     | MIT / ISC |

## Fonts

All bundled with [Fontsource](https://fontsource.org) (self-hosted: nothing is loaded
from third-party servers) and under the [SIL Open Font License 1.1](https://openfontlicense.org).

| Font                                                                                                | Where                                        |
| --------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| [Inter](https://rsms.me/inter/)                                                                     | One of the text fonts                        |
| [Caveat](https://fonts.google.com/specimen/Caveat)                                                  | Handwriting: the diary's dates, the website  |
| [Nunito](https://fonts.google.com/specimen/Nunito)                                                  | Text font                                    |
| [Lora](https://fonts.google.com/specimen/Lora)                                                      | Text font; the name and the website's titles |
| [JetBrains Mono](https://www.jetbrains.com/lp/mono/)                                                | Text font (monospace)                        |
| [Patrick Hand](https://fonts.google.com/specimen/Patrick+Hand), [Comic Neue](https://comicneue.com) | Handwriting-like text fonts                  |
| [Lilita One](https://fonts.google.com/specimen/Lilita+One)                                          | Display text font                            |
| [Nunito Sans](https://fonts.google.com/specimen/Nunito+Sans)                                        | The interface of the app and the website     |

## Development tools

TypeScript (Apache-2.0), Vite, @vitejs/plugin-react, Vitest, ESLint, typescript-eslint,
eslint-plugin-react-hooks, Prettier, @tauri-apps/cli, @astrojs/check (MIT or
Apache-2.0), fake-indexeddb (Apache-2.0).
