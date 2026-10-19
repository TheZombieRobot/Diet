import { describe, expect, it } from 'vitest';
import {
  boundaryMinutes,
  CARD_IDS,
  CARD_REGISTRY,
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
