import { type ReactElement, useId } from 'react';
import { ChevronDownIcon } from '../icons';

export interface SelectFieldProps {
  /** The visible label, which also names the field for screen readers. */
  label: string;
  /** A short rule shown under the field. */
  hint?: string | undefined;
  /** Why the value is not accepted; shown under the field and announced. */
  error?: string | undefined;
  value: string;
  options: readonly { readonly value: string; readonly label: string }[];
  onChange: (value: string) => void;
  disabled?: boolean | undefined;
}

/**
 * A labelled drop-down at least 48 px high, the TextField pattern with a native select. The
 * chevron is an inline SVG in the current text colour, so it shows in dark mode too.
 */
export function SelectField({
  label,
  hint,
  error,
  value,
  options,
  onChange,
  disabled = false,
}: SelectFieldProps): ReactElement {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint === undefined ? null : hintId, error === undefined ? null : errorId]
    .filter((x): x is string => x !== null)
    .join(' ');
  return (
    <div className="ui-field">
      <label className="ui-field__label" htmlFor={id}>
        {label}
      </label>
      <span className="ui-select">
        <select
          id={id}
          className="ui-field__input ui-select__input"
          value={value}
          disabled={disabled}
          aria-invalid={error === undefined ? undefined : true}
          aria-describedby={describedBy === '' ? undefined : describedBy}
          onChange={(event) => {
            onChange(event.currentTarget.value);
          }}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <span className="ui-select__chevron" aria-hidden="true">
          <ChevronDownIcon />
        </span>
      </span>
      {hint === undefined ? null : (
        <p id={hintId} className="ui-field__hint">
          {hint}
        </p>
      )}
      {error === undefined ? null : (
        <p id={errorId} className="ui-field__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
