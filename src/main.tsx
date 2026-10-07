import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './fonts';
import './styles/global.css';
import { App } from './App';
import { startLock } from './cloud/lock';
import { useLock } from './cloud/lockState';
import { DeskLayer } from './ui/desktop/DeskLayer';
import { LockScreen } from './ui/LockScreen';

// In the desktop app, the desk on the Windows desktop is another window.
const deskLayer = new URLSearchParams(location.search).get('capa') === 'mesa';

// Before anything reads the diary: whether it is encrypted on this device.
startLock();

/**
 * The diary encrypted here and locked: nothing of it loads until it is opened. The desk
 * on the desktop shows nothing meanwhile (the diary's window passes it the key).
 */
function Root() {
  const locked = useLock((s) => s.status === 'locked');
  if (deskLayer) return locked ? null : <DeskLayer />;
  return locked ? <LockScreen /> : <App />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
