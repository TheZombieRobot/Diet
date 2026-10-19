// Cross-record invariants over the fixture (section 5; section 16 test 4). The Kickstart window
// and cap cases (test 5) are in packages/core/src/storage/kickstart.test.ts.
import { findInvariantViolation, type GardenPhotoRecord, type InvariantSnapshot } from '@diet/core';
import { describe, expect, it } from 'vitest';
import { fixtureId, snapshotV1 } from './snapshotV1';

type Tables = Record<string, Record<string, unknown>[]>;
const base = (): Tables => structuredClone(snapshotV1) as unknown as Tables;
const violation = (tables: Tables) =>
  findInvariantViolation(tables as unknown as InvariantSnapshot);

describe('cross-record invariants (section 5; section 16 test 4)', () => {
  it('the fixture breaks none', () => {
    expect(findInvariantViolation(snapshotV1)).toBeNull();
  });

  it('singletons: exactly one profile, targets and settings row, with id singleton', () => {
    const t = base();
    t.profile = [];
    expect(violation(t)).toBe('singleton');
    const two = base();
    two.targets = [...(two.targets ?? []), ...(two.targets ?? [])];
    expect(violation(two)).toBe('singleton');
  });

  it('duplicate primary keys are refused, never "last copy wins"', () => {
    const t = base();
    t.weights = [...(t.weights ?? []), { ...(t.weights?.[1] ?? {}), kg: 90 }];
    expect(violation(t)).toBe('unique-key');
    const cards = base();
    cards.card_state = [...(cards.card_state ?? []), { ...(cards.card_state?.[0] ?? {}) }];
    expect(violation(cards)).toBe('unique-key');
    const days = base();
    days.steps_log = [...(days.steps_log ?? []), { ...(days.steps_log?.[0] ?? {}) }];
    expect(violation(days)).toBe('unique-key');
  });

  it('fasts: two running fasts are refused, and a running fast must be the latest', () => {
    const t = base();
    t.fasts = (t.fasts ?? []).map((f) => ({ ...f, endedAt: null, endedTimeZone: null }));
    expect(violation(t)).toBe('fast-running');
    const early = base();
    early.fasts = (early.fasts ?? []).map((f, i) =>
      i === 0 ? { ...f, endedAt: null, endedTimeZone: null } : f,
    );
    expect(violation(early)).toBe('fast-running');
  });

  it('fasts: overlapping fasts are refused', () => {
    const t = base();
    t.fasts = (t.fasts ?? []).map((f, i) =>
      i === 1 ? { ...f, startedAt: '2000-01-02T04:00:00.000Z' } : f,
    );
    expect(violation(t)).toBe('fast-overlap');
  });

  it('weights: two onboarding rows are refused', () => {
    const t = base();
    t.weights = (t.weights ?? []).map((w, i) => (i === 1 ? { ...w, source: 'onboarding' } : w));
    expect(violation(t)).toBe('weight-onboarding');
  });

  it('Kickstart: a check whose period is missing, overlapping periods, an end after the scheduled last day', () => {
    const missing = base();
    missing.kickstart_checks = (missing.kickstart_checks ?? []).map((c) => ({
      ...c,
      periodId: fixtureId(999),
    }));
    expect(violation(missing)).toBe('kickstart-check-period');

    const overlap = base();
    overlap.kickstart_periods = (overlap.kickstart_periods ?? []).map((p, i) =>
      i === 1 ? { ...p, startedAt: '2000-01-04T20:00:00.000Z' } : p,
    );
    expect(violation(overlap)).toBe('kickstart-overlap');

    const late = base();
    late.kickstart_periods = (late.kickstart_periods ?? []).map((p, i) =>
      i === 2 ? { ...p, endedAt: '2000-02-10T12:00:00.000Z' } : p,
    );
    expect(violation(late)).toBe('kickstart-end');
  });

  it('an end after the scheduled last day is refused in the start zone as well as where it ended (rule 5c; D27)', () => {
    const only = (period: Record<string, unknown>): Tables => ({
      ...base(),
      kickstart_periods: [period],
      kickstart_checks: [],
    });
    // Day 1 is 2 January in Kiritimati, so the last day is 22 January. The end is still 22
    // January in Pago Pago, where it was made, but already 23 January in Kiritimati.
    const startZone = {
      id: fixtureId(3801),
      startedAt: '2000-01-01T10:00:00.000Z',
      timeZone: 'Pacific/Kiritimati',
      endedAt: '2000-01-22T11:00:00.000Z',
      endedTimeZone: 'Pacific/Pago_Pago',
      endReason: 'user-ended',
    };
    expect(violation(only(startZone))).toBe('kickstart-end');
    expect(violation(only({ ...startZone, endedAt: '2000-01-22T09:59:00.000Z' }))).toBeNull();
    // The mirror: day 1 is 1 January in Pago Pago, the last day 21 January; the end is still 21
    // January there, but already 23 January in Kiritimati, where it was made.
    const endZone = {
      ...startZone,
      startedAt: '2000-01-01T12:00:00.000Z',
      timeZone: 'Pacific/Pago_Pago',
      endedAt: '2000-01-22T10:00:00.000Z',
      endedTimeZone: 'Pacific/Kiritimati',
    };
    expect(violation(only(endZone))).toBe('kickstart-end');
    expect(violation(only({ ...endZone, endedAt: '2000-01-21T09:59:00.000Z' }))).toBeNull();
  });

  it('card state: an unknown card or trigger is refused', () => {
    const t = base();
    t.card_state = [
      {
        cardId: 'rapid-loss',
        trigger: 'kickstart',
        firstShownAt: '2000-01-01T00:00:00.000Z',
        dismissedAt: null,
        dismissedTimeZone: null,
        doneAt: null,
      },
    ];
    expect(violation(t)).toBe('card-trigger');
  });

  it('garden photos (write path only): the garden row must exist', () => {
    const photo: GardenPhotoRecord = {
      gardenId: fixtureId(999),
      mimeType: 'image/jpeg',
      bytes: new ArrayBuffer(4),
      width: 1,
      height: 1,
      takenAt: '2000-01-01T00:00:00.000Z',
    };
    const withPhoto: InvariantSnapshot = { ...snapshotV1, garden_photos: [photo] };
    expect(findInvariantViolation(withPhoto)).toBe('garden-photo');
    expect(
      findInvariantViolation({
        ...withPhoto,
        garden_photos: [{ ...photo, gardenId: fixtureId(901) }],
      }),
    ).toBeNull();
  });
});
