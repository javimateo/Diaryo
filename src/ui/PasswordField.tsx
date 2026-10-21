import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { PASSWORD_MAX } from '../cloud/account';
import { useT } from './useT';

/** A password field, with a button to show what was typed. */
export function PasswordField({
  label,
  hint,
  autoFocus,
  autoComplete,
  maxLength = PASSWORD_MAX,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  autoFocus?: boolean;
  autoComplete: string;
  maxLength?: number;
  value: string;
  onChange: (value: string) => void;
}) {
  const t = useT();
  const [shown, setShown] = useState(false);
  return (
    <label className="account-field">
      <span>{label}</span>
      <span className="account-password">
        <input
          type={shown ? 'text' : 'password'}
          required
          autoFocus={autoFocus}
          autoComplete={autoComplete}
          maxLength={maxLength}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          className="icon-btn"
          aria-label={shown ? t.account.hidePassword : t.account.showPassword}
          aria-pressed={shown}
          onClick={() => setShown(!shown)}
        >
          {shown ? <EyeOff size={16} strokeWidth={1.75} /> : <Eye size={16} strokeWidth={1.75} />}
        </button>
      </span>
      {hint && <small>{hint}</small>}
    </label>
  );
}
