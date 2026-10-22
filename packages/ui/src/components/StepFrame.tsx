import type { ReactElement, ReactNode, Ref } from 'react';
import { classNames } from '../classNames';
import { OfflineIndicator } from './OfflineIndicator';

export type StepBar = 'done' | 'current' | 'todo';

export interface StepFrameProps {
  /** The visible step text, such as "Step 2 of 6", or null on views outside the numbered steps. */
  stepLabel: string | null;
  /** One bar per step (decorative), or null for none. */
  bars: readonly StepBar[] | null;
  /** The view's heading: the page's one h1, focused when the view changes. */
  heading: string;
  headingRef?: Ref<HTMLHeadingElement> | undefined;
  /** The offline copy of the app is saved (see OfflineIndicator). */
  offlineReady: boolean;
  /** A quiet link on the header's second row, such as "Help numbers and About". */
  headerLink?: ReactNode;
  /** Banners shown above the heading, such as "Update available". */
  banners?: ReactNode;
  /** Shown just above the heading: an icon, or "Question 2 of 7". */
  eyebrow?: ReactNode;
  /** The step's buttons, in a footer after the content. */
  footer?: ReactNode;
  children: ReactNode;
}

const present = (node: ReactNode): boolean => node !== undefined && node !== null && node !== false;

/**
 * The frame of the first-run steps (UX section 1; mock-ups Notice and Schedule): the step bars
 * and their text with the offline pill, an optional link row, then the view's heading and content,
 * and a footer for its buttons. There is no tab bar and no settings gear: nothing leads out of
 * setup from here. The header wraps on a narrow screen, so nothing scrolls sideways at 360 px.
 */
export function StepFrame({
  stepLabel,
  bars,
  heading,
  headingRef,
  offlineReady,
  headerLink,
  banners,
  eyebrow,
  footer,
  children,
}: StepFrameProps): ReactElement {
  return (
    <div className="ui-steps">
      <header className="ui-steps__header">
        <div className="ui-steps__row">
          <div className="ui-steps__progress">
            {bars === null ? null : (
              <div className="ui-steps__bars" aria-hidden="true">
                {bars.map((bar, i) => (
                  <span key={i} className={classNames('ui-steps__bar', `ui-steps__bar--${bar}`)} />
                ))}
              </div>
            )}
            {stepLabel === null ? null : <p className="ui-steps__label">{stepLabel}</p>}
          </div>
          <OfflineIndicator offlineReady={offlineReady} />
        </div>
        {present(headerLink) ? <div className="ui-steps__link">{headerLink}</div> : null}
      </header>
      <main id="main" className="ui-steps__main" tabIndex={-1}>
        {present(banners) ? <div className="ui-shell__banners">{banners}</div> : null}
        {eyebrow}
        {/* tabIndex -1: focusable by the app (a view change), not a stop for the Tab key. */}
        <h1 ref={headingRef} className="ui-steps__title" tabIndex={-1}>
          {heading}
        </h1>
        {children}
      </main>
      {/* A footer outside main is the page's contentinfo landmark, so the step's actions and
          their notes are inside a landmark too (item 37). */}
      {present(footer) ? <footer className="ui-steps__footer">{footer}</footer> : null}
    </div>
  );
}
