import {
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  TextAlignCenter,
  TextAlignEnd,
  TextAlignStart,
} from 'lucide-react';
import { type TextAlign, type VerticalAlign } from '../../engine/elements';
import { NOTE_VARIANT_LABELS, NOTE_VARIANTS } from '../../engine/notes';
import type { StylePatch } from '../../engine/restyle';
import { ColorRow, FontButton, Section, Segmented, SizeControls } from './controls';
import { LinkSection } from './LinkSection';
import { refocusEditor, usePanelModel } from './model';
import { FILL_STYLES, HEADS, ROUGHNESS, VARIANT_ICONS } from './options';

/**
 * Panel lateral de propiedades. Según el contexto cambia el estilo de la herramienta
 * activa (lápiz, marcador, texto, nota), del texto que se está escribiendo o de lo
 * seleccionado.
 */
export function PropertiesPanel() {
  const model = usePanelModel();
  if (!model) return null;
  const { noteVariant, colors, size, fillStyle, roughness, labelSize, heads } = model;
  const { font, align, valign, opacity, apply } = model;

  return (
    <aside
      className="props-panel floating"
      aria-label="Propiedades"
      data-keep-editing
      data-scrollable
    >
      {noteVariant !== undefined && (
        <Section title="Estilo de nota">
          <div className="variant-grid">
            {NOTE_VARIANTS.map((variant) => {
              const Icon = VARIANT_ICONS[variant];
              return (
                <button
                  key={variant}
                  type="button"
                  className="icon-btn"
                  data-active={noteVariant === variant || undefined}
                  aria-label={NOTE_VARIANT_LABELS[variant]}
                  aria-pressed={noteVariant === variant}
                  data-tip={NOTE_VARIANT_LABELS[variant]}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => apply({ noteVariant: variant })}
                >
                  <Icon size={17} strokeWidth={1.75} />
                </button>
              );
            })}
          </div>
        </Section>
      )}
      {colors.map((c) => (
        <Section key={c.patchKey} title={c.label}>
          <ColorRow model={c} onPick={(value) => apply({ [c.patchKey]: value } as StylePatch)} />
        </Section>
      ))}
      {fillStyle !== undefined && (
        <Section title="Relleno">
          <div className="segmented-group wide" role="group">
            {FILL_STYLES.map(([id, label, Preview]) => (
              <button
                key={id}
                type="button"
                className="icon-btn"
                data-active={fillStyle === id || undefined}
                aria-label={label}
                aria-pressed={fillStyle === id}
                data-tip={label}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => apply({ fillStyle: id })}
              >
                <Preview />
              </button>
            ))}
          </div>
        </Section>
      )}
      {heads && (
        <Section title="Puntas">
          <div className="segmented-group wide" role="group">
            {HEADS.map(([start, end, label, Icon]) => {
              const active = heads.start === start && heads.end === end;
              return (
                <button
                  key={label}
                  type="button"
                  className="icon-btn"
                  data-active={active || undefined}
                  aria-label={label}
                  aria-pressed={active}
                  data-tip={label}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => apply({ startHead: start, endHead: end })}
                >
                  <Icon size={17} strokeWidth={1.75} />
                </button>
              );
            })}
          </div>
        </Section>
      )}
      {size && (
        <Section title={size.label}>
          <SizeControls {...size} onChange={(value) => apply({ size: value })} />
        </Section>
      )}
      {roughness !== undefined && (
        <Section title="Trazado">
          <div className="segmented-group wide" role="group">
            {ROUGHNESS.map(([id, label, Preview]) => (
              <button
                key={id}
                type="button"
                className="icon-btn"
                data-active={roughness === id || undefined}
                aria-label={label}
                aria-pressed={roughness === id}
                data-tip={label}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => apply({ roughness: id })}
              >
                <Preview />
              </button>
            ))}
          </div>
        </Section>
      )}
      {labelSize !== undefined && (
        <Section title="Tamaño del texto">
          <SizeControls
            kind="text"
            value={labelSize}
            onChange={(value) => apply({ labelSize: value })}
          />
        </Section>
      )}
      {font !== undefined && (
        <Section title="Fuente">
          <FontButton value={font} onChange={(value) => apply({ font: value })} />
        </Section>
      )}
      {align !== undefined && (
        <Section title="Alineación">
          <div className="segmented">
            <Segmented<TextAlign>
              value={align}
              onChange={(value) => apply({ align: value })}
              options={[
                ['left', 'Izquierda', TextAlignStart],
                ['center', 'Centro', TextAlignCenter],
                ['right', 'Derecha', TextAlignEnd],
              ]}
            />
            {valign !== undefined && (
              <Segmented<VerticalAlign>
                value={valign}
                onChange={(value) => apply({ valign: value })}
                options={[
                  ['top', 'Arriba', AlignVerticalJustifyStart],
                  ['middle', 'En medio', AlignVerticalJustifyCenter],
                  ['bottom', 'Abajo', AlignVerticalJustifyEnd],
                ]}
              />
            )}
          </div>
        </Section>
      )}
      <Section title="Opacidad">
        <div className="opacity-row">
          <input
            type="range"
            className="size-slider"
            min={0}
            max={100}
            value={Math.round(opacity * 100)}
            aria-label="Opacidad"
            onChange={(e) => apply({ opacity: Number(e.target.value) / 100 })}
            onPointerUp={(e) => {
              e.currentTarget.blur();
              refocusEditor();
            }}
          />
          <span className="opacity-value">{Math.round(opacity * 100)}</span>
        </div>
      </Section>
      <LinkSection />
    </aside>
  );
}
