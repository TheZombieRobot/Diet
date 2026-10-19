import { StepFrame, type StepBar } from '@diet/ui';
import { type ReactElement, type ReactNode, type RefObject, useEffect } from 'react';
import { APP_NAME } from '../appName';

/** What every view of the flow shares: the frame around it (section 3.3). */
export interface FlowFrame {
  readonly offlineReady: boolean;
  readonly banners: ReactNode;
  readonly headingRef: RefObject<HTMLHeadingElement | null>;
  /** "Help numbers and About", once the notice is acknowledged. */
  readonly headerLink: ReactNode;
  /** "Step n of 6", or null outside the numbered steps (repair mode, finish, About, restore). */
  readonly stepLabel: string | null;
  readonly bars: readonly StepBar[] | null;
  /** "Restore from a backup instead", under the step's buttons after the notice (C53). */
  readonly footerLink: ReactNode;
}

/** StepFrame with the flow's shared parts, and the page title "{heading} · Diet". */
export function FlowStepFrame({
  frame,
  heading,
  eyebrow,
  footer,
  children,
}: {
  readonly frame: FlowFrame;
  readonly heading: string;
  readonly eyebrow?: ReactNode;
  readonly footer?: ReactNode;
  readonly children?: ReactNode;
}): ReactElement {
  useEffect(() => {
    document.title = `${heading} · ${APP_NAME}`;
  }, [heading]);
  return (
    <StepFrame
      stepLabel={frame.stepLabel}
      bars={frame.bars}
      heading={heading}
      headingRef={frame.headingRef}
      offlineReady={frame.offlineReady}
      headerLink={frame.headerLink}
      banners={frame.banners}
      eyebrow={eyebrow}
      footer={
        footer === undefined &&
        (frame.footerLink === null || frame.footerLink === undefined) ? undefined : (
          <>
            {footer}
            {frame.footerLink}
          </>
        )
      }
    >
      {children}
    </StepFrame>
  );
}
