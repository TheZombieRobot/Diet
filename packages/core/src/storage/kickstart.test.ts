import { describe, expect, it } from 'vitest';
import { defaultSnapshot } from './defaults';
import { findInvariantViolation } from './invariants';
import {
  canExtendKickstart,
  canStartKickstart,
  effectiveDays,
  effectiveLastDay,
  extensionWindow,
  kickstartCheckOutcome,
  kickstartDayNumber,
  kickstartUsage,
  periodDay1,
  recordsMoreKickstart,
  scheduledLastDay,
} from './kickstart';
import type { KickstartCheckRecord, KickstartPeriodRecord, Snapshot } from './records';

const id = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
let nextId = 1;
const env = { now: '2000-01-01T00:00:00.000Z', randomId: () => id(9000 + nextId++) };

/** A period whose day 1 is `day1` (UTC zone), ended early on `endedOn` when given. */
function period(n: number, day1: string, endedOn: string | null = null): KickstartPeriodRecord {
  return {
    id: id(n),
    startedAt: `${day1}T08:00:00.000Z`,
    timeZone: 'UTC',
    endedAt: endedOn === null ? null : `${endedOn}T20:00:00.000Z`,
    endedTimeZone: endedOn === null ? null : 'UTC',
    endReason: endedOn === null ? null : 'user-ended',
  };
}

/** Day N of a period starting on day1 (UTC). */
const dayOf = (day1: string, n: number) =>
  new Date(Date.parse(`${day1}T00:00:00.000Z`) + (n - 1) * 86_400_000).toISOString().slice(0, 10);

function check(
  n: number,
  p: KickstartPeriodRecord,
  date: string,
  outcome: 'extended' | 'stop-sign' = 'extended',
): KickstartCheckRecord {
  const answer = outcome === 'extended' ? 'no' : 'yes';
  return {
    id: id(n),
    periodId: p.id,
    askedAt: `${date}T12:00:00.000Z`,
    timeZone: 'UTC',
    dizzyOnStanding: answer,
    palpitations: 'no',
    crampsNotSettling: 'no',
    faintAtWork: 'no',
    energyRating: null,
    sleepRating: null,
    outcome,
  };
}

function snapshot(periods: KickstartPeriodRecord[], checks: KickstartCheckRecord[]): Snapshot {
  return { ...defaultSnapshot(env), kickstart_periods: periods, kickstart_checks: checks };
}

const D1 = '2000-03-01';

describe('Kickstart period arithmetic (section 4.5)', () => {
  const p = period(1, D1);

  it('day 1, day N, the scheduled and effective last days and the days used', () => {
    expect(periodDay1(p)).toBe(D1);
    expect(kickstartDayNumber(p, D1)).toBe(1);
    expect(kickstartDayNumber(p, '2000-03-21')).toBe(21);
    expect(scheduledLastDay(p, 0)).toBe('2000-03-21');
    expect(scheduledLastDay(p, 1)).toBe('2000-03-28');
    expect(effectiveDays(p, 0)).toBe(21);
    const ended = period(2, D1, dayOf(D1, 10));
    expect(effectiveLastDay(ended, 0)).toBe(dayOf(D1, 10));
    expect(effectiveDays(ended, 0)).toBe(10);
  });

  it('the extension window is the last 3 local days of the scheduled phase (C59; D28)', () => {
    expect(extensionWindow(p, 0)).toEqual({ from: '2000-03-19', to: '2000-03-21' });
    expect(extensionWindow(p, 1)).toEqual({ from: '2000-03-26', to: '2000-03-28' });
  });

  it('day 1 is read in the period zone: an Auckland morning is the previous UTC day', () => {
    const akl: KickstartPeriodRecord = {
      ...p,
      startedAt: '2000-02-29T19:00:00.000Z',
      timeZone: 'Pacific/Auckland',
    };
    expect(periodDay1(akl)).toBe('2000-03-01');
    expect(periodDay1({ ...akl, timeZone: 'Example/Nowhere' }, 'Australia/Sydney')).toBe(
      '2000-03-01',
    );
  });

  it('the check outcome: extended only when all four answers are no (C59, WT-09)', () => {
    const no = {
      dizzyOnStanding: 'no',
      palpitations: 'no',
      crampsNotSettling: 'no',
      faintAtWork: 'no',
    } as const;
    expect(kickstartCheckOutcome(no)).toBe('extended');
    expect(kickstartCheckOutcome({ ...no, palpitations: 'yes' })).toBe('stop-sign');
    expect(kickstartCheckOutcome({ ...no, faintAtWork: 'yes' })).toBe('stop-sign');
  });
});

