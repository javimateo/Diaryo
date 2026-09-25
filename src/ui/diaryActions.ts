import type { PaperStyle } from '../engine/book';
import { useUI } from '../store/ui';
import { pageName } from './LinkDialog';

/** Acciones del diario compartidas por los botones y los atajos (con sus avisos). */

export async function turnPage(direction: 1 | -1) {
  const { diary, showToast } = useUI.getState();
  if (!diary) return;
  const moved = await diary.turn(direction);
  if (!moved) {
    showToast(
      direction === 1 ? 'Es la última página · Alt+N para una nueva' : 'Es la primera página',
    );
  }
}

export function goToToday() {
  void useUI.getState().diary?.goToToday();
}

export function addPage() {
  void useUI.getState().diary?.addPage();
}

/** Marca la página como importante (sale su pestaña en el canto) o la desmarca. */
export function toggleBookmark(id?: string) {
  const { diary, diaryState, showToast } = useUI.getState();
  const page = id === undefined ? diaryState.current : diaryState.pages.find((p) => p.id === id);
  if (!diary || !page) return;
  const marking = !page.bookmark;
  void diary.setBookmark(page.id, marking ? diary.nextBookmarkColor() : null);
  showToast(marking ? 'Página marcada · tiene su pestaña en el canto' : 'Pestaña quitada');
}

/** Cambia el color de la pestaña al siguiente. */
export function cycleBookmarkColor(id: string, colors: string[]) {
  const { diary, diaryState } = useUI.getState();
  const page = diaryState.pages.find((p) => p.id === id) ?? diaryState.current;
  if (!diary || !page?.bookmark) return;
  const next = colors[(colors.indexOf(page.bookmark) + 1) % colors.length];
  void diary.setBookmark(page.id, next);
}

/** Abre la página de un enlace y ofrece volver a donde se estaba. */
export async function followLink(pageId: string) {
  const { diary, diaryState, showToast } = useUI.getState();
  if (!diary) return;
  const from = diaryState.current;
  const target = diaryState.pages.find((p) => p.id === pageId);
  if (!target) {
    showToast('Esa página ya no existe');
    return;
  }
  if (from?.id === pageId) {
    showToast('Ya estás en esa página');
    return;
  }
  await diary.goToPage(pageId);
  if (!from) return;
  showToast(`Estás en ${pageName(target)}`, {
    label: 'Volver',
    run: () => {
      // Si la página de la que se venía no se guardó (estaba vacía), se vuelve a su día.
      const saved = useUI.getState().diaryState.pages.some((p) => p.id === from.id);
      void (saved ? diary.goToPage(from.id) : diary.goToDay(from.date));
    },
  });
}

export async function deletePage(id: string) {
  const { diary, showToast } = useUI.getState();
  if (!diary) return;
  const stored = await diary.remove(id);
  if (!stored) return;
  showToast('Página borrada', { label: 'Deshacer', run: () => void diary.restore(stored) });
}

/** Hoja propia para la página abierta (null: vuelve a la de todo el diario). */
export function setPagePaper(paper: PaperStyle | null) {
  const { diary, diaryState } = useUI.getState();
  const page = diaryState.current;
  if (diary && page) void diary.setPaper(page.id, paper);
}
