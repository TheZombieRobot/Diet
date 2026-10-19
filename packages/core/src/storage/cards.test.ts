import { describe, expect, it } from 'vitest';
import {
  boundaryMinutes,
  CARD_IDS,
  CARD_REGISTRY,
  cardHidden,
  cardNextChange,
  type CardStateTimes,
  cardTrigger,
  collapsedUntil,
  extensionOfferTrigger,
  triggerMatches,
  updateNoticeTrigger,
} from './cards';

const PERIOD = '00000000-0000-4000-8000-000000000065';

describe('the card registry (section 4.12; C44; D43)', () => {
  it('lists every card, each with at least one trigger, and every trigger has a dismissal rule (section 16 test 18)', () => {
    expect(Object.keys(CARD_REGISTRY).sort()).toEqual([...CARD_IDS].sort());
    for (const [cardId, triggers] of Object.entries(CARD_REGISTRY)) {
      expect(triggers.length, cardId).toBeGreaterThan(0);
      for (const t of triggers) {
        expect(
          ['backup-snooze', 'returns-after', 'collapsed', 'final'],
          `${cardId} ${t.pattern}`,
        ).toContain(t.dismissal.kind);
      }
    }
  });

  it('the rapid-loss card is only ever collapsed for the day, never hidden longer (C46)', () => {
    expect(CARD_REGISTRY['rapid-loss']).toEqual([
      { pattern: 'steady', dismissal: { kind: 'collapsed', boundary: 'calendar-midnight' } },
    ]);
  });

  it('the HS-06 alcohol-help triggers, the withdrawal tick included, collapse to the next drinking day (C44; D43)', () => {
    for (const trigger of ['consecutive-days', 'double-guidance', 'withdrawal-tick']) {
      expect(cardTrigger('alcohol-help', trigger)?.dismissal).toEqual({
        kind: 'collapsed',
        boundary: 'drinking-day-cutover',
      });
    }
    expect(cardTrigger('alcohol-help', 'readiness-q7')?.dismissal).toEqual({
      kind: 'returns-after',
      hours: 720,
    });
    expect(cardTrigger('reflux-gp-nudge', 'rolling')?.dismissal).toEqual({
      kind: 'returns-after',
      hours: 168,
    });
  });

  it('matches the trigger patterns, and refuses anything unregistered', () => {
    expect(triggerMatches('period:<Id>', `period:${PERIOD}`)).toBe(true);
    expect(triggerMatches('period:<Id>', 'period:seed:x')).toBe(false);
    expect(triggerMatches('period:<Id>:<n>', extensionOfferTrigger(PERIOD, 2))).toBe(true);
    expect(triggerMatches('period:<Id>:<n>', `period:${PERIOD}:3`)).toBe(false);
    expect(triggerMatches('date:<LocalDate>', 'date:2000-02-29')).toBe(true);
    expect(triggerMatches('date:<LocalDate>', 'date:2001-02-29')).toBe(false);
    expect(triggerMatches('v<N>', updateNoticeTrigger(2))).toBe(true);
    expect(triggerMatches('v<N>', 'v9999')).toBe(true);
    expect(triggerMatches('v<N>', 'v1')).toBe(false);
    expect(triggerMatches('v<N>', 'v10000')).toBe(false);
    expect(triggerMatches('v<N>', 'v02')).toBe(false);
    expect(cardTrigger('steady-explainer', `period:${PERIOD}`)?.dismissal).toEqual({
      kind: 'final',
    });
    expect(cardTrigger('steady-explainer', 'once')).toBeNull();
    expect(cardTrigger('no-such-card', 'once')).toBeNull();
    expect(cardTrigger('toString', 'once')).toBeNull();
  });
});

