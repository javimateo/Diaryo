import { locale } from '../i18n';

/** A size for people: "820 KB", "12,5 MB", "1,2 GB". */
export function formatBytes(value: number): string {
  const bytes = new Intl.NumberFormat(locale(), { maximumFractionDigits: 1 });
  if (value < 1024 * 1024) return `${bytes.format(value / 1024)} KB`;
  if (value < 1024 ** 3) return `${bytes.format(value / 1024 ** 2)} MB`;
  return `${bytes.format(value / 1024 ** 3)} GB`;
}
