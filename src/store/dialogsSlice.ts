import type { DiaryDump } from '../storage/db';
import type { SealedBackup } from '../storage/files';
import type { Slice } from './ui';

/** The windows over the diary: settings, help, the tour, the dialogs, the palette, notices. */

/** What the account dialog shows: sign in, sign up, ask for a reset link or set the new password. */
export type AccountView = 'signIn' | 'signUp' | 'forgot' | 'reset';

export interface AccountDialogRequest {
  view: AccountView;
  /** The token of the email's link (to set the new password). */
  token?: string;
  /** Opened from the settings: closing it goes back to them. */
  fromSettings?: boolean;
}

/**
 * What the cloud diary's dialog does: set up the diary password, unlock this device,
 * recover with the recovery code, change the password or make a new recovery code.
 */
export type VaultView = 'create' | 'unlock' | 'recover' | 'change' | 'newCode';

export interface VaultDialogRequest {
  view: VaultView;
  fromSettings?: boolean;
  /** Unlock for one sync only, without keeping the keys (the "with password" mode). */
  once?: boolean;
}
/**
 * What the dialog of the diary password on the device does: set it for the private notes
 * or the whole diary, lower that (to only the private notes, or nothing), show the
 * private notes, or (without an account) change the password or make a new code.
 */
export type LockView =
  'private' | 'all' | 'down' | 'off' | 'reveal' | 'delete' | 'change' | 'newCode';

export interface LockDialogRequest {
  view: LockView;
  /** The private notes to show (their ids), or all of them. */
  notes?: readonly string[] | 'all';
  /** What to do once it is done (marking the selected notes as private). */
  then?: () => void;
  /** Opened from the settings, which come back when it closes. */
  fromSettings?: boolean;
}

/** With the diary encrypted: saving a copy (encrypted or readable) or opening an encrypted one. */
export type CopyPrivacy = { kind: 'save' } | { kind: 'open'; backup: SealedBackup };

/** The pages of the settings window. */
export type SettingsSection =
  'general' | 'look' | 'desktop' | 'privacy' | 'account' | 'data' | 'help';
export const SETTINGS_SECTIONS: SettingsSection[] = [
  'general',
  'look',
  'desktop',
  'privacy',
  'account',
  'data',
  'help',
];

export type HelpTab = 'howTo' | 'shortcuts';

export interface ToastAction {
  label: string;
  run: () => void;
}

interface Toast {
  message: string;
  action?: ToastAction;
  visible: boolean;
}

const TOAST_DURATION = 1800;
/** Toasts with a button (e.g. "Undo") last longer to leave time to press it. */
const ACTION_TOAST_DURATION = 6000;
let toastTimer: ReturnType<typeof setTimeout> | undefined;

export interface DialogsSlice {
  settingsOpen: boolean;
  /** The settings page shown (the last one seen, while the app is open). */
  settingsSection: SettingsSection;
  /** Opened on a given page: on a phone it shows that page instead of the list. */
  settingsDirect: boolean;
  helpOpen: boolean;
  /** The Help window's tab (the last one seen). */
  helpTab: HelpTab;
  /** The welcome window of a new diary, before the tour. */
  welcomeOpen: boolean;
  /** The step of the tour being shown (null: no tour). */
  tour: number | null;
  /** Dialog to choose the page to link the selection to. */
  linkDialogOpen: boolean;
  /** A whole-diary backup being opened: it asks whether to replace or merge. */
  pendingCopy: DiaryDump | null;
  /** Signing in or creating the cloud account. */
  accountDialog: AccountDialogRequest | null;
  /** The diary password and the recovery code of the cloud diary. */
  vaultDialog: VaultDialogRequest | null;
  /** Opened from the settings, which come back when it closes. */
  lockDialog: LockDialogRequest | null;
  copyPrivacy: CopyPrivacy | null;
  /** Command palette and search (Ctrl+K). */
  paletteOpen: boolean;
  toast: Toast | null;
  /** Opens or closes the settings; with a page, opens on it. */
  setSettingsOpen: (open: boolean, section?: SettingsSection) => void;
  setSettingsSection: (section: SettingsSection) => void;
  /** Opens or closes Help, on a tab or on the last one seen. */
  setHelpOpen: (open: boolean, tab?: HelpTab) => void;
  setWelcomeOpen: (open: boolean) => void;
  setTour: (step: number | null) => void;
  setLinkDialogOpen: (open: boolean) => void;
  setPendingCopy: (copy: DiaryDump | null) => void;
  setAccountDialog: (request: AccountDialogRequest | null) => void;
  setVaultDialog: (request: VaultDialogRequest | null) => void;
  setLockDialog: (request: LockDialogRequest | null) => void;
  setCopyPrivacy: (copy: CopyPrivacy | null) => void;
  setPaletteOpen: (open: boolean) => void;
  showToast: (message: string, action?: ToastAction) => void;
  hideToast: () => void;
}

export const dialogsSlice: Slice<DialogsSlice> = (set, get) => ({
  settingsOpen: false,
  settingsSection: 'general',
  settingsDirect: false,
  helpOpen: false,
  helpTab: 'howTo',
  welcomeOpen: false,
  tour: null,
  linkDialogOpen: false,
  pendingCopy: null,
  accountDialog: null,
  vaultDialog: null,
  lockDialog: null,
  copyPrivacy: null,
  paletteOpen: false,
  toast: null,
  setSettingsOpen: (settingsOpen, section) =>
    set((state) => ({
      settingsOpen,
      settingsSection: section ?? state.settingsSection,
      settingsDirect: Boolean(section),
      contextMenu: null,
    })),
  setSettingsSection: (settingsSection) => set({ settingsSection }),
  setHelpOpen: (helpOpen, tab) => set(tab ? { helpOpen, helpTab: tab } : { helpOpen }),
  setWelcomeOpen: (welcomeOpen) => set({ welcomeOpen }),
  setTour: (tour) => set({ tour }),
  setLinkDialogOpen: (linkDialogOpen) => set({ linkDialogOpen }),
  setPendingCopy: (pendingCopy) => set({ pendingCopy }),
  setAccountDialog: (accountDialog) =>
    set((state) => ({
      accountDialog,
      // The settings make room for it, and come back when it closes.
      settingsOpen: accountDialog
        ? false
        : state.settingsOpen || Boolean(state.accountDialog?.fromSettings),
    })),
  setVaultDialog: (vaultDialog) =>
    set((state) => ({
      vaultDialog,
      settingsOpen: vaultDialog
        ? false
        : state.settingsOpen || Boolean(state.vaultDialog?.fromSettings),
    })),
  setLockDialog: (lockDialog) =>
    set((state) => ({
      lockDialog,
      settingsOpen: lockDialog
        ? false
        : state.settingsOpen || Boolean(state.lockDialog?.fromSettings),
    })),
  setCopyPrivacy: (copyPrivacy) => set({ copyPrivacy }),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen, contextMenu: null }),
  showToast: (message, action) => {
    clearTimeout(toastTimer);
    set({ toast: { message, action, visible: true } });
    toastTimer = setTimeout(get().hideToast, action ? ACTION_TOAST_DURATION : TOAST_DURATION);
  },
  hideToast: () => {
    clearTimeout(toastTimer);
    const toast = get().toast;
    if (toast?.visible) set({ toast: { ...toast, visible: false } });
  },
});