describe('collapsed for the day (section 3.5; D9)', () => {
  const dismissedAt = '2000-01-10T09:00:00.000Z'; // 22:00 on 10 January in Auckland

  it('a dismissal at 22:00 in Auckland ends at the next Auckland midnight, wherever it is read', () => {
    // collapsedUntil takes no reading zone: the end is a fixed instant, so reading it in Honolulu
    // gives the same moment.
    expect(new Date(collapsedUntil(dismissedAt, 'Pacific/Auckland', 0)).toISOString()).toBe(
      '2000-01-10T11:00:00.000Z',
    );
  });

  it('the alcohol-help boundary uses the drinking-day cut-over', () => {
    const boundary = boundaryMinutes('drinking-day-cutover', 300);
    expect(new Date(collapsedUntil(dismissedAt, 'Pacific/Auckland', boundary)).toISOString()).toBe(
      '2000-01-10T16:00:00.000Z',
    );
    // Dismissed at 03:00, before the cut-over: back at 05:00 the same morning.
    expect(
      new Date(
        collapsedUntil('2000-01-10T14:00:00.000Z', 'Pacific/Auckland', boundary),
      ).toISOString(),
    ).toBe('2000-01-10T16:00:00.000Z');
    expect(boundaryMinutes('calendar-midnight', 300)).toBe(0);
  });

  it('an unknown dismissal zone falls back to the home zone instead of throwing', () => {
    expect(new Date(collapsedUntil(dismissedAt, 'Example/Nowhere', 0)).toISOString()).toBe(
      '2000-01-10T11:00:00.000Z',
    );
  });
});

