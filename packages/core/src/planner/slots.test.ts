import { describe, expect, it } from 'vitest';
import { clockTimeFromMinutes } from '../fasting/windows';
import {
  allowedSlots,
  isSingleSittingPlan,
  mealsInWindow,
  planSlotsFor,
  slotLabelKey,
} from './slots';
import { meal, R } from './testData';
import { lastPlanDate, noonOf, planDateState, planWeekDates, planWeekNav } from './week';

const w = (start: string, end: string) => ({ start, end });

describe('window-aware slots (item 22 S1; C07, C73, RD-01 to RD-04, HS-03, NN-02)', () => {
  it('each window length plans its own meals, with design 3.2’s labels', () => {
    const cases: [ReturnType<typeof w> | null, string, string[], string[], string[]][] = [
      [
        null,
        'ordinary',
        ['breakfast', 'lunch', 'dinner'],
        ['snack'],
        ['breakfast', 'lunch', 'dinner'],
      ],
      [w('18:00', '19:00'), 'one-meal', ['dinner'], [], ['dinner']],
      [w('12:00', '13:00'), 'one-meal', ['dinner'], [], ['mainMeal']],
      [w('21:00', '22:30'), 'one-meal', ['dinner'], [], ['dinner']],
      // NN-02: a 5 pm snack and a 7 pm final meal is a 2-hour window, so 22:2, not two meals.
      [w('17:00', '19:00'), 'snack-and-dinner', ['snack', 'dinner'], [], ['snackAtFive', 'dinner']],
      [w('11:00', '14:00'), 'snack-and-dinner', ['snack', 'dinner'], [], ['meal1', 'mainMeal']],
      [w('19:00', '21:00'), 'snack-and-dinner', ['snack', 'dinner'], [], ['meal1', 'dinner']],
      [w('16:00', '19:00'), 'snack-and-dinner', ['snack', 'dinner'], [], ['snack', 'dinner']],
      [w('23:00', '01:00'), 'snack-and-dinner', ['snack', 'dinner'], [], ['meal1', 'dinner']],
      [w('15:00', '19:00'), 'two-meals', ['meal1', 'dinner'], ['snack'], ['meal1', 'dinner']],
      [w('11:00', '15:00'), 'two-meals', ['meal1', 'dinner'], [], ['meal1', 'mainMeal']],
      [w('22:00', '02:00'), 'two-meals', ['meal1', 'dinner'], [], ['meal1', 'dinner']],
    ];
    for (const [window, pattern, slots, optional, labels] of cases) {
      const day = planSlotsFor(window);
      expect({ pattern: day.pattern, slots: day.slots, optional: day.optional }).toEqual({
        pattern,
        slots,
        optional,
      });
      expect(day.slots.map((s) => slotLabelKey(s, window))).toEqual(labels);
    }
  });

  it('property: dinner is planned for every window on a 15-minute grid; no window gives three occasions', () => {
    for (let start = 0; start < 1440; start += 15) {
      for (let length = 60; length < 1440; length += 15) {
        const window = w(clockTimeFromMinutes(start), clockTimeFromMinutes(start + length));
        expect(planSlotsFor(window).slots).toContain('dinner');
      }
    }
    expect(allowedSlots(planSlotsFor(null))).toEqual(['breakfast', 'lunch', 'snack', 'dinner']);
  });

  it('a single sitting is a one-meal window or one counted meal; mealsInWindow keeps every meal once', () => {
    expect(isSingleSittingPlan(planSlotsFor(w('18:00', '19:00')), 0)).toBe(true);
    expect(isSingleSittingPlan(planSlotsFor(w('17:00', '19:00')), 1)).toBe(true);
    expect(isSingleSittingPlan(planSlotsFor(w('17:00', '19:00')), 2)).toBe(false);
    const meals = [
      meal('dinner', R.dinnerA),
      meal('snack', R.snackB),
      meal('breakfast', R.breakfastJ),
    ];
    const { inWindow, outside } = mealsInWindow(meals, ['dinner']);
    expect(inWindow.map((m) => m.slot)).toEqual(['dinner']);
    expect(outside.map((m) => m.slot)).toEqual(['breakfast', 'snack']);
  });
});

describe('the planning range (item 22 S4; V2, V3, V41)', () => {
  it('a display week is Monday to Sunday; a Tuesday start is a programming error', () => {
    expect(planWeekDates('2000-01-03')).toEqual([
      '2000-01-03',
      '2000-01-04',
      '2000-01-05',
      '2000-01-06',
      '2000-01-07',
      '2000-01-08',
      '2000-01-09',
    ]);
    expect(() => planWeekDates('2000-01-04')).toThrow(RangeError);
  });

  it('today to the Sunday of next week is editable; earlier is past, later too far', () => {
    expect(lastPlanDate('2000-01-05')).toBe('2000-01-16');
    expect(planDateState('2000-01-04', '2000-01-05')).toBe('past');
    expect(planDateState('2000-01-05', '2000-01-05')).toBe('editable');
    expect(planDateState('2000-01-16', '2000-01-05')).toBe('editable');
    expect(planDateState('2000-01-17', '2000-01-05')).toBe('too-far');
  });

  it('next week is offered only from the current week; noon is an instant in the zone', () => {
    expect(planWeekNav('2000-01-03', '2000-01-05')).toEqual({
      current: '2000-01-03',
      previous: '1999-12-27',
      next: '2000-01-10',
      isCurrent: true,
    });
    expect(planWeekNav('2000-01-10', '2000-01-05').next).toBeNull();
    // The April daylight-saving day in New Zealand: noon is still 12:00 local (00:00 UTC).
    expect(noonOf('2026-04-05', 'Pacific/Auckland')).toBe('2026-04-05T00:00:00.000Z');
  });
});
