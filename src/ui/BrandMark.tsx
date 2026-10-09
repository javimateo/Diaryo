/**
 * The diaryo mark: the terracotta notebook with its elastic band. Fixed colors (it is the
 * same on light and dark). The same drawing as src-tauri/icons/icon.svg and the favicons;
 * the website renders it too.
 */
export function BrandMark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className="brand-mark">
      <rect x="14.5" y="8.5" width="40" height="49" rx="7" fill="#efe3cc" />
      <rect x="9.5" y="6" width="41" height="52" rx="8" fill="#9c4532" />
      <rect x="9.5" y="6" width="41" height="50" rx="8" fill="#b8573f" />
      <rect x="41" y="3.5" width="4.5" height="57" rx="2.25" fill="#2a2724" />
      {/* Below ~24 px the stroke on the cover is only noise. */}
      {size >= 24 && (
        <path
          d="M17.5 39c3-8 6.5-12 9-11s-3.5 9 0 9 4.5-6.5 7-6.5"
          fill="none"
          stroke="#f8e6dc"
          strokeWidth={3.6}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}
