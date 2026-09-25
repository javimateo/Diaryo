import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
// Free fonts bundled for text (they are only downloaded when used).
import '@fontsource-variable/nunito';
import '@fontsource-variable/caveat';
import '@fontsource/patrick-hand';
import '@fontsource/comic-neue';
import '@fontsource-variable/lora';
import '@fontsource-variable/jetbrains-mono';
import '@fontsource/lilita-one';
import './styles/global.css';
import { App } from './App';
import { DeskLayer } from './ui/desktop/DeskLayer';

// In the desktop app, the desk on the Windows desktop is another window.
const deskLayer = new URLSearchParams(location.search).get('capa') === 'mesa';

createRoot(document.getElementById('root')!).render(
  <StrictMode>{deskLayer ? <DeskLayer /> : <App />}</StrictMode>,
);
