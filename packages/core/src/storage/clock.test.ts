// The phone's clock against the records (storage spec sections 3.1, 8.2 and 12.3; D27; the
// health-rules review): the high-water mark, a start dated after now, and the bookkeeping clamp.
import { describe, expect, it } from 'vitest';
import { clampFutureBookkeeping, futureStartField, latestAcceptedMs } from './bookkeeping';
import {
  clockHighWater,
  elapsedDaysSince,
  elapsedStartAt,
  isClockBehind,
  notBeforeAny,
} from './clock';
import { FUTURE_INSTANT_TOLERANCE_MS } from './limits';

const DAY = 86_400_000;
const at = (date: string) => `${date}T00:00:00.000Z`;

describe('clockHighWater and isClockBehind (D27; section 8.2)', () => {
  it('is the newest event or bookkeeping instant in any store, ignoring transfer times', () => {
    const tables = {
      weights: [{ at: at('2000-03-05') }, { at: at('2000-03-09') }],
      kickstart_periods: [{ startedAt: at('2000-03-01'), endedAt: null }],
      card_state: [{ dismissedAt: at('2000-03-07'), doneAt: null, firstShownAt: null }],
      grocery_lists: [{ updatedAt: at('2000-03-02'), laptopReceivedAt: at('2099-01-01') }],
      settings: [null, 'not a row'],
    };
    expect(clockHighWater(tables)).toBe(at('2000-03-09'));
    expect(clockHighWater({ settings: [{ lastBackupAt: at('2000-03-10') }] })).toBe(
      at('2000-03-10'),
    );
    expect(clockHighWater({ weights: [] })).toBeNull();
  });

  it('the clock is behind only when now is earlier than it by more than the tolerance', () => {
    const high = at('2000-03-09');
    const ms = Date.parse(high);
    expect(isClockBehind(new Date(ms - FUTURE_INSTANT_TOLERANCE_MS).toISOString(), high)).toBe(
      false,
    );
    expect(isClockBehind(new Date(ms - FUTURE_INSTANT_TOLERANCE_MS - 1).toISOString(), high)).toBe(
      true,
    );
    expect(isClockBehind(at('2000-01-01'), null)).toBe(false);
    expect(notBeforeAny(at('2000-03-01'), null, at('2000-03-09'), at('2000-03-05'))).toBe(
      at('2000-03-09'),
    );
  });
});

describe('a start dated after now is read as now (C72, C109)', () => {
  it('elapsedStartAt and elapsedDaysSince', () => {
    const now = at('2000-03-01');
    expect(elapsedStartAt(at('2099-01-01'), now)).toBe(now);
    expect(elapsedStartAt(at('2000-01-01'), now)).toBe(at('2000-01-01'));
    expect(elapsedStartAt(null, now)).toBeNull();
    // A start dated ahead counts as just begun, never as a negative or huge number of days.
    expect(elapsedDaysSince(at('2099-01-01'), now)).toBe(0);
    expect(elapsedDaysSince(at('2000-01-05'), now)).toBe(56);
    expect(elapsedDaysSince(new Date(Date.parse(now) - 56 * DAY + 1).toISOString(), now)).toBe(55);
    expect(elapsedDaysSince(null, now)).toBeNull();
  });
});

describe('import and export limits (section 12.3)', () => {
  const exported = at('2000-03-02');
  it('the limit is the earlier of the export and now, plus the tolerance', () => {
    expect(latestAcceptedMs(exported, at('2000-03-05'))).toBe(
      Date.parse(exported) + FUTURE_INSTANT_TOLERANCE_MS,
    );
    expect(latestAcceptedMs(exported, at('2000-03-01'))).toBe(
      Date.parse(at('2000-03-01')) + FUTURE_INSTANT_TOLERANCE_MS,
    );
  });

  it('a bookkeeping time dated ahead is put back to the limit, never before the row’s own event time; nothing else changes', () => {
    const limit = latestAcceptedMs(exported, exported);
    const card = { cardId: 'rapid-loss', dismissedAt: at('2099-01-01'), doneAt: null };
    expect(clampFutureBookkeeping('card_state', card, limit)).toEqual({
      row: { ...card, dismissedAt: new Date(limit).toISOString() },
      clamped: ['dismissedAt'],
    });
    // updatedAt may not come before enteredAt, an event time that is not clamped.
    const note = { enteredAt: at('2000-04-01'), updatedAt: at('2000-05-01') };
    expect(clampFutureBookkeeping('alcohol_day_notes', note, limit).row).toEqual({
      enteredAt: at('2000-04-01'),
      updatedAt: at('2000-04-01'),
    });
    const inside = { dismissedAt: new Date(limit).toISOString() };
    expect(clampFutureBookkeeping('card_state', inside, limit)).toEqual({
      row: inside,
      clamped: [],
    });
    expect(clampFutureBookkeeping('weights', { at: at('2099-01-01') }, limit).clamped).toEqual([]);
  });

  it('a Kickstart start, a Kickstart check or a fast start dated ahead is named', () => {
    const limit = latestAcceptedMs(exported, exported);
    expect(futureStartField('kickstart_periods', { startedAt: at('2000-03-03') }, limit)).toBe(
      'startedAt',
    );
    expect(futureStartField('kickstart_checks', { askedAt: at('2000-03-03') }, limit)).toBe(
      'askedAt',
    );
    expect(futureStartField('fasts', { startedAt: at('2000-03-03') }, limit)).toBe('startedAt');
    expect(futureStartField('fasts', { startedAt: at('2000-03-02') }, limit)).toBeNull();
    expect(futureStartField('weights', { at: at('2099-01-01') }, limit)).toBeNull();
  });
});
