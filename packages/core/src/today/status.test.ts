import { describe, expect, it } from 'vitest';
import { type EatingWindow, parseClockTime } from '../fasting/eatingWindow';
import type { FastTimes } from '../fasting/fastState';
import type { Schedule } from '../fasting/windows';
import { zonedWallTimeToInstant } from '../util/time';
import { todayStatus, type TodayStatusInput } from './status';

// Synthetic: Pacific/Auckland, Wednesday 15 March 2000 (NZDT, UTC+13), and the April 2026
// daylight-saving night.
const NZ = 'Pacific/Auckland';
const MIN = 60_000;
const HOUR = 3_600_000;
const at = (date: string, time: string): string =>
  new Date(zonedWallTimeToInstant(date, parseClockTime(time), NZ)).toISOString();
const D = '2000-03-15';
const ONE_MEAL: EatingWindow = { start: '18:00', end: '19:00' };
const SNACK: EatingWindow = { start: '17:00', end: '19:00' };

const schedule = (
  standing: EatingWindow | null,
  overrides: Record<string, EatingWindow> = {},
): Schedule => ({ standing, switchTo: null, overrides });

const fast = (startedAt: string, endedAt: string | null = null, id = 'f1'): FastTimes => ({
  id,
  startedAt,
  endedAt,
  timeZone: NZ,
  endedTimeZone: endedAt === null ? null : NZ,
});

const status = (input: Partial<TodayStatusInput> & Pick<TodayStatusInput, 'now'>) =>
  todayStatus({
    timeZone: NZ,
    fastingGated: false,
    schedule: schedule(ONE_MEAL),
    fasts: [],
    ...input,
  });

describe('todayStatus with no fast running (U1; TD-07, HS-17)', () => {
  it('23:1: the window opens later today, is open until 7 pm, then opens tomorrow', () => {
    expect(status({ now: at(D, '14:20') })).toEqual({
      kind: 'not-fasting',
      window: { kind: 'opens-today', at: '2000-03-15T05:00:00.000Z' },
    });
    expect(status({ now: at(D, '18:00') })).toEqual({
      kind: 'not-fasting',
      window: { kind: 'open-until', at: '2000-03-15T06:00:00.000Z' },
    });
    expect(status({ now: at(D, '19:00') })).toEqual({
      kind: 'not-fasting',
      window: { kind: 'opens-tomorrow', at: '2000-03-16T05:00:00.000Z' },
    });
  });

  it('"Snack window" only for a 5 pm window that holds the snack (T4)', () => {
    const now = at(D, '14:20');
    expect(status({ now, schedule: schedule(SNACK) })).toMatchObject({
      window: { kind: 'snack-opens', at: '2000-03-15T04:00:00.000Z' },
    });
    // 23:1 with the snack added for today (item 15's per-day change; T5).
    expect(status({ now, schedule: schedule(ONE_MEAL, { [D]: SNACK }) })).toMatchObject({
      window: { kind: 'snack-opens', at: '2000-03-15T04:00:00.000Z' },
    });
    // A one-meal window at 5 pm is not the snack.
    expect(status({ now, schedule: schedule({ start: '17:00', end: '18:00' }) })).toMatchObject({
      window: { kind: 'opens-today' },
    });
  });

  it('a window that wraps past midnight: open at 1 am until 2 am, then opens at 10 pm', () => {
    const wrap = schedule({ start: '22:00', end: '02:00' });
    expect(status({ now: at(D, '01:00'), schedule: wrap })).toEqual({
      kind: 'not-fasting',
      window: { kind: 'open-until', at: at(D, '02:00') },
    });
    expect(status({ now: at(D, '03:00'), schedule: wrap })).toEqual({
      kind: 'not-fasting',
      window: { kind: 'opens-today', at: at(D, '22:00') },
    });
  });

  it('no line with no pattern, or while fasting is gated with a stored window (HS-03)', () => {
    expect(status({ now: at(D, '14:20'), schedule: schedule(null) })).toEqual({ kind: 'none' });
    expect(status({ now: at(D, '14:20'), fastingGated: true })).toEqual({ kind: 'none' });
  });
});

