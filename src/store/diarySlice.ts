import type { AgendaItem } from '../diary/agenda';
import type { Diary, DiaryState } from '../diary/diary';
import { readText, writeText } from '../lib/saved';
import type { SaveStatus } from '../storage/autosave';
import type { Slice } from './ui';

/** The diary: its pages and saving, the index, "Próximo", the tasks and the map. */

/** Under the index's calendar: the pages or the tasks. */
export type DiaryTab = 'pages' | 'tasks';

/** The index's last tab. */
const DIARY_TAB_KEY = 'diaryo:diary-tab';

export interface DiarySlice {
  saveStatus: SaveStatus;
  diary: Diary | null;
  diaryState: DiaryState;
  /** Diary index (calendar and pages) open. */
  diaryOpen: boolean;
  /** The lines with a date in the whole diary (tasks and appointments). */
  agenda: AgendaItem[];
  /** What the index lists under the calendar: the pages or the tasks ("Próximo"). */
  diaryTab: DiaryTab;
  /** What is pending with a date ("Próximo"), opened from the top bar. */
  upcomingOpen: boolean;
  /** Map view: all the pages at a glance. */
  mapOpen: boolean;
  /** Where the book was on screen when the map opened (the sheet flies from there). */
  mapOrigin: { x: number; y: number; width: number; height: number } | null;
  setSaveStatus: (status: SaveStatus) => void;
  setDiary: (diary: Diary | null) => void;
  setDiaryState: (state: DiaryState) => void;
  setDiaryOpen: (open: boolean) => void;
  setDiaryTab: (tab: DiaryTab) => void;
  setAgenda: (agenda: AgendaItem[]) => void;
  setUpcomingOpen: (open: boolean) => void;
  setMapOpen: (open: boolean) => void;
}

export const diarySlice: Slice<DiarySlice> = (set, get) => ({
  saveStatus: 'loading',
  diary: null,
  diaryState: { pages: [], current: null },
  diaryOpen: false,
  agenda: [],
  diaryTab: readText(DIARY_TAB_KEY) === 'tasks' ? 'tasks' : 'pages',
  upcomingOpen: false,
  mapOpen: false,
  mapOrigin: null,
  setSaveStatus: (saveStatus) => set({ saveStatus }),
  setDiary: (diary) => set({ diary }),
  setDiaryState: (diaryState) => set({ diaryState }),
  setDiaryOpen: (diaryOpen) => {
    // When opening the index, the current page's thumbnail is brought up to date.
    if (diaryOpen) get().diary?.refreshThumbnail();
    // The index and "Próximo" share the right side: one at a time.
    set(diaryOpen ? { diaryOpen, upcomingOpen: false } : { diaryOpen });
  },
  setUpcomingOpen: (upcomingOpen) =>
    set(upcomingOpen ? { upcomingOpen, diaryOpen: false } : { upcomingOpen }),
  setDiaryTab: (diaryTab) => {
    writeText(DIARY_TAB_KEY, diaryTab);
    set({ diaryTab });
  },
  setAgenda: (agenda) => set({ agenda }),
  setMapOpen: (mapOpen) => {
    if (mapOpen === get().mapOpen) return;
    const { diary, engine } = get();
    // The open page's thumbnail, up to date; the map sheet flies from where the book is.
    if (mapOpen) diary?.refreshThumbnail();
    set({
      mapOpen,
      mapOrigin: mapOpen ? (engine?.bookScreenRect() ?? null) : null,
      diaryOpen: false,
    });
  },
});
