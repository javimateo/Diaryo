import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './fonts';
import './styles/global.css';
import { App } from './App';
import { DeskLayer } from './ui/desktop/DeskLayer';

// In the desktop app, the desk on the Windows desktop is another window.
const deskLayer = new URLSearchParams(location.search).get('capa') === 'mesa';

createRoot(document.getElementById('root')!).render(
  <StrictMode>{deskLayer ? <DeskLayer /> : <App />}</StrictMode>,
);
