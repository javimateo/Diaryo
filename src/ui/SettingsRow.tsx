import type { ReactNode } from 'react';

/** Una fila de los ajustes: qué es (con una explicación corta) y su control. */
export function SettingsRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="settings-row">
      <div className="settings-label">
        <span>{label}</span>
        {hint && <small>{hint}</small>}
      </div>
      {children}
    </div>
  );
}
