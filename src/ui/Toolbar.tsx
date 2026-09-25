import { Fragment } from 'react';
import { useUI } from '../store/ui';
import { TOOL_GROUPS, type ToolDef } from './toolDefs';
import { useT } from './useT';

export function Toolbar() {
  const t = useT();
  return (
    <div className="toolbar floating" role="toolbar" aria-label={t.tools.label}>
      {TOOL_GROUPS.map((group, i) => (
        <Fragment key={i}>
          {i > 0 && <div className="toolbar-sep" aria-hidden />}
          {group.map((def) => (
            <ToolButton key={def.id} def={def} />
          ))}
        </Fragment>
      ))}
    </div>
  );
}

function ToolButton({ def }: { def: ToolDef }) {
  const t = useT();
  const active = useUI((s) => s.tool === def.id);
  const { id, key, digit, icon: Icon } = def;
  const label = t.tools.names[id];
  const shortcut = digit ? t.tools.keyOr(key.toUpperCase(), digit) : key.toUpperCase();

  return (
    <button
      type="button"
      className="icon-btn tool-btn"
      data-active={active || undefined}
      aria-pressed={active}
      aria-label={`${label} (${shortcut})`}
      data-tip={`${label} — ${shortcut}`}
      // Don't steal the focus: keyboard shortcuts keep working.
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => useUI.getState().setTool(id)}
    >
      <Icon size={18} strokeWidth={1.75} />
      <span className="tool-key">{key.toUpperCase()}</span>
    </button>
  );
}
