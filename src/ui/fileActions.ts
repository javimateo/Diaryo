import type { Diary } from '../diary/diary';
import type { Engine } from '../engine/engine';
import { fonts } from '../engine/fonts';
import { useUI } from '../store/ui';
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
 * Opens a backup. A whole-diary one is merged with what is here (each page that is
 * missing or newer goes in, so nothing recent is lost). A single-page one replaces the
 * open page and can be undone.
 */
export async function openCopy(engine: Engine, diary: Diary, file: File) {
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
  const { pages, desk } = await diary.merge(backup.diary);
  showToast(t().toasts.merged(pages, desk));
}

export async function exportPng(engine: Engine) {
  const blob = await engine.exportPng();
  if (!blob) {
    useUI.getState().showToast(t().toasts.emptyPage);
    return;
  }
  downloadBlob(blob, datedName() + '.png');
}
