import {
  useId,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react';
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
  /**
   * An error shown elsewhere that belongs to this field too (one message for two time fields):
   * the id of that message. The field is marked invalid and described by it.
   */
  sharedErrorId?: string | undefined;
  /** A button on the input's own row, such as "Add", lined up with the input, not the hint. */
  action?: ReactNode;
  /** The input element, for moving focus back to it (for example after a wrong password). */
  ref?: Ref<HTMLInputElement> | undefined;
}

/** A labelled text input at least 48 px high, with an optional hint and error. */
export function TextField({
  label,
  hint,
  error,
  sharedErrorId,
  action,
  ref,
  ...input
}: TextFieldProps): ReactElement {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [
    hint === undefined ? null : hintId,
    error === undefined ? null : errorId,
    sharedErrorId ?? null,
  ]
    .filter((x): x is string => x !== null)
    .join(' ');
  const invalid = error !== undefined || sharedErrorId !== undefined;
  const field = (
    <input
      ref={ref}
      id={id}
      className={classNames('ui-field__input', invalid && 'ui-field__input--error')}
      aria-invalid={invalid ? true : undefined}
      aria-describedby={describedBy === '' ? undefined : describedBy}
      {...input}
    />
  );
  return (
    <div className="ui-field">
      <label className="ui-field__label" htmlFor={id}>
        {label}
      </label>
      {action === undefined ? (
        field
      ) : (
        <div className="ui-field__control">
          {field}
          {action}
        </div>
      )}
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
