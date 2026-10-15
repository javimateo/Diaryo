import type { DesktopBridge } from '../desktop/bridge';
import type { DesktopInfo } from '../desktop/settings';
import type { Slice } from './ui';

/** The desktop app: what its side tells, and the connection with it (null on the web). */

export interface DesktopSlice {
  /** Desktop app: mode, shortcut, backups… (null on the web). */
  desktop: DesktopInfo | null;
  /** The connection with the desktop side (null on the web). */
  desktopBridge: DesktopBridge | null;
  setDesktop: (patch: Partial<DesktopInfo>) => void;
  setDesktopBridge: (bridge: DesktopBridge | null) => void;
}

export const desktopSlice: Slice<DesktopSlice> = (set, get) => ({
  desktop: null,
  desktopBridge: null,
  setDesktop: (patch) => {
    const desktop = get().desktop;
    set({ desktop: desktop ? { ...desktop, ...patch } : (patch as DesktopInfo) });
  },
  setDesktopBridge: (desktopBridge) => set({ desktopBridge }),
});
