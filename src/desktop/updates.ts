import type { Update } from '@tauri-apps/plugin-updater';

/** The first look a little after starting (not to slow it down), then every six hours. */
const FIRST_CHECK = 20_000;
const CHECK_EVERY = 6 * 60 * 60 * 1000;

export interface UpdaterHooks {
  /** Update by itself (Settings): download it and install it while diaryo is hidden. */
  auto: () => boolean;
  /** Without auto-update: a new version can be installed now (`install`). */
  onAvailable: (version: string, install: () => void) => void;
  /** Right before installing (the app closes): save what is pending. */
  beforeInstall: () => Promise<void>;
}

/**
 * Updates from the GitHub releases (the Tauri updater: `latest.json`, signed). With
 * auto-update the new version downloads in the background and installs when the diary
 * is hidden, so nobody is interrupted; the app then reopens. Otherwise, it asks.
 */
export class Updater {
  private update: Update | null = null;
  private downloaded = false;
  private installing = false;
  private readonly timers: ReturnType<typeof setTimeout>[] = [];

  constructor(private readonly hooks: UpdaterHooks) {}

  start() {
    this.timers.push(setTimeout(() => void this.check(), FIRST_CHECK));
    this.timers.push(setInterval(() => void this.check(), CHECK_EVERY));
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  stop() {
    this.timers.forEach(clearTimeout);
    document.removeEventListener('visibilitychange', this.onVisibility);
  }

  /** Installs the new version (downloading it first if needed) and reopens diaryo. */
  install = async () => {
    const update = this.update;
    if (!update || this.installing) return;
    this.installing = true;
    try {
      if (!this.downloaded) await update.download();
      await this.hooks.beforeInstall();
      // On Windows the installer closes the app; the relaunch covers the other systems.
      await update.install();
      const { relaunch } = await import('@tauri-apps/plugin-process');
      await relaunch();
    } catch (error) {
      console.error("Couldn't install the update", error);
      this.installing = false;
    }
  };

  private async check() {
    try {
      // Already found: without auto-update, it is announced again (the notice goes away).
      const { check } = await import('@tauri-apps/plugin-updater');
      const update = this.update ?? (await check());
      if (!update) return;
      this.update = update;
      if (!this.hooks.auto()) {
        if (!this.installing) this.hooks.onAvailable(update.version, () => void this.install());
        return;
      }
      if (this.downloaded) return;
      await update.download();
      this.downloaded = true;
      this.onVisibility();
    } catch (error) {
      // No connection, GitHub down…: it tries again later.
      console.warn("Couldn't check for updates", error);
      this.update = null;
    }
  }

  /** With the diary hidden (or started hidden with Windows), a downloaded update goes in. */
  private onVisibility = () => {
    if (this.downloaded && this.hooks.auto() && document.visibilityState === 'hidden') {
      void this.install();
    }
  };
}
