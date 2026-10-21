/** A cloud with a padlock (lucide has none): the cloud diary is locked on this device. */
export function CloudLock({ size = 16, strokeWidth = 2 }: { size?: number; strokeWidth?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M11 19H7.5a5 5 0 1 1 3.9-8.1A6 6 0 0 1 22 13" />
      <rect x="13" y="15" width="9" height="7" rx="1.5" />
      <path d="M15 15v-2a2.5 2.5 0 0 1 5 0v2" />
    </svg>
  );
}
