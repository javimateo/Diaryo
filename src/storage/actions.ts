import type { Diary } from '../diary/diary';
import type { Engine } from '../engine/engine';
import { fonts } from '../engine/fonts';
import { useUI } from '../store/ui';
import { DiaryoDB } from './db';
import { datedName, downloadBlob, FILE_EXTENSION, parseBackup, serializeDiary } from './files';

/** Una sola base de datos para toda la app. */
let instance: DiaryoDB | null = null;
export const getDB = () => (instance ??= new DiaryoDB());

/** Descarga una copia de todo el diario, con imágenes y fuentes. */
export async function saveCopy(diary: Diary) {
  const dump = await diary.dump();
  downloadBlob(
    new Blob([serializeDiary(dump)], { type: 'application/json' }),
    datedName() + FILE_EXTENSION,
  );
}

/**
 * Abre una copia. La de todo el diario se mezcla con lo que hay (entra cada página que
 * falte o sea más nueva, así que no se pierde nada reciente). La de una sola página
 * sustituye la página abierta y se puede deshacer.
 */
export async function openCopy(engine: Engine, diary: Diary, file: File) {
  const { showToast } = useUI.getState();
  const backup = parseBackup(await file.text());
  if (!backup) {
    showToast('Ese archivo no es una copia de diaryo');
    return;
  }
  const data = backup.kind === 'page' ? backup.page : backup.diary;
  for (const font of data.fonts) {
    await fonts.addCustom(font.name, font.src, font.id).catch(() => undefined);
  }
  if (backup.kind === 'page') {
    for (const asset of backup.page.assets) engine.assets.add(asset.src, asset.id);
    engine.replaceAll(backup.page.elements);
    showToast('Copia abierta · Ctrl+Z para volver atrás');
    return;
  }
  const { pages, desk } = await diary.merge(backup.diary);
  const parts = [
    pages === 1 ? '1 página' : pages > 1 ? `${pages} páginas` : '',
    desk ? 'lo de la mesa' : '',
  ].filter(Boolean);
  showToast(
    parts.length === 0
      ? 'Ya tenías todo lo de esa copia'
      : `Se ha${pages > 1 ? 'n' : ''} recuperado ${parts.join(' y ')}`,
  );
}

export async function exportPng(engine: Engine) {
  const blob = await engine.exportPng();
  if (!blob) {
    useUI.getState().showToast('La página está vacía');
    return;
  }
  downloadBlob(blob, datedName() + '.png');
}
