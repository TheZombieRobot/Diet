import { describe, expect, it } from 'vitest';
import {
  type CholesterolCheckinInput,
  cholesterolCheckinDue,
  type CholesterolTrigger,
  electrolyteReminderDue,
  type ElectrolyteReminderInput,
} from './reminders';

// Synthetic instants from 1 March 2000, Pacific/Auckland.
const T0 = Date.parse('2000-03-01T00:00:00.000Z');
const DAY = 86_400_000;
const MIN = 60_000;
const day = (n: number, plusMs = 0): string => new Date(T0 + n * DAY + plusMs).toISOString();

describe('cholesterolCheckinDue (U5; NU-08 as reworded, C109, TD-06)', () => {
  const ketoFromStart = (
    now: string,
    rows: CholesterolCheckinInput['rows'] = {},
  ): CholesterolCheckinInput => ({
    now,
    onboardingCompletedAt: day(0),
    firstLowCarbAt: day(0),
    profileCreatedAt: day(0),
    rows,
  });
  const hidden = (at: string) => ({ dismissedAt: at, doneAt: null });

  it('nothing before setup is finished', () => {
    expect(cholesterolCheckinDue({ ...ketoFromStart(day(1)), onboardingCompletedAt: null })).toBe(
      null,
    );
  });

  it('the lipid test from the end of setup until 56 days; hidden for good once hidden', () => {
    expect(cholesterolCheckinDue(ketoFromStart(day(0)))).toBe('day-1');
    expect(cholesterolCheckinDue(ketoFromStart(day(0), { 'day-1': hidden(day(0)) }))).toBeNull();
    expect(cholesterolCheckinDue(ketoFromStart(day(56, -MIN)))).toBe('day-1');
    expect(
      cholesterolCheckinDue(ketoFromStart(day(56, -MIN), { 'day-1': hidden(day(0)) })),
    ).toBeNull();
  });

  it('56 and 84 days: each check-in comes whatever was hidden before, and the latest wins', () => {
    const hid1 = { 'day-1': hidden(day(0)) };
    expect(cholesterolCheckinDue(ketoFromStart(day(56), hid1))).toBe('day-56');
    expect(
      cholesterolCheckinDue(ketoFromStart(day(60), { ...hid1, 'day-56': hidden(day(60)) })),
    ).toBeNull();
    expect(cholesterolCheckinDue(ketoFromStart(day(84, -MIN)))).toBe('day-56');
    expect(cholesterolCheckinDue(ketoFromStart(day(84)))).toBe('day-84');
    expect(
      cholesterolCheckinDue(
        ketoFromStart(day(85), { 'day-84': { dismissedAt: null, doneAt: day(85) } }),
      ),
    ).toBeNull();
  });

  it('a hide dated after now hides nothing', () => {
    expect(cholesterolCheckinDue(ketoFromStart(day(1), { 'day-1': hidden(day(2)) }))).toBe('day-1');
  });

  describe('starting in balanced mode', () => {
    const balanced = (
      now: string,
      firstLowCarb: number | null,
      rows: Partial<Record<CholesterolTrigger, string>> = {},
    ): CholesterolCheckinInput => ({
      now,
      onboardingCompletedAt: day(0),
      firstLowCarbAt: firstLowCarb === null ? null : day(firstLowCarb),
      profileCreatedAt: day(0),
      rows: Object.fromEntries(Object.entries(rows).map(([t, at]) => [t, hidden(at)])),
    });

    it('never low-carb: counted from when the profile was made', () => {
      expect(cholesterolCheckinDue(balanced(day(56), null))).toBe('day-56');
    });

    it('low-carb from day 30: the lipid test hidden at day 0 comes back, and day 56 counts from day 30', () => {
      expect(cholesterolCheckinDue(balanced(day(30), 30, { 'day-1': day(0) }))).toBe('day-1');
      expect(cholesterolCheckinDue(balanced(day(86, -MIN), 30, { 'day-1': day(30) }))).toBeNull();
      expect(cholesterolCheckinDue(balanced(day(86), 30, { 'day-1': day(30) }))).toBe('day-56');
    });

    it('low-carb from day 100, after all three were hidden: each comes again from day 100', () => {
      const rows = { 'day-1': day(0), 'day-56': day(60), 'day-84': day(90) };
      expect(cholesterolCheckinDue(balanced(day(100), 100, rows))).toBe('day-1');
      expect(cholesterolCheckinDue(balanced(day(156), 100, rows))).toBe('day-56');
      expect(cholesterolCheckinDue(balanced(day(184), 100, rows))).toBe('day-84');
    });

    it('day 56 hidden at day 60 and low-carb from day 60: day 56 comes at day 116', () => {
      const rows = { 'day-1': day(60), 'day-56': day(60) };
      expect(cholesterolCheckinDue(balanced(day(116, -MIN), 60, rows))).toBeNull();
      expect(cholesterolCheckinDue(balanced(day(116), 60, rows))).toBe('day-56');
    });
  });

  it('a first low-carb day dated ahead falls back to the earliest setup time (clock skew)', () => {
    const input: CholesterolCheckinInput = {
      now: day(56),
      onboardingCompletedAt: day(0),
      firstLowCarbAt: day(56 + 365),
      profileCreatedAt: day(0),
      rows: { 'day-1': hidden(day(0)) },
    };
    expect(cholesterolCheckinDue(input)).toBe('day-56');
  });

  it('every stored time dated ahead: the lipid test, which a hide made now still hides', () => {
    const ahead = day(365);
    const input: CholesterolCheckinInput = {
      now: day(0),
      onboardingCompletedAt: ahead,
      firstLowCarbAt: ahead,
      profileCreatedAt: ahead,
      rows: {},
    };
    expect(cholesterolCheckinDue(input)).toBe('day-1');
    expect(cholesterolCheckinDue({ ...input, rows: { 'day-1': hidden(day(0)) } })).toBeNull();
  });
});

