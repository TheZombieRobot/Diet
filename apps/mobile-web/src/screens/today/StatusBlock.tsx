import { scheduleFrom, type Instant, type TimeZone, todayStatus } from '@diet/core';
import type { ReactElement, Ref } from 'react';
import type { AppStorage } from '../../db/runtime';
import { formatTodayHeading } from '../../format';
import { useFasting } from '../fasting/useFasting';
import { statusText } from './statusText';

/**
 * The date and the one-line status at the top of Today (UX_SCREENS section 2, top). Not a card and
 * not a live region: it changes every minute, and announcing each change would be noise.
 */
export function StatusBlock({
  now,
  zone,
  line,
  ref,
}: {
  readonly now: Instant;
  readonly zone: TimeZone;
  readonly line: string | null;
  readonly ref?: Ref<HTMLDivElement> | undefined;
}): ReactElement {
  return (
    <div ref={ref} className="ui-today-status" data-testid="today-status">
      <p className="ui-today-status__date" data-testid="today-date">
        {formatTodayHeading(now, zone)}
      </p>
      {line === null ? null : (
        <p className="ui-text-lead" data-testid="today-status-line">
          {line}
        </p>
      )}
    </div>
  );
}

/**
 * The status block with its line (design section 1.2), from item 15's fasting picture: the same
 * gate, the same schedule (with the per-day changes, such as the 5 pm snack) and the same running
 * span as the Fast card, so the two never disagree. Only the date while that read is pending.
 */
export function LiveStatusBlock({
  storage,
  now,
  ref,
}: {
  readonly storage: AppStorage;
  readonly now: Instant;
  readonly ref?: Ref<HTMLDivElement> | undefined;
}): ReactElement {
  const read = useFasting(storage);
  const zone = storage.env.timeZone();
  let line: string | null = null;
  if (read.kind === 'ready') {
    const { context, inputs } = read;
    const schedule = scheduleFrom({
      preset: context.preset,
      planDays: inputs.planDays,
      fastingGated: context.gate.fastingGated,
      kickstart: context.kickstart,
    });
    line = statusText(
      todayStatus({
        now: read.now,
        timeZone: read.deviceTimeZone,
        fastingGated: context.gate.fastingGated,
        schedule,
        fasts: inputs.fasts,
      }),
      read.deviceTimeZone,
    );
  }
  return <StatusBlock ref={ref} now={now} zone={zone} line={line} />;
}
