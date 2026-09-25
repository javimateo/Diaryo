import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
// Fuentes libres incluidas para el texto (se descargan solo cuando se usan).
import '@fontsource-variable/nunito';
import '@fontsource-variable/caveat';
import '@fontsource/patrick-hand';
import '@fontsource/comic-neue';
import '@fontsource-variable/lora';
import '@fontsource-variable/jetbrains-mono';
import '@fontsource/lilita-one';
import './styles/global.css';
import { App } from './App';
import { DeskLayer } from './desktop/DeskLayer';

// En la app de escritorio, la mesa sobre el escritorio de Windows es otra ventana.
const deskLayer = new URLSearchParams(location.search).get('capa') === 'mesa';

createRoot(document.getElementById('root')!).render(
  <StrictMode>{deskLayer ? <DeskLayer /> : <App />}</StrictMode>,
);
