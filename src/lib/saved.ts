/**
 * Lo que se guarda en el navegador (ajustes, vistas, la última página…). Puede no estar
 * disponible o fallar (modo privado, sin espacio): leer devuelve null y escribir dice si
 * se pudo, pero nunca rompe la app.
 */

export function readText(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeText(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/** Lo guardado como JSON, o null si no hay o no se entiende. Quien lo lee comprueba su forma. */
export function readJSON(key: string): unknown {
  const text = readText(key);
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function writeJSON(key: string, value: unknown): boolean {
  return writeText(key, JSON.stringify(value));
}

/** Para leer campos de algo guardado sin saber aún si tiene la forma esperada. */
export function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}
