import { moveScreen } from '@diet/core/copy/health';
import type { ReactElement, ReactNode } from 'react';
import { goToTab, replaceHash } from '../../navigation';
import { routeHref, type RouteId } from '../../routes';

/** "See this week" (or "Back to Move"): the Move tab, stepping back when the screen came from it. */
export function MoveTabLink({
  from,
  children = moveScreen.seeWeek,
}: {
  readonly from: RouteId;
  readonly children?: ReactNode;
}): ReactElement {
  return (
    <a
      className="ui-button ui-button--quiet"
      href={routeHref('move')}
      onClick={(event) => {
        event.preventDefault();
        goToTab('move', from);
      }}
    >
      {children}
    </a>
  );
}

/**
 * A link that replaces the address rather than adding to the history (the Complete workout
 * chooser), so Back never lands on the chooser and is sent forward into a session again.
 */
export function ReplaceLink({
  href,
  className,
  children,
}: {
  readonly href: string;
  readonly className: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <a
      className={className}
      href={href}
      onClick={(event) => {
        event.preventDefault();
        replaceHash(href);
      }}
    >
      {children}
    </a>
  );
}
