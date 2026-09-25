import { X } from 'lucide-react';
import { shortcutKeys } from '../desktop/desktop';
import { useUI } from '../store/ui';
import { TOOLS } from './toolDefs';

const NAVIGATION: [string, string[][]][] = [
  ['Mover el lienzo', [['Espacio', 'arrastrar'], ['Botón central']]],
  ['Desplazar', [['Rueda']]],
  ['Desplazar en horizontal', [['Shift', 'rueda']]],
  ['Zoom', [['Ctrl', 'rueda']]],
  [
    'Acercar / alejar',
    [
      ['Ctrl', '+'],
      ['Ctrl', '−'],
    ],
  ],
  ['Volver al 100 %', [['Ctrl', '0']]],
  ['Ver todo', [['Shift', '1']]],
];

const SELECTION: [string, string[][]][] = [
  ['Rodear con el lazo (desde V)', [['Alt', 'arrastrar']]],
  ['Añadir / quitar de la selección', [['Shift', 'clic']]],
  ['Seleccionar todo', [['Ctrl', 'A']]],
  [
    'Copiar / cortar / pegar',
    [
      ['Ctrl', 'C'],
      ['Ctrl', 'X'],
      ['Ctrl', 'V'],
    ],
  ],
  ['Duplicar', [['Ctrl', 'D']]],
  ['Borrar', [['Supr']]],
  ['Mover poco a poco', [['Flechas'], ['Shift', 'flechas']]],
  ['Escalar sin mantener proporción', [['Shift', 'esquina']]],
  ['Escalar desde el centro', [['Alt', 'asa']]],
  ['Girar de 15 en 15°', [['Shift', 'girar']]],
  [
    'Agrupar / desagrupar',
    [
      ['Ctrl', 'G'],
      ['Ctrl', 'Shift', 'G'],
    ],
  ],
  [
    'Traer adelante / enviar atrás',
    [
      ['Ctrl', '↑'],
      ['Ctrl', '↓'],
    ],
  ],
  [
    'Al frente / al fondo',
    [
      ['Ctrl', 'Shift', '↑'],
      ['Ctrl', 'Shift', '↓'],
    ],
  ],
  [
    'Voltear',
    [
      ['Shift', 'H'],
      ['Shift', 'V'],
    ],
  ],
  ['Bloquear / desbloquear', [['Ctrl', 'Shift', 'L']]],
  [
    'Copiar / pegar estilos',
    [
      ['Ctrl', 'Alt', 'C'],
      ['Ctrl', 'Alt', 'V'],
    ],
  ],
  ['Copiar como imagen', [['Shift', 'Alt', 'C']]],
  ['Más opciones', [['Clic derecho']]],
  ['Deseleccionar', [['Esc']]],
];

const WRITING: [string, string[][]][] = [
  ['Escribir en cualquier sitio', [['Doble clic']]],
  ['Editar el texto o la nota seleccionados', [['Enter']]],
  ['Terminar de escribir', [['Esc'], ['Ctrl', 'Enter']]],
  ['Caja de texto de un ancho', [['T', 'arrastrar']]],
  [
    'Lista (sigue sola con Enter)',
    [
      ['-', 'espacio'],
      ['1.', 'espacio'],
    ],
  ],
  ['Sangría / quitarla', [['Tab'], ['Shift', 'Tab']]],
  ['Pegar imágenes o texto', [['Ctrl', 'V']]],
  ['Añadir imágenes', [['Arrastrar archivos']]],
  ['Escribir dentro de una figura', [['Doble clic'], ['Enter']]],
  ['Figura cuadrada o circular', [['Shift', 'arrastrar']]],
  ['Figura desde el centro', [['Alt', 'arrastrar']]],
  ['Conectar dos cosas con una flecha', [['A', 'de una a otra']]],
  ['Curvar una flecha', [['Arrastrar su centro']]],
];

