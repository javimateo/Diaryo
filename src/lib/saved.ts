/**
 * What is saved in the browser (settings, views, the last page…). It may be unavailable
 * or fail (private mode, no space left): reading returns null and writing says whether it
 * worked, but it never breaks the app.
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

/**
 * What was saved as JSON, or null if there is nothing or it can't be parsed. Whoever
 * reads it checks its shape.
 */
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

/** To read fields of something saved without knowing yet whether it has the expected shape. */
export function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}
