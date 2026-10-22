import { type ReactElement, useId } from 'react';
import { MinusIcon, PlusIcon } from '../icons';
import { IconButton } from './IconButton';

export interface StepperProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  /** The names of the two buttons, such as "One fewer person" and "One more person". */
  decreaseLabel: string;
  increaseLabel: string;
  hint?: string | undefined;
  /** How much one tap changes the value (default 1), such as 5 seconds. */
  step?: number | undefined;
  /** The value as shown, such as "30 seconds" (default: the number). */
  formatValue?: ((value: number) => string) | undefined;
}

/**
 * A whole number changed one step at a time with two 48 px buttons, so nothing has to be typed.
 * The value is announced when it changes; a button is disabled at its bound.
 */
export function Stepper({
  label,
  value,
  min,
  max,
  onChange,
  decreaseLabel,
  increaseLabel,
  hint,
  step = 1,
  formatValue = String,
}: StepperProps): ReactElement {
  const id = useId();
  const labelId = `${id}-label`;
  const hintId = `${id}-hint`;
  return (
    <div
      className="ui-stepper"
      role="group"
      aria-labelledby={labelId}
      aria-describedby={hint === undefined ? undefined : hintId}
    >
      <span id={labelId} className="ui-field__label">
        {label}
      </span>
      <div className="ui-stepper__controls">
        <IconButton
          label={decreaseLabel}
          icon={<MinusIcon />}
          className="ui-stepper__button"
          disabled={value <= min}
          onClick={() => {
            onChange(Math.max(min, value - step));
          }}
        />
        <output className="ui-stepper__value" aria-live="polite">
          {formatValue(value)}
        </output>
        <IconButton
          label={increaseLabel}
          icon={<PlusIcon size={22} />}
          className="ui-stepper__button"
          disabled={value >= max}
          onClick={() => {
            onChange(Math.min(max, value + step));
          }}
        />
      </div>
      {hint === undefined ? null : (
        <p id={hintId} className="ui-field__hint">
          {hint}
        </p>
      )}
    </div>
  );
}
