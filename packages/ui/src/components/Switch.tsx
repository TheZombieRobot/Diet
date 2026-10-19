import type { ReactElement } from 'react';

export interface SwitchProps {
  /** The label beside the switch, which also names it for screen readers. */
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

/** An on/off switch: a native checkbox with role="switch", in a row at least 48 px high. */
export function Switch({ label, checked, onChange, disabled = false }: SwitchProps): ReactElement {
  return (
    <label className="ui-switch">
      <input
        type="checkbox"
        role="switch"
        className="ui-switch__input"
        checked={checked}
        disabled={disabled}
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
}
