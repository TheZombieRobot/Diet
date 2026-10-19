import { Component, type ReactNode } from 'react';
import { FastingReadError } from './FastCard';

/**
 * Wraps the Fasting screen and Today's Fast card (item 15 design 3.4): if working out the view
 * fails, the read-failure card with Healthline and 111 shows instead of a blank space, and the
 * rest of the app keeps working.
 */
export class FastingErrorBoundary extends Component<
  { readonly children: ReactNode },
  { readonly failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override render(): ReactNode {
    return this.state.failed ? <FastingReadError /> : this.props.children;
  }
}
