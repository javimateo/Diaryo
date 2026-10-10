import { StrictMode, useCallback, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import './fonts';
import './styles/global.css';
import { App } from './App';
import { lockInPlace, startLock } from './cloud/lock';
import { useLock } from './cloud/lockState';
import { call, isDesktop } from './desktop/tauri';
import { DeskLayer } from './ui/desktop/DeskLayer';
import { MiniDiary } from './ui/desktop/MiniDiary';
import { LockScreen } from './ui/LockScreen';

// In the desktop app, the desk on the Windows desktop is another window. It is
// transparent from the start, also while it shows nothing.
const deskLayer = new URLSearchParams(location.search).get('capa') === 'mesa';
if (deskLayer) document.documentElement.toggleAttribute('data-desk-layer', true);

// Before anything reads the diary: whether it is encrypted on this device. The desk locks
// without starting again.
startLock();
if (deskLayer) lockInPlace();

/**
 * The diary encrypted here and locked: nothing of it loads until it is opened. The desk
 * on the desktop still shows (it is kept out of the encryption), unless the settings
 * say it waits too (the diary's window passes it the key).
 */
function Root() {
  const locked = useLock((s) => s.status === 'locked');
  const deskWaits = useLock((s) => s.status === 'locked' && s.deskSealed);
  if (deskLayer) return deskWaits ? <DeskWaiting /> : <DeskLayer />;
  return locked ? <LockScreen /> : <App />;
}

/**
 * The desk waits for the password: none of it shows. The mini diary does, with the cover
 * (its picture is never encrypted), unless the settings hide it; only it takes clicks
 * from the desktop.
 */
function DeskWaiting() {
  const mini = useRef<HTMLDivElement>(null);
  const sendAreas = useCallback(() => {
    if (!isDesktop()) return;
    const box = mini.current?.getBoundingClientRect();
    const areas = box ? [{ x: box.x, y: box.y, width: box.width, height: box.height }] : [];
    void call('set_desk_areas', { areas });
  }, []);
  useEffect(sendAreas, [sendAreas]);
  return <MiniDiary ref={mini} onChange={sendAreas} desktop={isDesktop()} />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
