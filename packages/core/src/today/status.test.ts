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
    stopSignPause: false,
    ...input,
  });

describe('after a Kickstart stop-sign answer (F20, F7; HEALTH_SAFETY sections 2 and 3)', () => {
  it('no window time is named: fasting or not, the line says it is fine to eat now', () => {
    const running = [fast(at('2000-03-14', '19:00'))];
    expect(status({ now: at(D, '09:00'), fasts: running, stopSignPause: true })).toEqual({
      kind: 'fasting',
      elapsedMinutes: 14 * 60,
      window: { kind: 'eat-now' },
    });
    expect(status({ now: at(D, '14:20'), stopSignPause: true })).toEqual({
      kind: 'not-fasting',
      window: { kind: 'eat-now' },
    });
    // The over-24-hours sentence still comes first.
    const long = [fast(at('2000-03-14', '08:00'))];
    expect(status({ now: at(D, '09:00'), fasts: long, stopSignPause: true }).kind).toBe(
      'over-ceiling',
    );
  });
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

  it.each([
    // 16:8 from noon, started 12:50 pm: 11:55 am the next day is 23 h 5 m, before the window.
    ['before the window', '12:00', '20:00', '12:50', '11:55', 23 * 60 + 5],
    // With the window open, whose end is past the 24-hour point (review finding, high): 23:1
    // until 7:00 pm (24 h 30 m), 22:2 until 7:00 pm (25 h 30 m) and 16:8 until 8:00 pm (31 h 10 m).
    ['in a 23:1 window', '18:00', '19:00', '18:30', '18:10', 23 * 60 + 40],
    ['in a 22:2 window', '17:00', '19:00', '17:30', '17:05', 23 * 60 + 35],
    ['in a 16:8 window', '12:00', '20:00', '12:50', '12:05', 23 * 60 + 15],
    // Started at 7:00 pm, so the 23:1 window opens at 23 hours and ends at exactly 24.
    [
      'at the opening of a 23:1 window ending at 24 hours',
      '18:00',
      '19:00',
      '19:00',
      '18:10',
      1390,
    ],
  ] as const)(
    'from 23 hours, %s: it is fine to eat now, as the Fast card says, and no time is named',
    (_, start, end, began, now, elapsedMinutes) => {
      const s = status({
        now: at('2000-03-16', now),
        schedule: schedule({ start, end }),
        fasts: [fast(at(D, began))],
      });
      expect(s).toEqual({ kind: 'fasting', elapsedMinutes, window: { kind: 'eat-now' } });
    },
  );

  it('never names a time past the 24-hour point, and from 23 hours says to eat now (C30)', () => {
    // 23:1, 22:2, 16:8 and a window over midnight; starts every 90 minutes, checked every 25.
    const windows: EatingWindow[] = [
      ONE_MEAL,
      SNACK,
      { start: '12:00', end: '20:00' },
      { start: '22:00', end: '02:00' },
    ];
    for (const window of windows) {
      for (let startMin = 0; startMin < 24 * 60; startMin += 90) {
        const startMs = Date.parse(at(D, '00:00')) + startMin * MIN;
        for (let elapsed = 0; elapsed <= 24 * 60; elapsed += 25) {
          const s = status({
            now: new Date(startMs + elapsed * MIN).toISOString(),
            schedule: schedule(window),
            fasts: [fast(new Date(startMs).toISOString())],
          });
          if (s.kind !== 'fasting' || s.window === null) continue;
          const where = `${window.start}-${window.end}, ${startMin} + ${elapsed} min`;
          if ('at' in s.window) {
            expect(Date.parse(s.window.at) - startMs, where).toBeLessThanOrEqual(24 * HOUR);
          }
          if (elapsed >= 23 * 60) expect(s.window.kind, where).toBe('eat-now');
        }
      }
    }
  });

  it('a window open now names its end only when that is within 24 hours of the start', () => {
    // 22:2 and started 7:30 pm: at 5:10 pm the window closes at 7:00 pm, 23 h 30 m after it.
    expect(
      status({
        now: at(D, '17:10'),
        schedule: schedule(SNACK),
        fasts: [fast(at('2000-03-14', '19:30'))],
      }),
    ).toEqual({
      kind: 'fasting',
      elapsedMinutes: 21 * 60 + 40,
      window: { kind: 'open-until', at: '2000-03-15T06:00:00.000Z' },
    });
    // 16:8 and started 6:00 pm, inside the window: at 1:00 pm the window closes at 8:00 pm, 26 h
    // after it, so its end is not named.
    expect(
      status({
        now: at(D, '13:00'),
        schedule: schedule({ start: '12:00', end: '20:00' }),
        fasts: [fast(at('2000-03-14', '18:00'))],
      }),
    ).toEqual({ kind: 'fasting', elapsedMinutes: 19 * 60, window: { kind: 'open-now' } });
  });

  it('a start dated ahead counts as 0; no pattern gives no window', () => {
    expect(status({ now: at(D, '14:20'), fasts: [fast(at(D, '15:00'))] })).toMatchObject({
      kind: 'fasting',
      elapsedMinutes: 0,
    });
    expect(
      status({ now: iso(startMs + 2 * HOUR), schedule: schedule(null), fasts: [fast(started)] }),
    ).toEqual({ kind: 'fasting', elapsedMinutes: 120, window: null });
  });
});
