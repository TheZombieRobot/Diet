import { type ReactElement, type Ref, useId } from 'react';

export interface SwitchProps {
  /** The label beside the switch, which also names it for screen readers. */
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  /** A short note under the switch, announced with it (aria-describedby). */
  hint?: string | undefined;
  /** The checkbox, for moving focus to it. */
  ref?: Ref<HTMLInputElement> | undefined;
}

/** An on/off switch: a native checkbox with role="switch", in a row at least 48 px high. */
export function Switch({
  label,
  checked,
  onChange,
  disabled = false,
  hint,
  ref,
}: SwitchProps): ReactElement {
  const hintId = `${useId()}-hint`;
  const control = (
    <label className="ui-switch">
      <input
        ref={ref}
        type="checkbox"
        role="switch"
        className="ui-switch__input"
        checked={checked}
        disabled={disabled}
        aria-describedby={hint === undefined ? undefined : hintId}
        onChange={(event) => {
          onChange(event.currentTarget.checked);
        }}
      />
      <span className="ui-switch__track" aria-hidden="true">
        <span className="ui-switch__thumb" />
      </span>
      <span className="ui-switch__label">{label}</span>
    </label>
  );
  if (hint === undefined) return control;
  return (
    <div className="ui-switch-field">
      {control}
      <p id={hintId} className="ui-field__hint">
        {hint}
      </p>
    </div>
  );
}