describe('the extension window and the caps (C08, C59; D27, D28; section 16 test 5)', () => {
  const p = period(1, D1);

  it('a check on day 3 is too early', () => {
    expect(findInvariantViolation(snapshot([p], [check(11, p, dayOf(D1, 3))]))).toBe(
      'kickstart-check-window',
    );
  });

  it('checks on days 19 to 21 (the last 3 days) are valid; day 18 is not', () => {
    // Section 16 test 5 says "day 18 (valid, last 3 days)", but the last 3 days of a 21-day phase
    // are days 19, 20 and 21 (section 4.5, KICKSTART_OFFER_DAYS = 3), so day 18 is refused.
    for (const day of [19, 20, 21]) {
      expect(
        findInvariantViolation(snapshot([p], [check(11, p, dayOf(D1, day))])),
        `day ${day}`,
      ).toBeNull();
    }
    expect(findInvariantViolation(snapshot([p], [check(11, p, dayOf(D1, 18))]))).toBe(
      'kickstart-check-window',
    );
  });

  it('a check on day 22 of an unextended period is too late (after the natural end)', () => {
    expect(findInvariantViolation(snapshot([p], [check(11, p, dayOf(D1, 22))]))).toBe(
      'kickstart-check-window',
    );
  });

  it('a check after an early end, or after a stop-sign check in the same period, is refused', () => {
    const ended = period(2, D1, dayOf(D1, 19));
    expect(findInvariantViolation(snapshot([ended], [check(11, ended, dayOf(D1, 20))]))).toBe(
      'kickstart-check-window',
    );
    const checks = [check(11, p, dayOf(D1, 19), 'stop-sign'), check(12, p, dayOf(D1, 20))];
    expect(findInvariantViolation(snapshot([p], checks))).toBe('kickstart-stop-sign');
  });

  it('an end after the scheduled last day is refused', () => {
    expect(findInvariantViolation(snapshot([period(2, D1, dayOf(D1, 22))], []))).toBe(
      'kickstart-end',
    );
  });

  it('a 4th extension across two periods is refused', () => {
    const a = period(1, D1, dayOf(D1, 30)); // 2 extensions, ended early on day 30
    const b = period(2, '2000-05-01');
    const checks = [
      check(11, a, dayOf(D1, 19)),
      check(12, a, dayOf(D1, 26)),
      check(13, b, dayOf('2000-05-01', 19)),
      check(14, b, dayOf('2000-05-01', 26)),
    ];
    expect(findInvariantViolation(snapshot([a, b], checks))).toBe('kickstart-extensions');
    expect(canExtendKickstart({ days: 30 + 28, extensions: 3 })).toBe(false);
  });

  it('a second period after a first period with 3 extensions is refused: 42 days are used', () => {
    const a = period(1, D1);
    const checks = [
      check(11, a, dayOf(D1, 19)),
      check(12, a, dayOf(D1, 26)),
      check(13, a, dayOf(D1, 33)),
    ];
    const usage = kickstartUsage([a], checks);
    expect(usage).toEqual({ days: 42, extensions: 3 });
    expect(findInvariantViolation(snapshot([a], checks))).toBeNull();
    expect(canStartKickstart(usage)).toBe(false);
    expect(canExtendKickstart(usage)).toBe(false);
    expect(findInvariantViolation(snapshot([a, period(2, '2000-06-01')], checks))).toBe(
      'kickstart-days',
    );
  });

  it('two 21-day periods are allowed (42 in all)', () => {
    const a = period(1, D1);
    const b = period(2, '2000-04-01');
    expect(canStartKickstart(kickstartUsage([a], []))).toBe(true);
    expect(kickstartUsage([a, b], [])).toEqual({ days: 42, extensions: 0 });
    expect(findInvariantViolation(snapshot([a, b], []))).toBeNull();
    expect(canExtendKickstart(kickstartUsage([a, b], []))).toBe(false);
  });

  it('a 28-day first period then a new period is refused', () => {
    const a = period(1, D1);
    const checks = [check(11, a, dayOf(D1, 19))];
    expect(kickstartUsage([a], checks)).toEqual({ days: 28, extensions: 1 });
    expect(canStartKickstart(kickstartUsage([a], checks))).toBe(false);
    expect(findInvariantViolation(snapshot([a, period(2, '2000-04-01')], checks))).toBe(
      'kickstart-days',
    );
  });

  it('an early end on day 10, then a 21-day period with one extension (38) is allowed; a second extension (45) is not', () => {
    const a = period(1, D1, dayOf(D1, 10));
    expect(canStartKickstart(kickstartUsage([a], []))).toBe(true);
    const b = period(2, '2000-04-01');
    const one = [check(11, b, dayOf('2000-04-01', 19))];
    expect(kickstartUsage([a, b], one)).toEqual({ days: 38, extensions: 1 });
    expect(findInvariantViolation(snapshot([a, b], one))).toBeNull();
    expect(canExtendKickstart(kickstartUsage([a, b], one))).toBe(false);
    const two = [...one, check(12, b, dayOf('2000-04-01', 26))];
    expect(kickstartUsage([a, b], two)).toEqual({ days: 45, extensions: 2 });
    expect(findInvariantViolation(snapshot([a, b], two))).toBe('kickstart-days');
  });

  it('periods may not overlap: a new period starts after the previous effective last day', () => {
    const a = period(1, D1);
    expect(findInvariantViolation(snapshot([a, period(2, dayOf(D1, 21))], []))).toBe(
      'kickstart-overlap',
    );
    expect(findInvariantViolation(snapshot([a, period(2, dayOf(D1, 22))], []))).toBeNull();
  });

  it('a check whose period is missing is refused', () => {
    const a = period(1, D1);
    expect(findInvariantViolation(snapshot([], [check(11, a, dayOf(D1, 19))]))).toBe(
      'kickstart-check-period',
    );
  });
});

