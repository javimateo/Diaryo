import { useUI } from './store/ui';
import { CanvasView } from './ui/CanvasView';
import { CommandPalette } from './ui/CommandPalette';
import { ContextMenu } from './ui/ContextMenu';
import { DiaryPanel } from './ui/DiaryPanel';
import { HelpDialog } from './ui/HelpDialog';
import { SettingsDialog } from './ui/SettingsDialog';
import { useDeskBackground } from './ui/useDeskBackground';
import { LinkDialog } from './ui/LinkDialog';
import { MapView } from './ui/MapView';
import { PageNav } from './ui/PageNav';
import { PropertiesPanel } from './ui/properties/PropertiesPanel';
import { TextEditor } from './ui/TextEditor';
import { Toast } from './ui/Toast';
import { Toolbar } from './ui/Toolbar';
import { Brand, TopActions } from './ui/TopBar';
import { useShortcuts } from './ui/useShortcuts';
import { ViewControls } from './ui/ViewControls';
import { WindowDragRegion } from './ui/desktop/WindowControls';
import { UndoControls, ZoomControls } from './ui/ZoomControls';

export function App() {
  useShortcuts();
  useDeskBackground();
  const isEmpty = useUI((s) => s.doc.isEmpty);
  const loaded = useUI((s) => s.saveStatus !== 'loading');

  return (
    <div className="app">
      <CanvasView />
      <WindowDragRegion />
      <TextEditor />
      <div className="layer top-left">
        <Brand />
      </div>
      <div className="layer top-center">
        <Toolbar />
      </div>
      <div className="layer side-left">
        <PropertiesPanel />
      </div>
      <div className="layer top-right">
        <TopActions />
      </div>
      <div className="layer side-right">
        <DiaryPanel />
      </div>
      <div className="layer bottom-left">
        <ZoomControls />
        <UndoControls />
        <ViewControls />
      </div>
      <div className="layer bottom-right">
        <PageNav />
      </div>
      <div className="layer bottom-center">
        {isEmpty && loaded && (
          <p className="hint">
            <kbd>P</kbd> para dibujar · <kbd>T</kbd> o doble clic para escribir · <kbd>Espacio</kbd>{' '}
            + arrastrar para moverte · <kbd>?</kbd> atajos
          </p>
        )}
        <Toast />
      </div>
      <ContextMenu />
      <HelpDialog />
      <MapView />
      <LinkDialog />
      <SettingsDialog />
      <CommandPalette />
    </div>
  );
}
