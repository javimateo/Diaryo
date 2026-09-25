import { Fragment } from 'react';
import { useUI } from '../store/ui';
import { TOOL_GROUPS, type ToolDef } from './toolDefs';

export function Toolbar() {
  return (
    <div className="toolbar floating" role="toolbar" aria-label="Herramientas">
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
  const active = useUI((s) => s.tool === def.id);
  const { id, label, key, digit, ready, icon: Icon } = def;
  const shortcut = digit ? `${key.toUpperCase()} o ${digit}` : key.toUpperCase();

  const select = () => {
    const { setTool, showToast } = useUI.getState();
    if (ready) setTool(id);
    else showToast(`${label}: llegará muy pronto`);
  };

  return (
    <button
      type="button"
      className="icon-btn tool-btn"
      data-active={active || undefined}
      data-soon={!ready || undefined}
      aria-pressed={active}
      aria-label={`${label} (${shortcut})`}
      data-tip={ready ? `${label} — ${shortcut}` : `${label} — próximamente`}
      // No robar el foco: los atajos de teclado siguen funcionando.
      onMouseDown={(e) => e.preventDefault()}
      onClick={select}
    >
      <Icon size={18} strokeWidth={1.75} />
      <span className="tool-key">{key.toUpperCase()}</span>
    </button>
  );
}
