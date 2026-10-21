import { Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { PasswordField } from './PasswordField';
import { PHRASE_MAX } from './passwordRules';
import { useT } from './useT';

/**
 * The pieces the diary password's dialogs share (the cloud's vault, the lock on this
 * device, the lock screen, an encrypted copy): each one keeps its own steps.
 */

/**
 * How a dialog makes its diary password fields: typing in one clears the error shown
 * (`clearError`).
 */
export function phraseFields(clearError: () => void) {
  return (
    label: string,
    value: string,
    onChange: (value: string) => void,
    options: { hint?: string; autoFocus?: boolean; autoComplete?: string } = {},
  ) => (
    <PasswordField
      label={label}
      hint={options.hint}
      autoFocus={options.autoFocus}
      autoComplete={options.autoComplete ?? 'new-password'}
      maxLength={PHRASE_MAX}
      value={value}
      onChange={(next) => {
        onChange(next);
        clearError();
      }}
    />
  );
}

/** The recovery code, as typed (`onChange` gets the text). */
export function RecoveryCodeField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const t = useT();
  return (
    <label className="account-field">
      <span>{t.vault.code}</span>
      <input
        className="vault-code-input"
        autoFocus
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        placeholder="XXXX-XXXX-XXXX-…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

/** The error under a form, if any. */
export function FormError({ message }: { message: string }) {
  return message ? (
    <p className="account-error" role="alert">
      {message}
    </p>
  ) : null;
}

/** The form's main button, with a spinner while it works (a plain button with `onClick`). */
export function SubmitButton({
  busy,
  onClick,
  children,
}: {
  busy: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type={onClick ? 'button' : 'submit'}
      className="account-primary"
      disabled={busy}
      onClick={onClick}
    >
      {busy && <Loader2 size={15} strokeWidth={2} className="account-spin" aria-hidden />}
      {children}
    </button>
  );
}
