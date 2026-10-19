/**
 * The Energy card's explanation lines (item 21 design section 2.2.2; C61, C102, T26, T27, T36):
 * the first matching row, then the lines that apply after it. It reads only the engine output,
 * the display flags and the gates, and names no limit constant (scan targetsHome).
 */
import { type DayTargetsView, fillTemplate, weightIsStale } from '@diet/core';
import { alcohol, readiness, targets as copy } from '@diet/core/copy/health';
import { formatAboutKcal, formatWhole } from '../../format';

export interface EnergyExplanation {
  readonly lines: readonly string[];
  /** A line says something is off because of a readiness answer: the readiness link follows. */
  readonly readinessLink: boolean;
}

export function energyExplanation(view: DayTargetsView): EnergyExplanation {
  const t = view.targets;
  const { energy, deficit } = t;
  const floor = {
    floorKj: formatWhole(energy.floorKj),
    floorKcal: formatAboutKcal(energy.floorKj),
  };
  const carbs = t.netCarbs.kind === 'ceiling' ? t.netCarbs.grams : 0;
  const clamped = energy.kind === 'target' && energy.clampedToFloor;
  const floorBinds = fillTemplate(copy.energy.floorBinds, floor);
  const lines: string[] = [];
  let readinessLink = false;

  if (energy.kind === 'no-estimate') {
    lines.push(
      energy.reason === 'not-estimated'
        ? copy.energy.noTargetNotEstimated
        : fillTemplate(copy.energy.noTargetNeedsGuide, floor),
    );
  } else if (energy.estimateBelowFloor) {
    // No percentage is shown when the floor applies (C61).
    lines.push(fillTemplate(copy.energy.estimateBelowFloor, floor));
  } else if (deficit.basis === 'none-readiness') {
    lines.push(copy.energy.readinessNoDeficit);
    if (clamped) lines.push(floorBinds);
    readinessLink = true;
  } else if (deficit.basis === 'none-stop-sign') {
    if (clamped) lines.push(floorBinds);
  } else if (clamped) {
    lines.push(floorBinds);
  } else if (deficit.basis === 'kickstart') {
    const filled = { pct: deficit.pct, protein: t.protein.checkTargetG, carbs };
    lines.push(
      deficit.pct === 0
        ? fillTemplate(copy.energy.kickstartNoDeficit, filled)
        : fillTemplate(copy.energy.kickstart, filled),
    );
  } else {
    lines.push(fillTemplate(copy.energy.steady, { pct: deficit.pct }));
  }

  if (t.kickstartSuspended !== null) {
    lines.push(copy.energy.kickstartSuspended[t.kickstartSuspended]);
    if (t.kickstartSuspended === 'readiness') readinessLink = true;
    if (t.kickstartSuspended === 'stop-sign') {
      // HEALTH_SAFETY section 2, with the blood-pressure wording for answer 4 yes or unanswered (C102).
      lines.push(
        view.gates.bloodPressureSaltWording
          ? readiness.bloodPressure.stopSign
          : copy.stopSign.action,
        copy.stopSign.emergency,
      );
    }
  }
  if (t.estimate.available && weightIsStale(t.estimate.weight, view.today)) {
    lines.push(copy.energy.staleWeight);
  }
  if (view.display.pregnancyNote) lines.push(copy.energy.pregnancyNote);
  // Alcohol is never mentioned while alcohol logging is unavailable (T16, RD-01).
  if (view.gates.alcoholLoggingAvailable) lines.push(alcohol.dayEnergy.foodOnly);
  return { lines, readinessLink };
}
