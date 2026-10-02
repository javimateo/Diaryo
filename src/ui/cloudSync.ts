import { ClientResponseError } from 'pocketbase';
import { create } from 'zustand';
import { refreshAccount, useAccount } from '../cloud/account';
import { pb } from '../cloud/client';
import type { DiaryKeys } from '../cloud/crypto';
import { fetchUsage, pocketbaseRemote } from '../cloud/pbRemote';
import { START, Sync, type PullCursor, type Remote } from '../cloud/sync';
import { currentKeys } from '../cloud/vault';
import { isDesktop, onDeskChangedElsewhere } from '../desktop/tauri';
import { t } from '../i18n';
import { asRecord, readJSON, readText, writeJSON, writeText } from '../lib/saved';
import { cleanUpDiary, getDB, type DiaryoDB } from '../storage/db';
import {
  applyIncoming,
  type AppliedChanges,
  hasContent,
  largePendingAssets,
  onLocalChanges,
  parsePath,
  replaceAssetSrc,
  trackEverything,
} from '../storage/tracking';
import { shrinkImage } from '../engine/assets';
import { useUI } from '../store/ui';
import { keepCopyOfDiary } from './fileActions';

/**
 * When and how the cloud diary syncs on this device (docs/cloud.md): after each change,
 * when the connection comes back, when another device pushed something, and every few
 * minutes — or only when asked, depending on the mode in the settings.
 */

export type SyncStatus =
  /** Without an account, or the cloud diary isn't unlocked here. */
  | 'off'
  | 'idle'
  | 'syncing'
  | 'offline'
  /** The space is full: changes stay here, waiting. */
  | 'full'
  | 'error';

interface SyncState {
  status: SyncStatus;
  lastSync: number | null;
  /** Pushing many changes (the first time): how it goes. */
  progress: { done: number; total: number } | null;
  /** Changes waiting to go up. */
  pending: number;
  usage: { used: number; quota: number } | null;
  /** The first time, with a diary here and one in the cloud: what to do with them. */
  choosing: boolean;
  /** Changes the server refused in the last sync (they stay pending). */
  rejected: number;
}

export const useSync = create<SyncState>(() => ({
  status: 'off',
  lastSync: null,
  progress: null,
  pending: 0,
  rejected: 0,
  usage: null,
  choosing: false,
}));

/** After a change, the wait before syncing (more changes usually follow). */
const AFTER_CHANGE = 4000;
/** Just in case nothing else triggered it. */
const EVERY = 5 * 60 * 1000;
/** The longest a pull waits for the user to finish a stroke or a text. */
const IDLE_WAIT = 20_000;

// ─── What is remembered per account ─────────────────────────────

interface Saved {
  cursor: PullCursor;
  /** The first sync with this account was done on this device. */
  began: boolean;
  lastSync: number | null;
}

const savedKey = (account: string) => `diaryo:sync:${account}`;
/** The account this device synced with last (its server records are the ones known here). */
const LAST_ACCOUNT_KEY = 'diaryo:sync-account';

function loadSaved(account: string): Saved {
  const saved = asRecord(readJSON(savedKey(account)));
  const cursor = asRecord(saved.cursor);
  const same = readText(LAST_ACCOUNT_KEY) === account;
  return {
    cursor:
      same && typeof cursor.updated === 'string' && typeof cursor.id === 'string'
        ? { updated: cursor.updated, id: cursor.id }
        : START,
    began: same && saved.began === true,
    lastSync: typeof saved.lastSync === 'number' ? saved.lastSync : null,
  };
}

function store(account: string, saved: Saved) {
  writeJSON(savedKey(account), saved);
  writeText(LAST_ACCOUNT_KEY, account);
}

// ─── Syncing ────────────────────────────────────────────────────

const mode = () => useUI.getState().settings.syncMode;

let running: Promise<void> | null = null;
let again = false;
/** The user said "not now" to the first-time choice: not asked again until they sync. */
let postponed = false;
let pointerDown = false;

const isOffline = (error: unknown) =>
  !navigator.onLine ||
  (error instanceof ClientResponseError && error.status === 0 && !error.isAbort);

const busy = () => pointerDown || !!useUI.getState().editing;

/**
 * Waits for the user to finish what they are drawing or writing (a reload would cut it).
 * False if they are still at it: then nothing is reloaded this time.
 */
