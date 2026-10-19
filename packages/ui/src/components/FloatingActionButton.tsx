import type { ButtonHTMLAttributes, ReactElement, Ref } from 'react';
import { classNames } from '../classNames';
import { PlusIcon } from '../icons';

export interface FloatingActionButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'aria-label' | 'children'
> {
  /** The accessible name, read out instead of the "+" icon. */
  label: string;
  ref?: Ref<HTMLButtonElement> | undefined;
}

/** The round "+" button that floats above the tab bar on Today. */
export function FloatingActionButton({
  label,
  type = 'button',
  className,
  ...rest
}: FloatingActionButtonProps): ReactElement {
  return (
    <button type={type} aria-label={label} className={classNames('ui-fab', className)} {...rest}>
      <PlusIcon />
    </button>
  );
}
