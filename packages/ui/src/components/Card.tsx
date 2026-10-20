import { useId, type ReactElement, type ReactNode } from 'react';

export interface CardProps {
  /** The small uppercase section label at the top, which also names the card for screen readers. */
  label: string;
  /** Optional content at the right of the label, such as a chip. */
  aside?: ReactNode;
  children: ReactNode;
}

/**
 * A white (dark: near-black) rounded card, the unit every screen is built from. Its heading can
 * take focus from code (tabIndex -1, out of the Tab order), so a screen can move focus to the next
 * card when one goes away.
 */
export function Card({ label, aside, children }: CardProps): ReactElement {
  const labelId = useId();
  return (
    <section className="ui-card" aria-labelledby={labelId}>
      <div className="ui-card__header">
        <h2 id={labelId} className="ui-card__label" tabIndex={-1}>
          {label}
        </h2>
        {aside}
      </div>
      <div className="ui-card__body">{children}</div>
    </section>
  );
}