async function whenIdle(): Promise<boolean> {
  const until = Date.now() + IDLE_WAIT;
  while (busy() && Date.now() < until) {
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return !busy();
}

// ─── Other tabs ─────────────────────────────────────────────────

/**
 * Tabs of the web app with the same diary: only one syncs at a time (a lock), and they
 * tell each other what changed, so each one shows it.
 */
const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('diaryo');

interface ChangedMessage {
  pages: string[];
  assets: boolean;
}

function tellOtherTabs(applied: AppliedChanges) {
  if (applied.pages.size === 0 && !applied.assets) return;
  channel?.postMessage({ pages: [...applied.pages], assets: applied.assets } as ChangedMessage);
}

/** What another tab changed, waiting for the user to finish here. */
let fromOtherTabs: AppliedChanges | null = null;

async function showFromOtherTabs() {
  const diary = useUI.getState().diary;
  if (!fromOtherTabs || !diary) return;
  if (busy()) {
    window.setTimeout(() => void showFromOtherTabs(), 1000);
    return;
  }
  const applied = fromOtherTabs;
  fromOtherTabs = null;
  await diary.showRemote(applied);
}

/** Runs it unless another tab is syncing (then that one does it). */
async function alone(action: () => Promise<void>) {
  if (!navigator.locks) return action();
  await navigator.locks.request('diaryo-sync', { ifAvailable: true }, async (lock) => {
    if (lock) await action();
  });
}

/**
 * The first sync with this account: with nothing here, the cloud's diary comes; with
 * nothing there, all of this one goes up; with both, the user chooses (returns false).
 */
async function begin(db: DiaryoDB, remote: Remote): Promise<boolean> {
  const here = await hasContent(db);
  const there = (await remote.listAfter(START, 1)).length > 0;
  if (here && there) return false;
  if (here) await trackEverything(db);
  else await db.tracked.clear();
  return true;
}

async function syncOnce(keys: DiaryKeys) {
  const account = useAccount.getState().account;
  const diary = useUI.getState().diary;
  if (!account || !diary) return;
  if (!navigator.onLine) return useSync.setState({ status: 'offline' });
  useSync.setState({ status: 'syncing', progress: null });
  const db = getDB();
  const remote = pocketbaseRemote(account.id);
  const saved = loadSaved(account.id);
  try {
    if (!saved.began) {
      if (!(await begin(db, remote))) {
        useSync.setState({ status: 'idle', choosing: !postponed });
        return;
      }
      saved.began = true;
      saved.cursor = START;
      store(account.id, saved);
    }
    // Each batch is written as it comes; the diary shows them all at the end.
    const sync = new Sync(db, remote, keys, (changes) =>
      diary.applyRemote(() => applyIncoming(db, changes), false),
    );
    if (await whenIdle()) {
      const pulled = await sync.pull(saved.cursor);
      saved.cursor = pulled.cursor;
      store(account.id, saved);
      await diary.showRemote(pulled.applied);
      tellOtherTabs(pulled.applied);
    } else {
      // Still drawing or writing: what came is fetched next time.
      again = true;
    }
    // What nothing uses any more (elements of deleted pages, images) frees its space.
    await cleanUpDiary(db);
    await shrinkPendingImages(db);
    const result = await sync.push((done, total) =>
      useSync.setState({ progress: total > 20 ? { done, total } : null }),
    );
    saved.lastSync = Date.now();
    store(account.id, saved);
    useSync.setState({
      status: result.full ? 'full' : result.rejected > 0 ? 'error' : 'idle',
      lastSync: saved.lastSync,
      progress: null,
      rejected: result.rejected,
    });
  } catch (error) {
    console.error("Couldn't sync", error);
    useSync.setState({ status: isOffline(error) ? 'offline' : 'error', progress: null });
    // The session ended (expired, or the account is gone): the user signs in again; what
    // is pending stays here and goes up then.
    if (error instanceof ClientResponseError && error.status === 401) {
      if (await refreshAccount()) useUI.getState().showToast(t().sync.sessionEnded);
    }
  } finally {
    await refreshInfo(true);
  }
}

/** Syncs with these keys (one at a time; if asked meanwhile, once more after). */
function run(keys: DiaryKeys): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    let rounds = 0;
    do {
      again = false;
      await alone(() => syncOnce(keys));
      // Waiting for the user to finish: a little later.
      if (again && busy()) {
        again = false;
        schedule(5000);
      }
    } while (again && ++rounds < 5);
  })().finally(() => {
    running = null;
  });
  return running;
}

