import { alcohol, onboarding } from '@diet/core/copy/health';
import { Button, Notice, ShieldIcon } from '@diet/ui';
import { type ReactElement, useId } from 'react';
import type { AppStorage } from '../../db/runtime';
import { acknowledgeNotice } from '../actions';
import { type FlowFrame, FlowStepFrame } from '../FlowFrame';
import { NoticeHelpRows } from '../NoticeHelpRows';
import { SaveError } from '../SaveError';
import { useSave } from '../useSave';

/**
 * The mandatory alcohol safety note (UX 1b; HEALTH_SAFETY section 1; HS-20; mock-up Notice). It is
 * shown to everyone and cannot be skipped: the only way forward is "I understand", and there is
 * no close, later or restore control here. "Why am I seeing this?" writes nothing.
 */
export function NoticeStep({
  frame,
  storage,
  whyOpen,
  onToggleWhy,
  onBack,
  onAcknowledged,
}: {
  readonly frame: FlowFrame;
  readonly storage: AppStorage;
  readonly whyOpen: boolean;
  readonly onToggleWhy: () => void;
  readonly onBack: () => void;
  readonly onAcknowledged: () => void;
}): ReactElement {
  const whyId = useId();
  const save = useSave();
  return (
    <FlowStepFrame
      frame={frame}
      heading={alcohol.notice.title}
      eyebrow={
        <span className="ui-steps__badge" aria-hidden="true">
          <ShieldIcon />
        </span>
      }
      footer={
        <>
          <SaveError save={save} />
          <Button
            variant="primary"
            block
            disabled={save.busy}
            onClick={() => {
              void save
                .run(() => acknowledgeNotice(storage))
                .then((ok) => {
                  if (ok) onAcknowledged();
                });
            }}
          >
            {alcohol.notice.acknowledge}
          </Button>
          <Button variant="quiet" onClick={onBack}>
            {onboarding.frame.back}
          </Button>
        </>
      }
    >
      <p className="ui-text-lead" data-testid="first-run-notice">
        {alcohol.firstRunNotice}
      </p>
      <NoticeHelpRows />
      <Button variant="quiet" aria-expanded={whyOpen} aria-controls={whyId} onClick={onToggleWhy}>
        {alcohol.notice.why}
      </Button>
      <div id={whyId} hidden={!whyOpen}>
        {whyOpen ? (
          <Notice tone="info">
            {alcohol.notice.whyText.map((text) => (
              <p key={text}>{text}</p>
            ))}
          </Notice>
        ) : null}
      </div>
    </FlowStepFrame>
  );
}
