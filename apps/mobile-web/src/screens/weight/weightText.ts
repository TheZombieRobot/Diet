/** Weight wording filled in for display; every sentence comes from health.ts. */
import {
  dayTargetsFromRecords,
  fillTemplate,
  type Phase,
  safeKickstartDeficitPct,
  type StartRefusal,
  type StartUnavailable,
  type WeightNote,
} from '@diet/core';
import { weight } from '@diet/core/copy/health';
import { useEffect, useRef, type RefObject } from 'react';
import { formatKg, formatLocalDay } from '../../format';
import type { WeightView } from './useWeightView';

/** "96.8 kg". */
export const kgText = (kg: number): string => fillTemplate(weight.card.kg, { kg: formatKg(kg) });

/** The unit after the {kg} placeholder of weight.card.kg. */
export const KG_UNIT = weight.card.kg.replace('{kg}', '').trim();

export const NOTE_TEXT: Readonly<Record<WeightNote, string>> = {
  kickstart: weight.phase.kickstartNote,
  'kickstart-paused': weight.phase.kickstartPausedNote,
  'kickstart-extended': weight.phase.kickstartExtendedNote,
  'kickstart-later': weight.phase.kickstartLaterNote,
  'kickstart-not-started': weight.phase.notStartedNote,
  'steady-pace': weight.phase.steadyPace,
  'steady-rebound': weight.phase.steadyRebound,
  gated: weight.phase.gated,
  'gated-unanswered': weight.phase.gatedUnanswered,
  'low-weight': weight.phase.lowWeight,
};

const START_UNAVAILABLE_TEXT: Readonly<Record<StartUnavailable, string | null>> = {
  'low-weight': weight.start.unavailableLowWeight,
  gated: weight.start.unavailableGated,
  'not-keto': weight.start.unavailableMode,
  // Only while an end is still being written; no line until it is (design section 2.4.1).
  running: null,
  // The Phase card shows the period's own "not started yet" lines and End Kickstart instead.
  'not-started': null,
  cap: weight.start.unavailableCap,
  'recent-stop-sign': weight.start.unavailableRecentStopSign,
  'ended-ahead': weight.start.unavailableEndedAhead,
  'ended-today': weight.start.unavailableToday,
  'stop-sign-today': weight.start.unavailableStopSignToday,
};

/** The line for a start that is not available (Phase card; the start re-check), or none. */
export function startUnavailableText(
  refusal: Pick<StartRefusal, 'reason' | 'day1'>,
): string | null {
  const text = START_UNAVAILABLE_TEXT[refusal.reason];
  if (text === null || refusal.day1 === undefined) return text;
  return fillTemplate(text, { date: formatLocalDay(refusal.day1) });
}

/**
 * The Kickstart offer, true to what a start would plan (F35): no "bigger deficit" when the
 * Kickstart deficit is set to 0%, and none of the Kickstart figures without a rough guide (item
 * 21's engine reads them as Steady then).
 */
export function startOfferText(view: WeightView): string {
  const { input, inputs, overview } = view;
  const { targets } = dayTargetsFromRecords(inputs, {
    at: input.now,
    today: overview.today,
    deviceZone: input.deviceTimeZone,
    endsPending: input.endsPending,
  });
  if (!targets.estimate.available) return weight.start.offerNoGuide;
  return safeKickstartDeficitPct(inputs.targets.kickstartDeficitPct) === 0
    ? weight.start.offerNoDeficit
    : weight.start.offer;
}

/** The phase chip: "Kickstart, week 2 of 3", "Steady", or none. */
export function phaseChip(phase: Phase): string | null {
  if (phase.kind === 'kickstart') {
    return fillTemplate(weight.phase.kickstartChip, { week: phase.week, weeks: phase.weeks });
  }
  return phase.kind === 'steady' ? weight.phase.steadyChip : null;
}

/** Moves focus to an element once `when` turns true (a panel step, a forced card). */
export function useFocusWhen<T extends HTMLElement>(when: boolean): RefObject<T | null> {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (when) ref.current?.focus();
  }, [when]);
  return ref;
}
