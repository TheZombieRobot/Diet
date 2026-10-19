/**
 * The readiness gate input for everything item 14 decides (item 13 section 9.1 rules 1 and 2): the
 * stored answers, the birth year and height, and the current weight by item 14's rule (the lower
 * of the 7-day average and the latest weigh-in), so a low weight closes the same gates on the
 * weight screens, in the reconciler and in the repository re-checks.
 */
import { type GateInput, gateInputFromRecords } from '../readiness/gates';
import type { TimeZone } from '../storage/primitives';
import type { ProfileRecord, ReadinessRecord, WeightRecord } from '../storage/records';
import type { LocalDate } from '../util/time';
import { gateCurrentWeightKg } from './weighIns';

export function weightGateInput(
  records: {
    readonly readiness: readonly ReadinessRecord[];
    readonly profile: Pick<ProfileRecord, 'birthYear' | 'heightCm'>;
    readonly weights: readonly Pick<WeightRecord, 'at' | 'timeZone' | 'kg'>[];
    readonly homeTimeZone: TimeZone;
  },
  today: LocalDate,
): GateInput {
  return gateInputFromRecords({
    rows: records.readiness,
    birthYear: records.profile.birthYear,
    heightCm: records.profile.heightCm,
    currentWeightKg: gateCurrentWeightKg(records.weights, today, records.homeTimeZone),
    today,
  });
}
