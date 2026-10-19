import { describe, expect, it } from 'vitest';
import { groceryListStatus, nutrientCompleteness, shownStdDrinksPerServe } from './derived';

describe('read-time derivations (sections 4.7, 4.10, 4.11; section 16 test 10)', () => {
  it('a label row shows its printed figure, even when lower than the calculation (AL-02)', () => {
    const label = {
      volumeMl: 330,
      abvPercent: 5,
      standardDrinks: 1.1,
      kcal: null,
      energyAsEntered: null,
      origin: 'owner' as const,
    };
    expect(
      shownStdDrinksPerServe({
        stdSource: 'label',
        stdDrinksPerServe: 1.1,
        beverage: { volumeMl: 330, abvPercent: 5, label },
      }),
    ).toBe(1.1);
  });

  it('a calculated row with a corrupted low stored figure shows the recomputed figure (C94)', () => {
    const beverage = { volumeMl: 330, abvPercent: 5, label: null };
    expect(
      shownStdDrinksPerServe({ stdSource: 'calculated', stdDrinksPerServe: 0.1, beverage }),
    ).toBeCloseTo(1.30185, 10);
    expect(
      shownStdDrinksPerServe({ stdSource: 'calculated', stdDrinksPerServe: 2, beverage }),
    ).toBe(2);
  });

  it('grocery list status: draft, waiting, expired, received, edited since sent (C52)', () => {
    const sentAt = '2000-01-01T00:00:00.000Z';
    const base = { version: 2, sentVersion: null, sentAt: null, receivedVersion: null };
    expect(groceryListStatus(base, sentAt)).toBe('draft');
    const sent = { version: 2, sentVersion: 2, sentAt, receivedVersion: null };
    expect(groceryListStatus(sent, '2000-01-01T00:14:59.999Z')).toBe('waiting');
    expect(groceryListStatus(sent, '2000-01-01T00:15:00.000Z')).toBe('expired');
    expect(groceryListStatus({ ...sent, receivedVersion: 2 }, '2000-01-02T00:00:00.000Z')).toBe(
      'received',
    );
    expect(groceryListStatus({ ...sent, version: 3, receivedVersion: 2 }, sentAt)).toBe(
      'edited-since-sent',
    );
  });

  it('counts the entries that lack each nutrient (D35)', () => {
    const counts = nutrientCompleteness([
      { unknownNutrients: ['carbsG', 'fibreG'] },
      { unknownNutrients: ['carbsG'] },
      { unknownNutrients: [] },
    ]);
    expect(counts.carbsG).toBe(2);
    expect(counts.fibreG).toBe(1);
    expect(counts.energyKj).toBe(0);
    expect(Object.keys(counts)).toHaveLength(8);
  });
});