describe('recordsMoreKickstart: a restore never lowers the Kickstart history (D27; orchestrator ruling A)', () => {
  const a = period(1, D1);
  const short = period(2, D1, dayOf(D1, 10));
  const history = (periods: KickstartPeriodRecord[], checks: KickstartCheckRecord[] = []) => ({
    periods,
    checks,
  });

  it('compares the days first, then the extensions, then the latest stop-sign check', () => {
    expect(recordsMoreKickstart(history([a]), history([]))).toBe(true);
    expect(recordsMoreKickstart(history([]), history([a]))).toBe(false);
    expect(recordsMoreKickstart(history([a]), history([short]))).toBe(true);
    // The same history on both sides is not more.
    const ext = [check(11, a, dayOf(D1, 19))];
    expect(recordsMoreKickstart(history([a], ext), history([a], ext))).toBe(false);
    // As many days (ended on day 20) but one more extension: the 3-extension cap counts.
    const ended = period(3, D1, dayOf(D1, 20));
    const extended = history([ended], [check(14, ended, dayOf(D1, 19))]);
    expect(kickstartUsage(extended.periods, extended.checks)).toEqual({ days: 20, extensions: 1 });
    expect(recordsMoreKickstart(extended, history([ended]))).toBe(true);
    expect(recordsMoreKickstart(history([ended]), extended)).toBe(false);
    // As many days and extensions, but only one side has a stop sign: that side records more.
    const stopped = [check(12, a, dayOf(D1, 20), 'stop-sign')];
    expect(recordsMoreKickstart(history([a], stopped), history([a]))).toBe(true);
    expect(recordsMoreKickstart(history([a]), history([a], stopped))).toBe(false);
    const later = [check(13, a, dayOf(D1, 21), 'stop-sign')];
    expect(recordsMoreKickstart(history([a], later), history([a], stopped))).toBe(true);
  });
});