describe('todayStatus with a fast running (U2; HS-02, HS-03, RD-06, C30, HS-18, TD-07)', () => {
  const started = '2000-03-14T06:00:00.000Z'; // 7:00 pm on 14 March
  const startMs = Date.parse(started);
  const iso = (ms: number) => new Date(ms).toISOString();

  it('reports the time fasted and the next window', () => {
    expect(status({ now: '2000-03-15T01:20:00.000Z', fasts: [fast(started)] })).toEqual({
      kind: 'fasting',
      elapsedMinutes: 1160,
      window: { kind: 'opens-today', at: '2000-03-15T05:00:00.000Z' },
    });
  });

  it('is over the ceiling strictly after 24 hours: 24:00:00.000 is not, 24:00:00.001 is', () => {
    expect(status({ now: iso(startMs + 24 * HOUR), fasts: [fast(started)] }).kind).toBe('fasting');
    expect(status({ now: iso(startMs + 24 * HOUR + 1), fasts: [fast(started)] })).toEqual({
      kind: 'over-ceiling',
      elapsedMinutes: 1440,
    });
  });

  it('over 24 hours the warning shows even while fasting is gated; otherwise gated is "still open"', () => {
    const fasts = [fast(started)];
    expect(status({ now: iso(startMs + 25 * HOUR), fasts, fastingGated: true })).toEqual({
      kind: 'over-ceiling',
      elapsedMinutes: 1500,
    });
    expect(status({ now: iso(startMs + 2 * HOUR), fasts, fastingGated: true })).toEqual({
      kind: 'open-while-off',
      elapsedMinutes: 120,
    });
    expect(status({ now: iso(startMs + 2 * HOUR), fastingGated: true })).toEqual({ kind: 'none' });
  });

  it('fasts under an hour apart are one span, so a restart cannot get round the ceiling', () => {
    const firstEnd = startMs + 20 * HOUR;
    const fasts = [fast(started, iso(firstEnd), 'a'), fast(iso(firstEnd + 10 * MIN), null, 'b')];
    expect(status({ now: iso(firstEnd + 10 * MIN + 5 * HOUR), fasts })).toEqual({
      kind: 'over-ceiling',
      elapsedMinutes: 25 * 60 + 10,
    });
  });

  it('never names a window that would carry the fast past 24 hours: an earlier dinner', () => {
    // Started 5:30 pm, so the next window (6:00 pm tomorrow) is 24 h 30 m after the start.
    const s = status({ now: at(D, '19:30'), fasts: [fast(at(D, '17:30'))] });
    expect(s).toEqual({ kind: 'fasting', elapsedMinutes: 120, window: { kind: 'widen' } });
  });

  it('never names a window that would carry the fast past 24 hours: the April night', () => {
    // 6:59 pm NZDT on 4 April 2026; the 6:00 pm NZST window on 5 April is 24 h 1 m later.
    const s = status({
      now: '2026-04-04T06:29:00.000Z',
      fasts: [fast('2026-04-04T05:59:00.000Z')],
    });
    expect(s).toEqual({ kind: 'fasting', elapsedMinutes: 30, window: { kind: 'widen' } });
  });

  it('within 23 hours of the window, an ordinary 7:00 pm start names tomorrow', () => {
    expect(status({ now: at(D, '19:30'), fasts: [fast(at(D, '19:00'))] })).toEqual({
      kind: 'fasting',
      elapsedMinutes: 30,
      window: { kind: 'opens-tomorrow', at: '2000-03-16T05:00:00.000Z' },
    });
  });

  it('close to 24 hours names no time: item 15 says it is fine to eat now', () => {
    // 16:8 from noon; started 12:50 pm, so 11:55 am the next day is 23 h 5 m, before the window.
    const s = status({
      now: at('2000-03-16', '11:55'),
      schedule: schedule({ start: '12:00', end: '20:00' }),
      fasts: [fast(at(D, '12:50'))],
    });
    expect(s).toEqual({ kind: 'fasting', elapsedMinutes: 23 * 60 + 5, window: { kind: 'widen' } });
  });

  it('a window open now; a start dated ahead counts as 0; no pattern gives no window', () => {
    expect(status({ now: at(D, '18:10'), fasts: [fast(started)] })).toMatchObject({
      kind: 'fasting',
      window: { kind: 'open-until', at: '2000-03-15T06:00:00.000Z' },
    });
    expect(status({ now: at(D, '14:20'), fasts: [fast(at(D, '15:00'))] })).toMatchObject({
      kind: 'fasting',
      elapsedMinutes: 0,
    });
    expect(
      status({ now: iso(startMs + 2 * HOUR), schedule: schedule(null), fasts: [fast(started)] }),
    ).toEqual({ kind: 'fasting', elapsedMinutes: 120, window: null });
  });
});
