import type { PaperStyle } from '../engine/book';
import { coverTemplate, type CoverTemplate } from '../engine/coverTemplates';
import { useUI } from '../store/ui';
import { pageName } from './LinkDialog';
import { t } from '../i18n';
import { getDB, privateNoteIds } from '../storage/db';
import { askToDelete } from './privateActions';

/** Diary actions shared by the buttons and the shortcuts (with their toasts). */

export async function turnPage(direction: 1 | -1) {
  const { diary, showToast } = useUI.getState();
  if (!diary) return;
  const moved = await diary.turn(direction);
  if (!moved) {
    showToast(direction === 1 ? t().toasts.lastPage : t().toasts.firstPage);
  }
}

export function goToToday() {
  void useUI.getState().diary?.goToToday();
}

export function addPage() {
  void useUI.getState().diary?.addPage();
}

/** Starts the cover from a template (it opens to change it; it can be undone). */
export async function startCover(template: CoverTemplate) {
  const { diary, showToast, setSettingsOpen } = useUI.getState();
  if (!diary) return;
  const texts = t();
  setSettingsOpen(false);
  await diary.startCover(
    coverTemplate(template, texts.cover.templateTexts, new Date().getFullYear()),
  );
  showToast(texts.cover.started(texts.cover.templates[template]), {
    label: texts.commands.undo,
    run: () => useUI.getState().engine?.undo(),
  });
}

/** Marks the page as important (its tab shows on the edge) or unmarks it. */
export function toggleBookmark(id?: string) {
  const { diary, diaryState, showToast } = useUI.getState();
  const page = id === undefined ? diaryState.current : diaryState.pages.find((p) => p.id === id);
  if (!diary || !page) return;
  const marking = !page.bookmark;
  void diary.setBookmark(page.id, marking ? diary.nextBookmarkColor() : null);
  showToast(marking ? t().toasts.bookmarked : t().toasts.bookmarkRemoved);
}

/** Changes the tab color to the next one. */
export function cycleBookmarkColor(id: string, colors: string[]) {
  const { diary, diaryState } = useUI.getState();
  const page = diaryState.pages.find((p) => p.id === id) ?? diaryState.current;
  if (!diary || !page?.bookmark) return;
  const next = colors[(colors.indexOf(page.bookmark) + 1) % colors.length];
  void diary.setBookmark(page.id, next);
}

/** Opens a link's page and offers to go back to where you were. */
export async function followLink(pageId: string) {
  const { diary, diaryState, showToast } = useUI.getState();
  if (!diary) return;
  const from = diaryState.current;
  const target = diaryState.pages.find((p) => p.id === pageId);
  if (!target) {
    showToast(t().toasts.pageGone);
    return;
  }
  if (from?.id === pageId) {
    showToast(t().toasts.alreadyThere);
    return;
  }
  await diary.goToPage(pageId);
  if (!from) return;
  showToast(t().toasts.youAreIn(pageName(target)), {
    label: t().toasts.back,
    run: () => {
      // If the page you came from wasn't saved (it was empty), go back to its day.
      const saved = useUI.getState().diaryState.pages.some((p) => p.id === from.id);
      void (saved ? diary.goToPage(from.id) : diary.goToDay(from.date));
    },
  });
}

export async function deletePage(id: string) {
  const { diary } = useUI.getState();
  if (!diary) return;
  // Private notes don't go without the diary password.
  await diary.flush();
  const notes = await privateNoteIds(getDB(), id);
  if (notes.length > 0) askToDelete(notes, () => void removePage(id));
  else await removePage(id);
}

async function removePage(id: string) {
  const { diary, showToast } = useUI.getState();
  if (!diary) return;
  const stored = await diary.remove(id);
  if (!stored) return;
  showToast(t().toasts.pageDeleted, {
    label: t().toasts.undo,
    run: () => void diary.restore(stored),
  });
}

/** Own paper for the open page (null: back to the whole diary's). */
export function setPagePaper(paper: PaperStyle | null) {
  const { diary, diaryState } = useUI.getState();
  const page = diaryState.current;
  if (diary && page) void diary.setPaper(page.id, paper);
}
