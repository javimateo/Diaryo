import { asRecord, readJSON, readText, writeJSON, writeText } from '../lib/saved';
import { cleanUpDiary, type DiaryDump, type DiaryoDB } from '../storage/db';
import {
  applyIncoming,
  hasContent,
  trackEverything,
  type AppliedChanges,
} from '../storage/tracking';
import type { DiaryKeys } from './crypto';
import { START, Sync, type PullCursor, type PushResult, type Remote } from './sync';

/**
 * One account's cloud diary on this device, without the interface (docs/cloud.md): what is
 * remembered per account, when the user must choose first, one round of pulling and
 * pushing, and what each choice does. `src/ui/cloudSync.ts` decides when, and shows it.
 */

// ─── What is remembered per account ─────────────────────────────

export interface Saved {
  cursor: PullCursor;
  /** The first sync with this account was done on this device. */
  began: boolean;
  lastSync: number | null;
}

const savedKey = (account: string) => `diaryo:sync:${account}`;
/** The account this device synced with last (its server records are the ones known here). */
const LAST_ACCOUNT_KEY = 'diaryo:sync-account';

export function loadSaved(account: string): Saved {
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

/**
 * Signed in again with changes made here that aren't in the cloud (while signed out, or
 * left pending): they don't go up until the user says so. Kept until then, even if the
 * app is closed.
 */
const askKey = (account: string) => `diaryo:sync-ask:${account}`;

/** Signing in (not opening the app already signed in): what changed here waits. */
export const signedIn = (account: string) => writeText(askKey(account), '1');

export const countPending = (db: DiaryoDB) => db.tracked.where('dirty').equals(1).count();

// ─── A round ────────────────────────────────────────────────────

/** What the sync needs from the diary (the app's `Diary`). */
export interface SyncedDiary {
  applyRemote(apply: () => Promise<AppliedChanges>, show?: boolean): Promise<AppliedChanges>;
  showRemote(applied: AppliedChanges): Promise<void>;
  replace(dump: DiaryDump, track?: boolean): Promise<number>;
}

/**
 * What the user decides before syncing: the first time with a diary here and one in the
 * cloud (`first`) or none there (`empty`), or on signing in again with changes here that
 * aren't in the cloud (`return`).
 */
export type Question = 'first' | 'empty' | 'return';

export type RoundResult =
  | { question: Question; pending: number }
  | {
      question: null;
      /** What the pull changed here (null if the user was busy and it waits). */
      applied: AppliedChanges | null;
      push: PushResult;
      lastSync: number;
    };

export interface RoundOptions {
  /** False while the user is still drawing or writing: nothing is pulled this time. */
  idle: () => Promise<boolean>;
  /** Right before pushing (the images are made smaller there). */
  beforePush?: () => Promise<void>;
  onProgress?: (done: number, total: number) => void;
}

/**
 * The first sync with this account: with nothing here, the cloud's diary comes. With a
 * diary here, the user chooses what to do with it: it may be another account's, or one
 * they don't want in this account.
 */
async function begin(db: DiaryoDB, remote: Remote): Promise<Question | null> {
  if (await hasContent(db)) {
    return (await remote.listAfter(START, 1)).length > 0 ? 'first' : 'empty';
  }
  await db.tracked.clear();
  return null;
}

/** One round: pulls what changed elsewhere and pushes what changed here, unless asking. */
export async function syncRound(
  db: DiaryoDB,
  remote: Remote,
  keys: DiaryKeys,
  account: string,
  diary: SyncedDiary,
  options: RoundOptions,
): Promise<RoundResult> {
  const saved = loadSaved(account);
  if (!saved.began) {
    const question = await begin(db, remote);
    if (question) return { question, pending: 0 };
    writeText(askKey(account), '');
    saved.began = true;
    saved.cursor = START;
    store(account, saved);
  }
  if (readText(askKey(account))) {
    const pending = await countPending(db);
    if (pending > 0) return { question: 'return', pending };
    writeText(askKey(account), '');
  }
  // Each batch is written as it comes; the diary shows them all at the end.
  const sync = new Sync(db, remote, keys, (changes) =>
    diary.applyRemote(() => applyIncoming(db, changes), false),
  );
  let applied: AppliedChanges | null = null;
  if (await options.idle()) {
    const pulled = await sync.pull(saved.cursor);
    saved.cursor = pulled.cursor;
    store(account, saved);
    await diary.showRemote(pulled.applied);
    applied = pulled.applied;
  }
  // What nothing uses any more (elements of deleted pages, images) frees its space.
  await cleanUpDiary(db);
  await options.beforePush?.();
  const push = await sync.push(options.onProgress);
  saved.lastSync = Date.now();
  store(account, saved);
  return { question: null, applied, push, lastSync: saved.lastSync };
}

// ─── The user's choices ─────────────────────────────────────────

const EMPTY: DiaryDump = { pages: [], assets: [], fonts: [] };

/**
 * The user answered `asked`: merge this diary (or the changes made here) with the cloud's
 * (each change keeps the most recent version; with an empty cloud, it goes up), or use the
 * cloud's one (or start a blank one). The caller keeps this device's diary in a file
 * before `cloud`; the next round does the rest.
 */
export async function settleChoice(
  db: DiaryoDB,
  account: string,
  diary: SyncedDiary,
  asked: Question,
  choice: 'merge' | 'cloud',
) {
  if (choice === 'cloud') await diary.replace(EMPTY, false);
  else if (asked !== 'return') await trackEverything(db);
  writeText(askKey(account), '');
  // Taking the cloud's diary reads all of it again; merging goes on from where it was.
  const saved = loadSaved(account);
  store(account, {
    ...saved,
    began: true,
    cursor: choice === 'cloud' || asked !== 'return' ? START : saved.cursor,
  });
}

/**
 * The diary leaves this device (a blank one opens), which forgets it synced that account:
 * the next time it signs in here, it all comes again. Only when nothing is pending.
 */
export async function removeDiaryFromDevice(db: DiaryoDB, diary: SyncedDiary) {
  await diary.replace(EMPTY, false);
  await db.tracked.clear();
  writeText(LAST_ACCOUNT_KEY, '');
}
