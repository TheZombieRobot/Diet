import type { ButtonHTMLAttributes, ReactElement } from 'react';
import { classNames } from '../classNames';

export type ButtonVariant = 'primary' | 'secondary' | 'tint' | 'quiet' | 'caution';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * primary: the one main action; secondary: outlined; tint: soft teal; quiet: text only;
   * caution: outlined in amber, for an action that cannot be undone (deleting or replacing
   * records). Red stays for emergencies only (UX_SCREENS design rules).
   */
  variant?: ButtonVariant;
  /** Full width of its container. */
  block?: boolean;
}

/** A text button at least 48 px high. Defaults to type="button" so it never submits a form. */
export function Button({
  variant = 'secondary',
  block = false,
  type = 'button',
  className,
  ...rest
}: ButtonProps): ReactElement {
  return (
    <button
      type={type}
      className={classNames(
        'ui-button',
        `ui-button--${variant}`,
        block && 'ui-button--block',
        className,
      )}
      {...rest}
    />
  );
}