describe('electrolyteReminderDue (U6; C72, TD-06)', () => {
  const OPEN = { ketoCeilingAvailable: true, kickstartAvailable: true };
  const due = (overrides: Partial<ElectrolyteReminderInput>): boolean =>
    electrolyteReminderDue({
      now: day(20),
      gates: OPEN,
      dietMode: 'keto',
      kickstartToday: false,
      carbCeilingStartedAt: null,
      row: null,
      ...overrides,
    });

  it('every Kickstart day, extension weeks included', () => {
    expect(due({ kickstartToday: true, carbCeilingStartedAt: day(6) })).toBe(true); // day 15
    expect(due({ now: day(28), kickstartToday: true, carbCeilingStartedAt: day(6) })).toBe(true); // day 22
  });

  it('the first 14 days of a carb ceiling without Kickstart: 13 days in, not exactly 14 or 15', () => {
    expect(due({ carbCeilingStartedAt: day(7) })).toBe(true);
    expect(due({ carbCeilingStartedAt: day(6) })).toBe(false);
    expect(due({ carbCeilingStartedAt: day(5) })).toBe(false);
    // keto → balanced → keto writes a new start: 14 new days.
    expect(due({ carbCeilingStartedAt: day(19) })).toBe(true);
    // A start dated ahead of the clock is inside.
    expect(due({ carbCeilingStartedAt: day(30) })).toBe(true);
  });

  it('a closed gate or another mode ends it at once, whatever the Kickstart records say', () => {
    const running = { kickstartToday: true, carbCeilingStartedAt: day(17) };
    // Q5 or Q2 "yes" closes the keto ceiling and Kickstart.
    expect(
      due({ ...running, gates: { ketoCeilingAvailable: false, kickstartAvailable: false } }),
    ).toBe(false);
    expect(
      due({
        kickstartToday: true,
        carbCeilingStartedAt: day(0),
        gates: { ketoCeilingAvailable: true, kickstartAvailable: false },
      }),
    ).toBe(false);
    for (const dietMode of ['balanced', 'moderate-low-carb'] as const) {
      expect(due({ ...running, dietMode })).toBe(false);
    }
  });

  it('"Hide for today" hides it until local midnight; a hide dated ahead hides nothing', () => {
    const hiddenAt9pm = {
      dismissedAt: '2000-03-21T09:00:00.000Z', // 9:00 pm NZST on 21 March
      dismissedTimeZone: 'Pacific/Auckland',
      doneAt: null,
    };
    const ceiling = { carbCeilingStartedAt: day(15) };
    expect(due({ ...ceiling, now: '2000-03-21T11:59:00.000Z', row: hiddenAt9pm })).toBe(false);
    expect(due({ ...ceiling, now: '2000-03-21T12:00:00.000Z', row: hiddenAt9pm })).toBe(true);
    expect(due({ ...ceiling, now: '2000-03-21T08:00:00.000Z', row: hiddenAt9pm })).toBe(true);
  });
});
