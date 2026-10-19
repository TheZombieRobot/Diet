import { useId, type InputHTMLAttributes, type ReactElement } from 'react';
import { classNames } from '../classNames';

export interface TextFieldProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'id' | 'className' | 'aria-describedby'
> {
  /** The visible label, which also names the field for screen readers. */
  label: string;
  /** A short rule shown under the field, such as "At least 10 characters." */
  hint?: string | undefined;
  /** Why the value is not accepted; shown under the field and announced. */
  error?: string | undefined;
}

/** A labelled text input at least 48 px high, with an optional hint and error. */
export function TextField({ label, hint, error, ...input }: TextFieldProps): ReactElement {
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
      <input
        id={id}
        className={classNames('ui-field__input', error !== undefined && 'ui-field__input--error')}
        aria-invalid={error === undefined ? undefined : true}
        aria-describedby={describedBy === '' ? undefined : describedBy}
        {...input}
      />
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
