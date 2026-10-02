/** One option among a few, as a row of buttons (the settings' segmented controls). */
export function Choice<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: [T, string][];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="segmented-group" role="group">
      {options.map(([id, label]) => (
        <button
          key={String(id)}
          type="button"
          className="icon-btn text-option"
          data-active={value === id || undefined}
          aria-pressed={value === id}
          onClick={() => onChange(id)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
