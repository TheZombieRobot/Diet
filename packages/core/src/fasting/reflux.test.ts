import { describe, expect, it } from 'vitest';
import { addDays, zonedWallTimeToInstant } from '../util/time';
import { refluxNudge, refluxOptionsVisible } from './reflux';

const NZ = 'Pacific/Auckland';
const TODAY = '2000-01-20';
/** A symptom at 9 pm, `daysAgo` local days before today. */
const symptom = (daysAgo: number, severity: number | null = null) => ({
  at: new Date(zonedWallTimeToInstant(addDays(TODAY, -daysAgo), 21 * 60, NZ)).toISOString(),
  timeZone: NZ,
  severity,
});
const visible = (
  symptoms: ReturnType<typeof symptom>[],
  today: string,
  prefer: { preferEarlier?: boolean; preferSplit?: boolean } = {},
) =>
  refluxOptionsVisible({
    symptoms,
    today,
    homeTimeZone: NZ,
    preferEarlier: prefer.preferEarlier ?? false,
    preferSplit: prefer.preferSplit ?? false,
  });

describe('reflux options (FL-11, FL-15, C104)', () => {
  it('a symptom shows both options on its day and the next, not the day after', () => {
    const logged = [symptom(0)];
    expect(visible(logged, TODAY)).toEqual({ earlier: true, split: true, symptomTriggered: true });
    expect(visible(logged, addDays(TODAY, 1)).symptomTriggered).toBe(true);
    expect(visible(logged, addDays(TODAY, 2))).toEqual({
      earlier: false,
      split: false,
      symptomTriggered: false,
    });
  });

  it('each switch shows its own option with no symptom', () => {
    expect(visible([], TODAY, { preferEarlier: true })).toEqual({
      earlier: true,
      split: false,
      symptomTriggered: false,
    });
    expect(visible([], TODAY, { preferEarlier: true, preferSplit: true })).toMatchObject({
      earlier: true,
      split: true,
    });
  });
});

describe('the GP nudge (FL-16, C47)', () => {
  it('is due with symptoms on 3 distinct days within 14, including days 0, 7 and 13 ago', () => {
    expect(refluxNudge([symptom(0), symptom(7), symptom(13)], TODAY, NZ)).toEqual({
      due: true,
      days: 3,
      stronger: false,
    });
  });

  it('is not due for 2 days, for 3 symptoms on one day, or with a day 14 ago', () => {
    expect(refluxNudge([symptom(0), symptom(3)], TODAY, NZ).due).toBe(false);
    expect(refluxNudge([symptom(2), symptom(2), symptom(2)], TODAY, NZ).due).toBe(false);
    expect(refluxNudge([symptom(0), symptom(7), symptom(14)], TODAY, NZ)).toMatchObject({
      due: false,
      days: 2,
    });
  });

  it('is due when this week was rated stronger than last week; not when last week is unrated or empty', () => {
    expect(refluxNudge([symptom(1, 3), symptom(9, 2)], TODAY, NZ)).toEqual({
      due: true,
      days: 2,
      stronger: true,
    });
    expect(refluxNudge([symptom(1, 3), symptom(9)], TODAY, NZ).stronger).toBe(false);
    expect(refluxNudge([symptom(1, 3)], TODAY, NZ).stronger).toBe(false);
    expect(refluxNudge([symptom(1, 2), symptom(9, 2)], TODAY, NZ).stronger).toBe(false);
  });
});
