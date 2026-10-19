import { readiness, targets as copy } from '@diet/core/copy/health';
import { ActionRow, ChevronIcon, Notice } from '@diet/ui';
import type { ReactElement } from 'react';
import { routeHref } from '../../routes';
import type { WriteState } from './form';

/** A card's write state: "Saving…", "Saved." (polite) or the failure (an alert). */
export function WriteStatus({
  state,
  saving = copy.form.saving,
}: {
  readonly state: WriteState;
  readonly saving?: string;
}): ReactElement | null {
  switch (state.kind) {
    case 'idle':
      return null;
    case 'saving':
      return (
        <p className="ui-progress" role="status">
          <span className="ui-spinner" aria-hidden="true" />
          {saving}
        </p>
      );
    case 'saved':
      return (
        <Notice tone="info" role="status">
          <p>{copy.form.saved}</p>
        </Notice>
      );
    case 'failed':
      return (
        <Notice role="alert">
          <p>{state.text}</p>
        </Notice>
      );
  }
}

/** The way to the readiness answers, after any "because of your readiness questions" line (RD-06, T36). */
export function ReadinessLink(): ReactElement {
  return (
    <ActionRow
      href={routeHref('readiness')}
      title={readiness.settingsRow.title}
      detail={readiness.settingsRow.detail}
      badge={<ChevronIcon />}
    />
  );
}
