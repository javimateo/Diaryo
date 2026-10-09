import { call, isDesktop, saveFileAs } from '../desktop/tauri';
import type { Diary } from '../diary/diary';
import type { Engine } from '../engine/engine';
import { fonts } from '../engine/fonts';
import { useUI } from '../store/ui';
import type { DiaryDump } from '../storage/db';
import {
  datedName,
  downloadBlob,
  FILE_EXTENSION,
  parseBackup,
  serializeDiary,
} from '../storage/files';
import { t } from '../i18n';
import { openSealedCopy, sealCopy } from '../cloud/lock';
import { sealedHere } from '../cloud/lockState';

/**
 * Saves a file the user asked for: downloaded on the web; on the desktop, where they
 * choose (and a notice says where it went).
 */
export async function saveFile(blob: Blob, name: string) {
  if (!isDesktop()) return downloadBlob(blob, name);
  const { showToast } = useUI.getState();
  try {
    const where = await saveFileAs(blob, name);
    if (where) showToast(t().toasts.savedTo(where));
  } catch (error) {
    console.error("Couldn't save the file", error);
    showToast(t().toasts.saveFailed);
  }
}

/**
 * Downloads a backup of the whole diary, with images and fonts. With the diary encrypted
 * here, the user chooses first: encrypted like the diary, or readable.
 */
export async function saveCopy(diary: Diary, readable?: boolean) {
  if (sealedHere() && readable === undefined) {
    useUI.getState().setCopyPrivacy({ kind: 'save' });
    return;
  }
  const text = serializeDiary(await diary.dump());
  const contents = (!readable && sealCopy(text)) || text;
  await saveFile(new Blob([contents], { type: 'application/json' }), datedName() + FILE_EXTENSION);
}

/**
 * Opens a backup. A single-page one replaces the open page and can be undone. For a
 * whole-diary one the user chooses: replace this diary with it, or merge the two.
 */
export const openCopy = async (engine: Engine, file: File) =>
  openCopyText(engine, await file.text());

/** Opens the file picker to open a backup of the diary. */
export function pickCopy() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = `${FILE_EXTENSION},application/json`;
  input.onchange = () => {
    const file = input.files?.[0];
    const { engine } = useUI.getState();
    if (file && engine) void openCopy(engine, file);
  };
  input.click();
}

/** Opens a backup's text (an encrypted one, once opened, comes here again). */
export async function openCopyText(engine: Engine, text: string) {
  const { showToast } = useUI.getState();
  const backup = parseBackup(text);
  if (!backup) {
    showToast(t().toasts.notABackup);
    return;
  }
  if (backup.kind === 'sealed') {
    // This diary's (or one opened here): at once. Otherwise its password is asked for.
    const opened = await openSealedCopy(backup.sealed).catch(() => null);
    if (opened !== null) return openCopyText(engine, opened);
    useUI.getState().setCopyPrivacy({ kind: 'open', backup: backup.sealed });
    return;
  }
  const data = backup.kind === 'page' ? backup.page : backup.diary;
  for (const font of data.fonts) {
    await fonts.addCustom(font.name, font.src, font.id).catch(() => undefined);
  }
  if (backup.kind === 'page') {
    for (const asset of backup.page.assets) engine.assets.add(asset.src, asset.id);
    engine.replaceAll(backup.page.elements);
    showToast(t().toasts.copyOpened);
    return;
  }
  // A whole diary: ask whether it replaces this one or merges with it (OpenCopyDialog).
  useUI.getState().setPendingCopy(backup.diary);
}

/** Now, for file names: YYYY-MM-DD-HHMMSS (local time). */
function moment(date = new Date()): string {
  const two = (n: number) => String(n).padStart(2, '0');
  const day = `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
  return `${day}-${two(date.getHours())}${two(date.getMinutes())}${two(date.getSeconds())}`;
}

/**
 * Keeps a copy of the whole diary before it is replaced: in the backups folder (desktop)
 * or downloaded (web). Returns where, to tell the user; throws if it couldn't be kept.
 */
export async function keepCopyOfDiary(diary: Diary): Promise<string> {
  const texts = t().openCopy;
  const text = serializeDiary(await diary.dump());
  const contents = sealCopy(text) ?? text;
  if (isDesktop()) {
    return call<string>('write_copy_before_opening', { moment: moment(), contents });
  }
  const name = `diaryo-${texts.fileLabel}-${moment()}${FILE_EXTENSION}`;
  downloadBlob(new Blob([contents], { type: 'application/json' }), name);
  return texts.downloads;
}

/**
 * Replaces the diary with a backup. First the current one is kept: in the backups folder
 * (desktop) or downloaded (web). If that can't be done, nothing is replaced.
 */
export async function replaceWithCopy(diary: Diary, copy: DiaryDump) {
  const { showToast } = useUI.getState();
  const texts = t().openCopy;
  let where: string;
  try {
    where = await keepCopyOfDiary(diary);
  } catch (error) {
    console.error("Couldn't back up the diary before replacing it", error);
    showToast(texts.beforeFailed);
    return;
  }
  await diary.replace(copy);
  showToast(texts.replaced(where));
}

/** Merges a backup with the diary: whatever is missing, and the most recent of each page. */
export async function mergeWithCopy(diary: Diary, copy: DiaryDump) {
  const { pages, desk } = await diary.merge(copy);
  useUI.getState().showToast(t().toasts.merged(pages, desk));
}

export async function exportPng(engine: Engine) {
  const blob = await engine.exportPng();
  if (!blob) {
    useUI.getState().showToast(t().toasts.emptyPage);
    return;
  }
  await saveFile(blob, datedName() + '.png');
}