/** The space used is asked for at most this often (it is asked after each sync anyway). */
const USAGE_EVERY = 30_000;
let usageAt = 0;

/** How many changes are waiting, and how much space is used. */
async function refreshInfo(force = false) {
  const pending = await getDB()
    .tracked.where('dirty')
    .equals(1)
    .count()
    .catch(() => 0);
  useSync.setState({ pending });
  if (!navigator.onLine || !useAccount.getState().account) return;
  if (!force && Date.now() - usageAt < USAGE_EVERY) return;
  usageAt = Date.now();
  try {
    const usage = await fetchUsage();
    useSync.setState({ usage });
    warnAboutSpace(usage);
  } catch {
    // It will be asked again next time.
  }
}

/** Images bigger than this (as text) are made smaller before they go up. */
const LARGE_IMAGE = 1_500_000;

/**
 * Images saved before they were compressed on insertion: a smaller version replaces them
 * (here too) before they go up. Each one only once: the smaller one isn't large any more.
 */
async function shrinkPendingImages(db: DiaryoDB) {
  for (const asset of await largePendingAssets(db, LARGE_IMAGE)) {
    const smaller = await shrinkImage(asset.src).catch(() => null);
    if (smaller) await replaceAssetSrc(db, asset.id, smaller);
  }
}

/** Shares of the space that are warned about, once each (until it goes down again). */
const WARN_AT = [0.8, 0.95];
const warnedKey = (account: string) => `diaryo:space-warned:${account}`;

/** Warns once when the space goes past 80 % and past 95 %. */
function warnAboutSpace({ used, quota }: { used: number; quota: number }) {
  const account = useAccount.getState().account;
  if (!account || quota <= 0) return;
  const share = used / quota;
  const reached = WARN_AT.filter((level) => share >= level).pop() ?? 0;
  const warned = Number(readText(warnedKey(account.id)) ?? 0);
  // Below the first level again: it will warn again next time.
  if (reached === 0 && warned > 0 && share < WARN_AT[0] - 0.1) {
    return writeText(warnedKey(account.id), '0');
  }
  if (reached <= warned || share >= 1) return;
  writeText(warnedKey(account.id), String(reached));
  useUI.getState().showToast(t().sync.spaceWarning(Math.round(share * 100)), {
    label: t().sync.seeSpace,
    run: () => useUI.getState().setSettingsOpen(true),
  });
}

/**
 * "Sync now". With the "manual with password" mode the keys come from the dialog (and
 * are dropped afterwards); otherwise they are the ones kept on this device.
 */
export function syncNow(keys?: DiaryKeys): Promise<void> {
  postponed = false;
  const use = keys ?? currentKeys();
  if (!use) {
    if (mode() === 'password') {
      const { settingsOpen, setVaultDialog } = useUI.getState();
      setVaultDialog({ view: 'unlock', once: true, fromSettings: settingsOpen });
    }
    return Promise.resolve();
  }
  return run(use);
}

let timer = 0;

/** Syncs in a moment, if it syncs by itself. */
function schedule(delay: number) {
  if (mode() !== 'auto' || !currentKeys()) return;
  window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    const keys = currentKeys();
    if (keys) void run(keys);
  }, delay);
}

// ─── The first time: both diaries ───────────────────────────────

/**
 * The user chose: merge both diaries (each change keeps the most recent version), or use
 * the cloud's one, keeping this device's diary in a file first.
 */
export async function chooseFirstSync(choice: 'merge' | 'cloud' | 'later') {
  useSync.setState({ choosing: false });
  if (choice === 'later') {
    postponed = true;
    return;
  }
  const account = useAccount.getState().account;
  const { diary, showToast } = useUI.getState();
  if (!account || !diary) return;
  const db = getDB();
  if (choice === 'cloud') {
    let where: string;
    try {
      where = await keepCopyOfDiary(diary);
    } catch (error) {
      console.error("Couldn't keep a copy of the diary", error);
      showToast(t().openCopy.beforeFailed);
      return;
    }
    await diary.replace({ pages: [], assets: [], fonts: [] }, false);
    showToast(t().sync.keptCopy(where));
  } else {
    await trackEverything(db);
  }
  store(account.id, { ...loadSaved(account.id), began: true, cursor: START });
  await syncNow();
}