const DIARY: [string, string[][]][] = [
  [
    'Pasar página',
    [
      ['Ctrl', '←'],
      ['Ctrl', '→'],
    ],
  ],
  ['Página anterior / siguiente', [['RePág'], ['AvPág']]],
  ['Ir a hoy', [['Ctrl', 'Inicio']]],
  ['Nueva página', [['Alt', 'N']]],
  ['Marcar como importante (pestaña)', [['Alt', 'M']]],
  ['Enlazar con otra página', [['Clic derecho'], ['Panel']]],
  ['Índice y calendario', [['Ctrl', 'B']]],
  ['Mapa del diario', [['Shift', 'M']]],
];

const GENERAL: [string, string[][]][] = [
  [
    'Buscar en el diario y comandos',
    [
      ['Ctrl', 'K'],
      ['Ctrl', 'F'],
    ],
  ],
  ['Grosor o tamaño de letra', [['+'], ['−']]],
  ['Deshacer', [['Ctrl', 'Z']]],
  [
    'Rehacer',
    [
      ['Ctrl', 'Shift', 'Z'],
      ['Ctrl', 'Y'],
    ],
  ],
  ['Mostrar atajos', [['?']]],
  ['Ajustes', [['Ctrl', ',']]],
  ['Cambiar tema claro / oscuro', [['Alt', 'Shift', 'D']]],
];

export function HelpDialog() {
  const open = useUI((s) => s.helpOpen);
  const setOpen = useUI((s) => s.setHelpOpen);
  const desktop = useUI((s) => s.desktop);
  if (!open) return null;
  // En la app de escritorio, también el diario flotante.
  const general: [string, string[][]][] = desktop
    ? [
        ...GENERAL,
        ['Diario flotante (desde cualquier sitio)', [shortcutKeys(desktop.shortcut)]],
        ['Apartar el diario flotante', [['Esc']]],
        ['Enseñar o esconder la mesa en el escritorio', [shortcutKeys(desktop.deskShortcut)]],
      ]
    : GENERAL;

  return (
    <div className="dialog-backdrop" onClick={() => setOpen(false)}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="dialog-header">
          <h2 id="help-title">Atajos de teclado</h2>
          <button
            type="button"
            className="icon-btn"
            aria-label="Cerrar"
            onClick={() => setOpen(false)}
          >
            <X size={18} strokeWidth={1.75} />
          </button>
        </header>
        <div className="dialog-body" data-scrollable>
          <section>
            <h3>Herramientas</h3>
            <ul className="shortcut-list">
              {TOOLS.map((t) => (
                <li key={t.id} data-soon={!t.ready || undefined}>
                  <span>
                    {t.label}
                    {!t.ready && <em> · pronto</em>}
                  </span>
                  <Combos
                    combos={t.digit ? [[t.key.toUpperCase()], [t.digit]] : [[t.key.toUpperCase()]]}
                  />
                </li>
              ))}
            </ul>
            <h3>Escribir</h3>
            <ShortcutList items={WRITING} />
            <h3>Navegación</h3>
            <ShortcutList items={NAVIGATION} />
            <h3>Diario</h3>
            <ShortcutList items={DIARY} />
          </section>
          <section>
            <h3>Selección</h3>
            <ShortcutList items={SELECTION} />
            <h3>General</h3>
            <ShortcutList items={general} />
          </section>
        </div>
      </div>
    </div>
  );
}

function ShortcutList({ items }: { items: [string, string[][]][] }) {
  return (
    <ul className="shortcut-list">
      {items.map(([label, combos]) => (
        <li key={label}>
          <span>{label}</span>
          <Combos combos={combos} />
        </li>
      ))}
    </ul>
  );
}

function Combos({ combos }: { combos: string[][] }) {
  return (
    <span className="combos">
      {combos.map((combo, i) => (
        <span key={i} className="combo">
          {i > 0 && <span className="combo-or">o</span>}
          {combo.map((k) => (
            <kbd key={k}>{k}</kbd>
          ))}
        </span>
      ))}
    </span>
  );
}
