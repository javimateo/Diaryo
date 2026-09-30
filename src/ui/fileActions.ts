import { call, isDesktop } from '../desktop/tauri';
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

/** Downloads a backup of the whole diary, with images and fonts. */
export async function saveCopy(diary: Diary) {
  const dump = await diary.dump();
  downloadBlob(
    new Blob([serializeDiary(dump)], { type: 'application/json' }),
    datedName() + FILE_EXTENSION,
  );
}

/**
 * Opens a backup. A single-page one replaces the open page and can be undone. For a
 * whole-diary one the user chooses: replace this diary with it, or merge the two.
 */
export async function openCopy(engine: Engine, file: File) {
  const { showToast } = useUI.getState();
  const backup = parseBackup(await file.text());
  if (!backup) {
    showToast(t().toasts.notABackup);
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
 * Replaces the diary with a backup. First the current one is kept: in the backups folder
 * (desktop) or downloaded (web). If that can't be done, nothing is replaced.
 */
export async function replaceWithCopy(diary: Diary, copy: DiaryDump) {
  const { showToast } = useUI.getState();
  const texts = t().openCopy;
  const contents = serializeDiary(await diary.dump());
  let where: string;
  try {
    if (isDesktop()) {
      where = await call<string>('write_copy_before_opening', { moment: moment(), contents });
    } else {
      const name = `diaryo-${texts.fileLabel}-${moment()}${FILE_EXTENSION}`;
      downloadBlob(new Blob([contents], { type: 'application/json' }), name);
      where = texts.downloads;
    }
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
  downloadBlob(blob, datedName() + '.png');
}