// ─── Starting ───────────────────────────────────────────────────

/** Is the cloud diary on, here? (Signed in, and unlocked or asking for the password.) */
const active = () => {
  const { account, vault } = useAccount.getState();
  return !!account && (vault === 'unlocked' || mode() === 'password');
};

/** Starts syncing when it should, and stops when it shouldn't. Returns how to stop. */
export function startSync() {
  let unsubscribeRealtime: (() => Promise<void>) | null = null;
  let realtimeFor: string | null = null;

  const listenToOthers = async () => {
    const account = useAccount.getState().account;
    const wanted = active() && mode() === 'auto' && account ? account.id : null;
    if (wanted === realtimeFor) return;
    realtimeFor = wanted;
    await unsubscribeRealtime?.().catch(() => undefined);
    unsubscribeRealtime = null;
    if (!wanted) return;
    try {
      unsubscribeRealtime = await pb.collection('items').subscribe('*', () => schedule(800));
    } catch (error) {
      console.error("Couldn't listen to the other devices", error);
    }
  };

  /** Something about the account, the vault or the mode changed. */
  const update = () => {
    const account = useAccount.getState().account;
    if (!active() || !account) {
      useSync.setState({ status: 'off', progress: null, choosing: false });
    } else {
      const saved = loadSaved(account.id);
      useSync.setState((s) => ({
        status: s.status === 'off' ? 'idle' : s.status,
        lastSync: saved.lastSync,
      }));
      void refreshInfo();
      schedule(300);
    }
    void listenToOthers();
  };

  const unsubscribeAccount = useAccount.subscribe((state, previous) => {
    if (state.account?.id !== previous.account?.id || state.vault !== previous.vault) update();
  });
  const unsubscribeUI = useUI.subscribe((state, previous) => {
    if (state.settings.syncMode !== previous.settings.syncMode) update();
    if (state.diary !== previous.diary) update();
  });
  // Something changed here (not only the view): it goes up soon, and the other tabs show it.
  onLocalChanges((paths) => {
    const applied: AppliedChanges = { pages: new Set(), assets: false };
    for (const path of paths) {
      const target = parsePath(path);
      if (target?.kind === 'page') applied.pages.add(target.id);
      else if (target?.kind === 'el') applied.pages.add(target.pageId!);
      else if (target) applied.assets = true;
    }
    tellOtherTabs(applied);
    schedule(AFTER_CHANGE);
    if (active()) void refreshInfo();
  });
  const onOnline = () => schedule(500);
  const onOffline = () => active() && useSync.setState({ status: 'offline' });
  const onVisible = () => document.visibilityState === 'visible' && schedule(1000);
  const onPointerDown = () => (pointerDown = true);
  const onPointerUp = () => (pointerDown = false);
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('pointerdown', onPointerDown, true);
  window.addEventListener('pointerup', onPointerUp, true);
  window.addEventListener('pointercancel', onPointerUp, true);
  const onMessage = (event: MessageEvent<ChangedMessage>) => {
    const { pages, assets } = event.data;
    fromOtherTabs ??= { pages: new Set(), assets: false };
    pages.forEach((id) => fromOtherTabs!.pages.add(id));
    fromOtherTabs.assets ||= assets;
    void showFromOtherTabs();
  };
  channel?.addEventListener('message', onMessage);
  const interval = window.setInterval(() => schedule(0), EVERY);
  // The desk changed on the Windows desktop (another window wrote it).
  const deskListener = isDesktop() ? onDeskChangedElsewhere(() => schedule(AFTER_CHANGE)) : null;

  update();

  return () => {
    unsubscribeAccount();
    unsubscribeUI();
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('pointerdown', onPointerDown, true);
    window.removeEventListener('pointerup', onPointerUp, true);
    window.removeEventListener('pointercancel', onPointerUp, true);
    channel?.removeEventListener('message', onMessage);
    onLocalChanges(null);
    window.clearInterval(interval);
    window.clearTimeout(timer);
    void deskListener?.then((stop) => stop());
    void unsubscribeRealtime?.().catch(() => undefined);
  };
}
