/** Weight wording filled in for display; every sentence comes from health.ts. */
import { fillTemplate, type Phase, type StartUnavailable, type WeightNote } from '@diet/core';
import { weight } from '@diet/core/copy/health';
import { useEffect, useRef, type RefObject } from 'react';
import { formatKg } from '../../format';

/** "96.8 kg". */
export const kgText = (kg: number): string => fillTemplate(weight.card.kg, { kg: formatKg(kg) });

/** The unit after the {kg} placeholder of weight.card.kg. */
export const KG_UNIT = weight.card.kg.replace('{kg}', '').trim();

export const NOTE_TEXT: Readonly<Record<WeightNote, string>> = {
  kickstart: weight.phase.kickstartNote,
  'kickstart-extended': weight.phase.kickstartExtendedNote,
  'kickstart-later': weight.phase.kickstartLaterNote,
  'kickstart-not-started': weight.phase.notStartedNote,
  'steady-pace': weight.phase.steadyPace,
  'steady-rebound': weight.phase.steadyRebound,
  gated: weight.phase.gated,
  'gated-unanswered': weight.phase.gatedUnanswered,
  'low-weight': weight.phase.lowWeight,
};

/** The line for a start that is not available (Phase card; the start re-check). */
export const START_UNAVAILABLE_TEXT: Readonly<Record<StartUnavailable, string | null>> = {
  'low-weight': weight.start.unavailableLowWeight,
  gated: weight.start.unavailableGated,
  'not-keto': weight.start.unavailableMode,
  // Only while an end is still being written; no line until it is (design section 2.4.1).
  running: null,
  // The Phase card shows the period's own "not started yet" lines and End Kickstart instead.
  'not-started': null,
  'ended-today': weight.start.unavailableToday,
  'recent-stop-sign': weight.start.unavailableRecentStopSign,
  cap: weight.start.unavailableCap,
};

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
