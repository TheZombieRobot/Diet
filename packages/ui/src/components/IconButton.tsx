import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactElement, ReactNode } from 'react';
import { classNames } from '../classNames';

export interface IconButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'aria-label' | 'children'
> {
  /** The accessible name, read out instead of the icon. Required: an icon has no text. */
  label: string;
  icon: ReactNode;
}

/** A 48 px round button that shows only an icon. */
export function IconButton({
  label,
  icon,
  type = 'button',
  className,
  ...rest
}: IconButtonProps): ReactElement {
  return (
    <button
      type={type}
      aria-label={label}
      className={classNames('ui-icon-button', className)}
      {...rest}
    >
      {icon}
    </button>
  );
}

export interface IconLinkProps extends Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  'aria-label' | 'children'
> {
  href: string;
  /** The accessible name, read out instead of the icon. Required: an icon has no text. */
  label: string;
  icon: ReactNode;
  /** Marks the link as the current page (aria-current="page"). */
  current?: boolean;
}

/** A 48 px round link that shows only an icon, such as the settings gear. */
export function IconLink({
  label,
  icon,
  current = false,
  className,
  ...rest
}: IconLinkProps): ReactElement {
  return (
    <a
      aria-label={label}
      aria-current={current ? 'page' : undefined}
      className={classNames('ui-icon-button', className)}
      {...rest}
    >
      {icon}
    </a>
  );
}
