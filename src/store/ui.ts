import { create, type StateCreator } from 'zustand';
import { canvasSlice, type CanvasSlice } from './canvasSlice';
import { desktopSlice, type DesktopSlice } from './desktopSlice';
import { diarySlice, type DiarySlice } from './diarySlice';
import { dialogsSlice, type DialogsSlice } from './dialogsSlice';
import { lookSlice, systemDark, type LookSlice } from './lookSlice';

/**
 * The interface's state: one store, written in parts by subject (each file in this folder).
 * A part can read and change the others' (opening the palette closes the context menu).
 */
export type UIState = CanvasSlice & LookSlice & DiarySlice & DialogsSlice & DesktopSlice;

/** How each part is written. */
export type Slice<T> = StateCreator<UIState, [], [], T>;

export const useUI = create<UIState>()((...store) => ({
  ...canvasSlice(...store),
  ...lookSlice(...store),
  ...diarySlice(...store),
  ...dialogsSlice(...store),
  ...desktopSlice(...store),
}));

// With the system theme, the app changes as soon as the system does.
systemDark.addEventListener('change', () => {
  const { themePreference, setThemePreference } = useUI.getState();
  if (themePreference === 'system') setThemePreference('system');
});

// What the rest of the app imports from here.
export {
  DEFAULT_SETTINGS,
  REMIND_BEFORE,
  SETTINGS_KEY,
  THEME_KEY,
  loadThemePreference,
  type AutoLock,
  type HidePrivate,
  type RemindBefore,
  type Settings,
  type SyncMode,
  type Theme,
  type ThemePreference,
} from './lookSlice';
export { type DiaryTab } from './diarySlice';
export {
  SETTINGS_SECTIONS,
  type AccountDialogRequest,
  type AccountView,
  type CopyPrivacy,
  type HelpTab,
  type LockDialogRequest,
  type LockView,
  type SettingsSection,
  type ToastAction,
  type VaultDialogRequest,
  type VaultView,
} from './dialogsSlice';
