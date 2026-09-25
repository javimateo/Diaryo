import { Pipette } from 'lucide-react';
import { useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import type { HexColor } from '../engine/palette';
import { useUI } from '../store/ui';
import { hexToHsv, hsvToHex, normalizeHex, type Hsv } from './color';
import { useT } from './useT';

interface EyeDropperResult {
  sRGBHex: string;
}
type EyeDropperCtor = new () => { open: () => Promise<EyeDropperResult> };

/**
 * Custom color picker: saturation/brightness square, hue bar, hex code, eyedropper (if
 * the browser allows it) and the recently used colors. Changes apply live.
 */
export function ColorPicker(props: { value: HexColor; onChange: (color: HexColor) => void }) {
  const t = useT();
  const { value, onChange } = props;
  const recent = useUI((s) => s.recentColors);
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(value));
  const [hexDraft, setHexDraft] = useState(value);
  const areaRef = useRef<HTMLDivElement>(null);
  const EyeDropper = (window as unknown as { EyeDropper?: EyeDropperCtor }).EyeDropper;

  const apply = (next: Hsv) => {
    setHsv(next);
    const hex = hsvToHex(next);
    setHexDraft(hex);
    onChange(hex);
  };

  const applyHex = (hex: HexColor) => {
    setHsv(hexToHsv(hex));
    setHexDraft(hex);
    onChange(hex);
  };

  const pickFromArea = (e: PointerEvent<HTMLDivElement>) => {
    const rect = areaRef.current!.getBoundingClientRect();
    const s = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const v = 1 - Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    apply({ ...hsv, s, v });
  };

  return (
    <div className="color-picker">
      <div
        ref={areaRef}
        className="color-area"
        style={{ '--hue': `hsl(${hsv.h} 100% 50%)` } as CSSProperties}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          pickFromArea(e);
        }}
        onPointerMove={(e) => {
          if (e.buttons & 1) pickFromArea(e);
        }}
      >
        <span
          className="color-area-thumb"
          style={{
            left: `${hsv.s * 100}%`,
            top: `${(1 - hsv.v) * 100}%`,
            background: hsvToHex(hsv),
          }}
        />
      </div>
      <input
        type="range"
        className="hue-slider"
        min={0}
        max={360}
        value={Math.round(hsv.h)}
        aria-label={t.colors.hue}
        onChange={(e) => apply({ ...hsv, h: Number(e.target.value) })}
      />
      <div className="color-row">
        <span className="color-preview" style={{ background: hsvToHex(hsv) }} />
        <input
          className="hex-input"
          value={hexDraft}
          spellCheck={false}
          aria-label={t.colors.code}
          onChange={(e) => {
            setHexDraft(e.target.value as HexColor);
            const hex = normalizeHex(e.target.value);
            if (hex) applyHex(hex);
          }}
          onBlur={() => setHexDraft(hsvToHex(hsv))}
        />
        {EyeDropper && (
          <button
            type="button"
            className="icon-btn"
            aria-label={t.colors.eyedropper}
            data-tip={t.colors.eyedropperTip}
            onClick={async () => {
              try {
                const { sRGBHex } = await new EyeDropper().open();
                const hex = normalizeHex(sRGBHex);
                if (hex) applyHex(hex);
              } catch {
                // Cancelled.
              }
            }}
          >
            <Pipette size={16} strokeWidth={1.75} />
          </button>
        )}
      </div>
      {recent.length > 0 && (
        <div className="recent-colors" aria-label={t.colors.recent}>
          {recent.map((color) => (
            <button
              key={color}
              type="button"
              className="swatch"
              style={{ '--swatch': color } as CSSProperties}
              aria-label={color}
              data-tip={color}
              onClick={() => applyHex(color)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
