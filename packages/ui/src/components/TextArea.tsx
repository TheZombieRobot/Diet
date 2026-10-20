import { type ReactElement, type TextareaHTMLAttributes, useId } from 'react';
import { classNames } from '../classNames';

export interface TextAreaProps extends Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  'id' | 'className' | 'aria-describedby'
> {
  /** The visible label, which also names the field for screen readers. */
  label: string;
  /** A short rule shown under the field. */
  hint?: string | undefined;
  /** Why the value is not accepted; shown under the field and announced. */
  error?: string | undefined;
}

/** A labelled multi-line text field, the TextField pattern with a native textarea. */
export function TextArea({ label, hint, error, rows = 3, ...input }: TextAreaProps): ReactElement {
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
      <textarea
        id={id}
        rows={rows}
        className={classNames(
          'ui-field__input',
          'ui-field__input--multiline',
          error !== undefined && 'ui-field__input--error',
        )}
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