describe('cardHidden: each card follows its own dismissal rule, never fooled by a date ahead (C44, C46; D26)', () => {
  const rapidLoss = cardTrigger('rapid-loss', 'steady');
  const helpQ7 = cardTrigger('alcohol-help', 'readiness-q7');
  const helpDays = cardTrigger('alcohol-help', 'consecutive-days');
  const once = cardTrigger('weight-fluctuation-explainer', 'once');
  if (rapidLoss === null || helpQ7 === null || helpDays === null || once === null) {
    throw new Error('registry');
  }
  const row = (patch: Partial<CardStateTimes>): CardStateTimes => ({
    dismissedAt: null,
    dismissedTimeZone: null,
    doneAt: null,
    ...patch,
  });
  const hidden = (dismissal: typeof once.dismissal, r: CardStateTimes, now: string) =>
    cardHidden({ now, row: r, dismissal, drinkingDayCutoverMinutes: 300 });
  // 22:00 on 10 January 2000 in Auckland.
  const evening = row({
    dismissedAt: '2000-01-10T09:00:00.000Z',
    dismissedTimeZone: 'Pacific/Auckland',
  });

  it('rapid-loss: hidden until the next local midnight, then back', () => {
    expect(hidden(rapidLoss.dismissal, evening, '2000-01-10T10:59:00.000Z')).toBe(true);
    expect(hidden(rapidLoss.dismissal, evening, '2000-01-10T11:00:00.000Z')).toBe(false);
    expect(hidden(rapidLoss.dismissal, row({}), '2000-01-10T10:00:00.000Z')).toBe(false);
    expect(hidden(rapidLoss.dismissal, undefined as never, '2000-01-10T10:00:00.000Z')).toBe(false);
  });

  it('an imported 2099 dismissal of rapid-loss and of alcohol-help is ignored, so both cards show', () => {
    const ahead = row({
      dismissedAt: '2099-12-30T10:00:00.000Z',
      dismissedTimeZone: 'Pacific/Auckland',
    });
    for (const dismissal of [rapidLoss.dismissal, helpQ7.dismissal, helpDays.dismissal]) {
      expect(hidden(dismissal, ahead, '2000-03-02T00:00:00.000Z')).toBe(false);
    }
  });

  it('a clock one year ahead at the dismissal, then corrected: the card is back at once', () => {
    const fromTheFuture = row({
      dismissedAt: '2001-01-10T09:00:00.000Z',
      dismissedTimeZone: 'Pacific/Auckland',
    });
    expect(hidden(rapidLoss.dismissal, fromTheFuture, '2000-01-10T09:30:00.000Z')).toBe(false);
  });

  it('alcohol-help (readiness-q7) returns 30 days after a dismissal; the HS-06 triggers at the next drinking-day cut-over', () => {
    expect(hidden(helpQ7.dismissal, evening, '2000-02-09T08:59:00.000Z')).toBe(true);
    expect(hidden(helpQ7.dismissal, evening, '2000-02-09T09:00:00.000Z')).toBe(false);
    expect(hidden(helpDays.dismissal, evening, '2000-01-10T15:59:00.000Z')).toBe(true);
    expect(hidden(helpDays.dismissal, evening, '2000-01-10T16:00:00.000Z')).toBe(false);
  });

  it('done counts only for final cards: a doneAt on rapid-loss or alcohol-help never hides them', () => {
    const done = row({ doneAt: '2000-01-01T00:00:00.000Z' });
    expect(hidden(rapidLoss.dismissal, done, '2000-03-01T00:00:00.000Z')).toBe(false);
    expect(hidden(helpQ7.dismissal, done, '2000-03-01T00:00:00.000Z')).toBe(false);
    expect(hidden(once.dismissal, done, '2000-03-01T00:00:00.000Z')).toBe(true);
    // A final card done or dismissed in the future is still shown until that moment.
    expect(
      hidden(
        once.dismissal,
        row({ doneAt: '2099-01-01T00:00:00.000Z' }),
        '2000-03-01T00:00:00.000Z',
      ),
    ).toBe(false);
    expect(hidden(once.dismissal, evening, '2000-01-10T09:00:00.000Z')).toBe(true);
  });

  it('the backup snooze lasts its length from a dismissal in the past only', () => {
    const snooze = { kind: 'backup-snooze' } as const;
    const input = (now: string, dismissedAt: string) =>
      cardHidden({
        now,
        row: row({ dismissedAt }),
        dismissal: snooze,
        drinkingDayCutoverMinutes: 0,
        snoozeMs: 86_400_000,
      });
    expect(input('2000-01-01T12:00:00.000Z', '2000-01-01T00:00:00.000Z')).toBe(true);
    expect(input('2000-01-02T00:00:00.000Z', '2000-01-01T00:00:00.000Z')).toBe(false);
    expect(input('2000-01-01T12:00:00.000Z', '2000-06-01T00:00:00.000Z')).toBe(false);
  });

  it('cardNextChange names the next moment a card can come back or go, and nothing changes before it', () => {
    const next = (dismissal: typeof once.dismissal, r: CardStateTimes, now: string) =>
      cardNextChange({ now, row: r, dismissal, drinkingDayCutoverMinutes: 300 });
    const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());
    // Collapsed until the next Auckland midnight; back 30 days later; a done time dated ahead.
    expect(iso(next(rapidLoss.dismissal, evening, '2000-01-10T09:30:00.000Z'))).toBe(
      '2000-01-10T11:00:00.000Z',
    );
    expect(iso(next(helpQ7.dismissal, evening, '2000-01-10T09:30:00.000Z'))).toBe(
      '2000-02-09T09:00:00.000Z',
    );
    const doneAhead = row({ doneAt: '2000-06-01T00:00:00.000Z' });
    expect(iso(next(once.dismissal, doneAhead, '2000-03-01T00:00:00.000Z'))).toBe(
      '2000-06-01T00:00:00.000Z',
    );
    expect(
      next(once.dismissal, row({ doneAt: '2000-01-01T00:00:00.000Z' }), '2000-03-01T00:00:00.000Z'),
    ).toBeNull();
    expect(next(rapidLoss.dismissal, null as never, '2000-03-01T00:00:00.000Z')).toBeNull();
    // Between now and the next change, the answer stays the same.
    const rows = [evening, doneAhead, row({ dismissedAt: '2000-01-12T00:00:00.000Z' })];
    for (const dismissal of [
      rapidLoss.dismissal,
      helpQ7.dismissal,
      helpDays.dismissal,
      once.dismissal,
    ]) {
      for (const r of rows) {
        let now = Date.parse('2000-01-09T00:00:00.000Z');
        const end = Date.parse('2000-07-01T00:00:00.000Z');
        while (now < end) {
          const change = next(dismissal, r, new Date(now).toISOString()) ?? end;
          const shown = hidden(dismissal, r, new Date(now).toISOString());
          for (let t = now; t < change && t < end; t += 3_600_000 * 7) {
            expect(hidden(dismissal, r, new Date(t).toISOString())).toBe(shown);
          }
          now = change;
        }
      }
    }
  });
});
