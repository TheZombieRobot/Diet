/**
 * FS-05 on the logging status line (item 28 design 2.3, A35): item 15's neutral note shows when the
 * drink itself fell in a fast or outside the planned eating window, judged by the drink's own time,
 * not by whether a fast is running now. The fasts and the eating schedule are read exactly as the
 * Fast card reads them (item 15's useFasting: the effective preset of cross-item ruling 2, the plan
 * days and the Kickstart switch), so the two places never disagree about a window.
 */
import {
  alcoholNoteApplies,
  type Instant,
  instantMs,
  scheduleFrom,
  type TimeZone,
} from '@diet/core';
import type { AppStorage } from '../../db/runtime';
import { useFasting } from '../fasting/useFasting';

export type AlcoholNoteFor = (drink: {
  readonly at: Instant;
  readonly timeZone: TimeZone;
}) => boolean;

/** Whether the fasting note follows a logged drink; never while the fasting records are unread. */
export function useAlcoholNote(storage: AppStorage): AlcoholNoteFor {
  const fasting = useFasting(storage);
  if (fasting.kind !== 'ready') return () => false;
  const { context, inputs } = fasting;
  const schedule = scheduleFrom({
    preset: context.preset,
    planDays: inputs.planDays,
    fastingGated: context.gate.fastingGated,
    kickstart: context.kickstart,
  });
  // The clock when the line is written: a running fast covers a drink logged just now.
  return (drink) => alcoholNoteApplies(drink, inputs.fasts, schedule, instantMs(storage.env.now()));
}
