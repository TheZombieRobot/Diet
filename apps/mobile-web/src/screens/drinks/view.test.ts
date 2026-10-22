// @vitest-environment node
// The Drinks view (item 28 design 6.2 V1; C94, AL-03, AL-04, AL-07, C25, C46): the total shown is
// the total compared. Pure: synthetic records, no database. A view that compared the unrounded sum
// fails the first row (29.997 is below 30) and the third (10.0045 is above 10).
import {
  type AlcoholGuidanceSet,
  defaultProfile,
  defaultSettings,
  drinkFigures,
  type DrinkLogRecord,
  gateInputFromRecords,
  type ProfileSex,
  READINESS_QUESTION_IDS,
  READINESS_WORDING,
  readinessGates,
  type StoredBeverage,
} from '@diet/core';
import { describe, expect, it } from 'vitest';
import { buildDrinksView } from './view';

const NOW = '2000-03-01T00:00:00.000Z'; // 1:00 pm on Wednesday 1 March in Auckland
const GATES = readinessGates(
  gateInputFromRecords({
    rows: READINESS_QUESTION_IDS.map((q) => ({
      questionId: q,
      answer: 'no' as const,
      wordingVersion: READINESS_WORDING[q],
      answeredAt: NOW,
    })),
    birthYear: 1970,
    heightCm: null,
    currentWeightKg: null,
    today: '2000-03-01',
  }),
);

const measure = (volumeMl: number, abvPercent: number): StoredBeverage => ({
  volumeMl,
  abvPercent,
  label: null,
});
/** 375 mL at 8.5% with a label of 2.5 standard drinks (the calculation, 2.51, agrees). */
const LABEL_2_5: StoredBeverage = {
  volumeMl: 375,
  abvPercent: 8.5,
  label: {
    volumeMl: 375,
    abvPercent: 8.5,
    standardDrinks: 2.5,
    kcal: null,
    energyAsEntered: null,
    origin: 'owner',
  },
};

function viewFor(
  sex: ProfileSex | null,
  setting: AlcoholGuidanceSet | null,
  count: number,
  beverage: StoredBeverage,
  gates = GATES,
) {
  const drink = {
    id: 'drink-1',
    at: '2000-02-29T23:00:00.000Z', // noon on 1 March 2000 in Auckland
    timeZone: 'Pacific/Auckland',
    beverageId: null,
    name: 'Example drink',
    count,
    beverage,
    ...drinkFigures(beverage),
  } as DrinkLogRecord;
  return buildDrinksView(
    {
      settings: {
        ...defaultSettings(),
        alcoholNoticeAckAt: '2000-02-01T00:00:00.000Z',
        alcoholGuidanceSet: setting,
      },
      profile: { ...defaultProfile(NOW), sex },
      beverages: [],
      drinks: [drink],
      notes: [],
      milestones: [],
      cardRows: {},
    },
    gates,
    { now: NOW, deviceZone: 'Pacific/Auckland', today: '2000-03-01', noteToday: '2000-03-01' },
  );
}

/** The readiness gates with answer 2 "yes", or with no answer to it (a reworded question). */
const answer2 = (q2: 'yes' | null) =>
  readinessGates(
    gateInputFromRecords({
      rows: READINESS_QUESTION_IDS.flatMap((q) =>
        q === 'q2' && q2 === null
          ? []
          : [
              {
                questionId: q,
                answer: q === 'q2' ? (q2 ?? 'no') : ('no' as const),
                wordingVersion: READINESS_WORDING[q],
                answeredAt: NOW,
              },
            ],
      ),
      birthYear: 1970,
      heightCm: null,
      currentWeightKg: null,
      today: '2000-03-01',
    }),
  );

describe('the help card in pregnancy, with no figure shown (re-check V21; HEALTH_SAFETY section 5)', () => {
  it.each(['yes', null] as const)(
    "answer 2 %s: a man with the men's set reaches the trigger at double the women's figure, 20 a week",
    (q2) => {
      const view = viewFor('male', 'nz-men', 8, LABEL_2_5, answer2(q2));
      expect(view.shown).toEqual({ kind: 'pregnancy' });
      expect(view.weekTotals.std).toBe(20);
      expect(view.helpActive).toContain('double-guidance');
      expect(viewFor('male', 'nz-men', 7, LABEL_2_5, answer2(q2)).helpActive).not.toContain(
        'double-guidance',
      );
    },
  );
});

describe('the shown total is the compared total (V1; C94)', () => {
  it.each<[string, ProfileSex | null, AlcoholGuidanceSet | null, number, StoredBeverage, number]>([
    ['male, 29 × 30 mL at 43.7% (29.997)', 'male', null, 29, measure(30, 43.7), 30],
    ['male, 34 × 30 mL at 37.3% (30.018)', 'male', null, 34, measure(30, 37.3), 30.02],
    ['no sex, 8 × a label of 2.5', null, null, 8, LABEL_2_5, 20],
    ["male with the women's figures, 8 × a label of 2.5", 'male', 'nz-women', 8, LABEL_2_5, 20],
  ])('%s reaches double the weekly figure', (_case, sex, setting, count, beverage, shown) => {
    const view = viewFor(sex, setting, count, beverage);
    expect(view.weekTotals.std).toBe(shown);
    expect(view.helpActive).toContain('double-guidance');
  });

  it.each<[string, ProfileSex, number, StoredBeverage, number, boolean]>([
    ['female, 4 × 100 mL at 31.7% (10.0045)', 'female', 4, measure(100, 31.7), 10, false],
    ['female, 14 × 30 mL at 30.2% (10.0077)', 'female', 14, measure(30, 30.2), 10.01, true],
    ['male, 3 × 375 mL at 16.9% (15.0009)', 'male', 3, measure(375, 16.9), 15, false],
    ['male, 6 × 100 mL at 31.7% (15.0068)', 'male', 6, measure(100, 31.7), 15.01, true],
  ])(
    '%s: more than the weekly figure only when the shown total is',
    (_case, sex, count, beverage, shown, above) => {
      const view = viewFor(sex, null, count, beverage);
      expect(view.weekTotals.std).toBe(shown);
      expect(view.weekAbove).toBe(above);
    },
  );

  // AL-03, AL-04: today's total against 2 (women) and 3 (men) a day, never the weekly figure.
  it.each<[string, ProfileSex, number, StoredBeverage, number, boolean]>([
    ['female, 2 × 100 mL at 12.7% (2.004)', 'female', 2, measure(100, 12.7), 2, false],
    ['female, 3 × 330 mL at 5% (3.906)', 'female', 3, measure(330, 5), 3.91, true],
    ['male, 3 × 100 mL at 12.68% (3.0014)', 'male', 3, measure(100, 12.68), 3, false],
    ['male, 3 × 100 mL at 12.7% (3.006)', 'male', 3, measure(100, 12.7), 3.01, true],
  ])(
    '%s: more than the daily figure only when the shown total is',
    (_case, sex, count, beverage, shown, above) => {
      const view = viewFor(sex, null, count, beverage);
      expect(view.todayTotals.std).toBe(shown);
      expect(view.todayAbove).toBe(above);
    },
  );
});
