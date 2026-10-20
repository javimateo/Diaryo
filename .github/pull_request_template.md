## What changes

<!-- What this does and why. Link the issue it closes: "Closes #…". -->

## How it was checked

<!-- What you tried, and where: light and dark, phone width, desktop app… Screenshots for anything visible. -->

## Checklist

- [ ] It goes to `develop` (a hotfix, to `main`)
- [ ] `npx tsc --noEmit`, `npm run lint`, `npm test` and `npx prettier --check .` pass
- [ ] Desktop side touched: `cargo fmt --check`, `cargo clippy` and `cargo test` pass
- [ ] Texts the user sees are in `src/i18n` (`es.ts` and `en.ts`)
- [ ] The docs in `docs/` and the [CHANGELOG](../CHANGELOG.md) say what changed, if they need to
