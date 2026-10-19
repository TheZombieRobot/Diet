// The day queries behind the Nutrition today card (item 21 design section 6.2, D9 and D9b; T16):
// food and drinks by calendar date, each in its own recorded zone. Synthetic rows.
import { afterEach, describe, expect, it } from 'vitest';
import { drink, foodEntry } from '../../screens/targets/targetsTestKit';
import { openTestDb, type TestDb } from '../testKit';

let test: TestDb | undefined;

afterEach(() => {
  test?.db.shutDown();
  test = undefined;
});

/** An instant from a New Zealand summer wall-clock time (UTC+13). */
const nz = (date: string, time: string) => new Date(`${date}T${time}:00+13:00`).toISOString();

describe('the day’s rows by calendar date (T16)', () => {
  it('D9: food at 23:30 in Auckland counts on that local date, not the UTC one, in time order', async () => {
    test = await openTestDb();
    const late = {
      ...foodEntry('10:00', 'Example supper', { energyKj: 500 }),
      at: nz('2000-02-09', '23:30'),
    };
    const breakfast = { ...foodEntry('10:00', 'Example oats', {}), at: nz('2000-02-10', '07:00') };
    const lunch = { ...foodEntry('10:00', 'Example soup', {}), at: nz('2000-02-10', '12:00') };
    await test.db.food_log.bulkAdd([lunch, late, breakfast]);
    expect((await test.repos.foodLog.forLocalDate('2000-02-09')).map((r) => r.name)).toEqual([
      'Example supper',
    ]);
    expect((await test.repos.foodLog.forLocalDate('2000-02-10')).map((r) => r.name)).toEqual([
      'Example oats',
      'Example soup',
    ]);
  });

  it('D9b: drinks by calendar date ignore the cut-over the Drinks card uses', async () => {
    test = await openTestDb();
    const evening = drink(nz('2000-02-09', '23:30'), 1);
    const afterMidnight = drink(nz('2000-02-10', '00:30'), 1);
    await test.db.drinks_log.bulkAdd([evening, afterMidnight]);
    const ids = (rows: readonly { id: string }[]) => rows.map((r) => r.id);
    expect(ids(await test.repos.drinks.forLocalDates('2000-02-09', '2000-02-09'))).toEqual([
      evening.id,
    ]);
    expect(ids(await test.repos.drinks.forLocalDates('2000-02-10', '2000-02-10'))).toEqual([
      afterMidnight.id,
    ]);
    expect(ids(await test.repos.drinks.forDrinkingDays('2000-02-09', '2000-02-09')).sort()).toEqual(
      [evening.id, afterMidnight.id].sort(),
    );
  });
});
