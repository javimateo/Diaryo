# diaryo — working notes for Claude

An infinite-canvas diary: a web app (Vite + React) and a desktop app (Tauri) on the same
code, with an optional end-to-end encrypted cloud (PocketBase). The roadmap is
`PLAN.md` (Spanish); how things work is in `docs/` (read the relevant one before
changing an area: `architecture.md`, `cloud.md`, `tech-stack.md`, `releasing.md`,
`deployment.md`).

## How to work

1. **Don't assume. Don't hide confusion. Lay out the trade-offs.** If something is
   ambiguous, check the code or ask; when there are options, say what each costs and
   recommend one.
2. **Write the least code that solves the problem.** Nothing speculative: no options,
   abstractions or "just in case" branches nobody asked for.
3. **Touch only what the task needs.** Clean up only the mess you made. A bug found on the
   way is reported (or fixed if it is small and clearly related), not silently refactored.
4. **Define what success looks like, and loop until it is verified** (see Verifying).
   "Done" means checked, not written. Say plainly what wasn't tested.

Also:

- **Plans first** for anything beyond a small fix; **a visual mockup before any aesthetic
  change** (and wait for the OK).
- **Never commit, push or merge.** The user runs git. At the end of each step, give the
  exact commands (Git Flow: `feature/*` or `fix/*` from `develop`, `git merge --no-ff`
  into `develop`, delete the branch). End commit messages with the
  `Co-Authored-By` line.
- **Never ask for or handle secrets** (Google client secret, PocketBase admin password,
  the updater key `~/.tauri/diaryo.key`).
- Answer the user in **Spanish**. Code, comments and `docs/` in **English**; `PLAN.md`
  in Spanish.

## Code

- TypeScript strict, React 19 function components, Zustand stores, Dexie (IndexedDB).
- Layers, each importing only from the ones before it:
  `lib → engine → i18n → storage → diary → cloud → store → desktop → ui`.
  The engine knows nothing about React; storage knows nothing about the cloud.
- Comments explain **why** (or what a non-obvious thing is), in plain words, like the
  existing ones. Match the surrounding style; don't comment the obvious.
- Every user-facing text goes through `src/i18n` (`es.ts` is the reference shape, `en.ts`
  must match). Colors and sizes come from the CSS tokens (`src/styles/tokens.css`);
  every UI works in light and dark, on desktop and on phones.
- Pure logic gets unit tests (Vitest, `*.test.ts` next to the file; IndexedDB through
  `fake-indexeddb`). The cloud sync is tested against a fake server with two devices
  (`src/cloud/sync.test.ts`): new sync behaviour gets a case there.
- Server schema and rules live in `cloud/pb_migrations` and `cloud/pb_hooks` (deployed
  with the image); `cloud/check.mjs` checks a running server.

## Verifying

Before saying something works:

```bash
npx tsc --noEmit
npx eslint src
npx vitest run
npx prettier --check src docs
```

For anything visible, check it in the browser pane (`preview_start` with `diaryo`), in
light and dark, and at phone width when layout is involved. For the cloud, run a local
PocketBase (below). Rust changes: `cargo check` in `src-tauri`.

## Practical notes

- **Local cloud server**: `pocketbase serve --http=127.0.0.1:8091 --dir=<scratch dir>
--automigrate=false --migrationsDir=cloud/pb_migrations --hooksDir=cloud/pb_hooks`, and
  `VITE_CLOUD_URL=http://127.0.0.1:8091` in `.env.local` (git-ignored; delete it and stop
  the server when done). Without `--automigrate=false`, admin-panel changes write new
  migration files into the repo.
- **Browser tests and HMR**: after a hot reload, `import('/src/…')` from the page can get
  a different module instance than the app's. Restart the dev server before driving the
  app through its modules.
- **Two "devices"** in the browser: a second dev server on another port (different origin,
  separate storage).
- **Shell edits**: backticks and `${}` inside `node -e "…"` are expanded by bash. Use the
  Edit tool, or write a script file and run it.
- **Installer**: `npx tauri build` builds the NSIS installer; the final "no private key"
  error only means it isn't signed for the updater (that happens in the release workflow).
