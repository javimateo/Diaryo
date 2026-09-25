import { Search, Upload } from 'lucide-react';
import { useRef, useState, useSyncExternalStore } from 'react';
import {
  CATEGORY_LABELS,
  FONT_FILE_ACCEPT,
  fonts,
  uploadFontFile,
  type FontCategory,
  type FontDef,
} from '../engine/fonts';
import { useUI } from '../store/ui';

const subscribe = (listener: () => void) => fonts.subscribe(listener);
const getVersion = () => fonts.version;

/** Se re-renderiza cuando se carga o se añade una fuente. */
export function useFonts(): FontDef[] {
  useSyncExternalStore(subscribe, getVersion);
  return fonts.all();
}

const ORDER: FontCategory[] = ['custom', 'sans', 'hand', 'serif', 'mono', 'display'];

/** Lista de fuentes con buscador; cada una se muestra con su propia letra. */
export function FontPicker(props: { value: string | null; onChange: (font: string) => void }) {
  const { value, onChange } = props;
  const all = useFonts();
  const [query, setQuery] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const showToast = useUI((s) => s.showToast);

  const q = query.trim().toLowerCase();
  const visible = all.filter((f) => !q || f.name.toLowerCase().includes(q));

  const upload = async (file: File | undefined) => {
    if (!file) return;
    try {
      onChange(await uploadFontFile(file));
    } catch {
      showToast('No se ha podido leer esa fuente');
    }
  };

  return (
    <div className="font-picker">
      <label className="font-search">
        <Search size={15} strokeWidth={1.75} />
        <input
          autoFocus
          value={query}
          placeholder="Buscar fuente"
          aria-label="Buscar fuente"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && visible[0]) onChange(visible[0].id);
          }}
        />
      </label>
      <div className="font-list">
        {ORDER.map((category) => {
          const items = visible.filter((f) => f.category === category);
          if (items.length === 0) return null;
          return (
            <section key={category}>
              <h4>{CATEGORY_LABELS[category]}</h4>
              {items.map((font) => (
                <button
                  key={font.id}
                  type="button"
                  className="font-item"
                  data-active={font.id === value || undefined}
                  style={{ fontFamily: fonts.stack(font.id) }}
                  onClick={() => onChange(font.id)}
                >
                  {font.name}
                </button>
              ))}
            </section>
          );
        })}
        {visible.length === 0 && <p className="font-empty">Ninguna fuente coincide</p>}
      </div>
      <button type="button" className="font-upload" onClick={() => fileRef.current?.click()}>
        <Upload size={15} strokeWidth={1.75} />
        Subir una fuente (.ttf, .otf, .woff)
      </button>
      <input
        ref={fileRef}
        type="file"
        accept={FONT_FILE_ACCEPT}
        hidden
        onChange={(e) => {
          void upload(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </div>
  );
}
