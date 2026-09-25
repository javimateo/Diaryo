import { useUI } from '../store/ui';

export function Toast() {
  const toast = useUI((s) => s.toast);
  const hideToast = useUI((s) => s.hideToast);
  const visible = toast?.visible ?? false;
  return (
    <div className="toast" data-visible={visible || undefined} role="status">
      {toast?.message}
      {toast?.action && (
        <button
          type="button"
          className="toast-action"
          tabIndex={visible ? 0 : -1}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            hideToast();
            toast.action?.run();
          }}
        >
          {toast.action.label}
        </button>
      )}
    </div>
  );
}
