import { beforeEach, describe, expect, it, vi } from 'vitest';
import '../lib/testBrowser';

import { useLock } from '../cloud/lockState';
import type { DesktopInfo } from '../desktop/settings';
import type { Engine } from '../engine/engine';
import type { PageMeta } from '../diary/pages';
import { useUI } from '../store/ui';
import { getCommands } from './commands';

/** An engine for the palette: an empty scene, and every action noted. */
const engine = new Proxy({ scene: { all: () => [] } } as Record<string, unknown>, {
  get: (target, name: string) => (name in target ? target[name] : (target[name] = vi.fn())),
}) as unknown as Engine;

const page = (id: string): PageMeta => ({
  id,
  date: '2026-10-15',
  order: 1,
  title: '',
  thumbnail: null,
  bookmark: null,
  updatedAt: 1,
});

const ids = () => getCommands().map((command) => command.id);

/** The selection, over what the store has by default. */
const select = (doc: Partial<ReturnType<typeof useUI.getState>['doc']>) =>
  useUI.setState({ doc: { ...useUI.getState().doc, ...doc } });

const desktop = (more: Partial<DesktopInfo> = {}) =>
  useUI.setState({
    desktop: {
      mode: 'window',
      shortcut: 'Ctrl+Alt+D',
      shortcutOk: true,
      autostart: true,
      backups: true,
      backupDir: '',
      deskLayer: true,
      deskShortcut: 'Ctrl+Alt+N',
      deskShortcutOk: true,
      ...more,
    } as DesktopInfo,
  });

const initial = useUI.getState();
beforeEach(() => {
  useUI.setState({
    engine,
    diary: null,
    desktop: null,
    doc: initial.doc,
    diaryState: { ...initial.diaryState, current: page('p1'), pages: [page('p1')] },
  });
  useLock.setState({ status: 'off', level: 'off', revealed: false });
});

describe('the command palette', () => {
  it('offers nothing until the canvas is there', () => {
    useUI.setState({ engine: null });
    expect(getCommands()).toEqual([]);
  });

  it('every command has its own id, a name and a group, whatever is selected', () => {
    select({ selectionCount: 2, selectionHasLink: true, selectionPrivate: false, hasLocked: true });
    desktop();
    const commands = getCommands();
    expect(new Set(commands.map((c) => c.id)).size).toBe(commands.length);
    for (const command of commands) {
      expect(command.label).toBeTruthy();
      expect(command.group).toBeTruthy();
    }
  });

  it("a page's own commands only for a page that is saved", () => {
    expect(ids()).toContain('delete-page');
    useUI.setState({ diaryState: { ...useUI.getState().diaryState, pages: [] } });
    expect(ids()).not.toContain('delete-page');
  });

  it('what acts on the selection only with something selected', () => {
    expect(ids()).not.toContain('duplicate');
    expect(ids()).not.toContain('group');
    select({ selectionCount: 1 });
    expect(ids()).toContain('duplicate');
    expect(ids()).not.toContain('group');
    expect(ids()).not.toContain('unlink');
    select({ selectionCount: 2, selectionHasLink: true });
    expect(ids()).toContain('group');
    expect(ids()).toContain('unlink');
  });

  it('marking a note private only when the selection has notes', () => {
    select({ selectionCount: 1, selectionPrivate: null });
    expect(ids()).not.toContain('private');
    select({ selectionPrivate: false });
    expect(ids()).toContain('private');
  });

  it('locking and the private notes only with a diary password here', () => {
    expect(ids()).not.toContain('lock-diary');
    expect(ids()).not.toContain('show-private');
    useLock.setState({ status: 'unlocked', level: 'all' });
    expect(ids()).toContain('lock-diary');
    expect(ids()).toContain('show-private');
    useLock.setState({ revealed: true });
    expect(ids()).toContain('hide-private');
    expect(ids()).not.toContain('show-private');
  });

  it("the desktop app's commands only in it, as its mode and settings say", () => {
    expect(ids()).not.toContain('hide');
    desktop({ mode: 'window', backups: false });
    expect(ids()).toEqual(expect.arrayContaining(['widget', 'hide']));
    expect(ids()).not.toContain('backup-now');
    desktop({ mode: 'widget', backups: true });
    const hide = getCommands().find((c) => c.id === 'hide');
    expect(hide?.keys).toEqual(['Esc']);
    expect(ids()).toEqual(expect.arrayContaining(['window', 'backup-now']));
    expect(ids()).not.toContain('widget');
  });
});
