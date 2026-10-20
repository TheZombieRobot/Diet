// The weekly plan editor (item 27 design section 5.3, P1 to P6; EX-05, EX-07, C51, RD-05): the
// whole app over the real repositories on fake-indexeddb. Every record is synthetic.
import { move, moveScreen } from '@diet/core/copy/health';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { TestDb } from '../../db/testKit';
import {
  A,
  B,
  C,
  done,
  JOG,
  moveFixture,
  type MoveFixture,
  pattern,
  region,
  renderMove,
  resetMove,
  WALK,
} from './moveTestKit';

let test: TestDb | undefined;
afterEach(() => {
  cleanup();
  resetMove(test);
  test = undefined;
});

const { plan } = moveScreen;
const db = () => test as TestDb;

async function openPlan(fixture: MoveFixture = {}): Promise<HTMLElement> {
  test = await moveFixture(fixture);
  await renderMove('#/move-plan', 'Weekly plan');
  return screen.findByRole('region', { name: plan.title });
}

/** Opens a day and chooses its strength and beach sessions (by option label). */
function setDay(day: string, strength: string | null, beach: string | null): void {
  const editor = region(plan.title);
  const button = within(editor).getByRole('button', { name: new RegExp(`^${day}: `) });
  if (button.getAttribute('aria-expanded') !== 'true') fireEvent.click(button);
  if (strength !== null) {
    const group = within(editor).getByRole('radiogroup', { name: `Strength session on ${day}` });
    fireEvent.click(within(group).getByRole('radio', { name: strength }));
  }
  if (beach !== null) {
    const group = within(editor).getByRole('radiogroup', { name: `Beach session on ${day}` });
    fireEvent.click(within(group).getByRole('radio', { name: beach }));
  }
}

const problems = () => screen.queryByText(plan.problemsTitle)?.parentElement ?? null;

describe('the weekly plan editor (P1, P2, P4; EX-07, EX-05)', () => {
  it('starts from the standard week; a rule broken shows why and nothing is saved; a valid plan saves and shows on Move', async () => {
    const editor = await openPlan();
    expect(
      within(editor)
        .getAllByRole('button', { name: /^(Monday|Tuesday|Saturday): / })
        .map((b) => b.textContent),
    ).toEqual(['Monday: Rest day', 'Tuesday: Session A', 'Saturday: Beach walk']);
    setDay('Wednesday', 'Session C', null);
    expect(problems()?.textContent).toContain(move.week.problems['strength-back-to-back']);
    fireEvent.click(screen.getByRole('button', { name: plan.save }));
    expect(document.activeElement).toBe(problems());
    expect((await db().repos.settings.get()).weeklyPattern).toBeNull();
    setDay('Wednesday', 'None', null);
    setDay('Sunday', 'Session C', null);
    expect(problems()).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: plan.save }));
    await screen.findByRole('heading', { level: 1, name: 'Move' });
    expect((await db().repos.settings.get()).weeklyPattern?.find((d) => d.weekday === 7)).toEqual({
      weekday: 7,
      templateIds: [C],
    });
    const sunday = await screen.findByTestId('week-day-2000-01-23');
    expect(sunday.querySelector('.ui-week__chip')?.textContent).toBe('C');
  });

  it.each([
    [
      'walks on four more days',
      () => {
        for (const day of ['Monday', 'Wednesday', 'Thursday', 'Sunday'])
          setDay(day, null, 'Beach walk');
      },
      move.week.problems['rest-days'],
    ],
    [
      'only one strength session',
      () => {
        setDay('Friday', 'None', null);
      },
      move.week.problems['strength-count'],
    ],
  ])('%s: the reason shows and Save writes nothing', async (_, change, reason) => {
    await openPlan();
    change();
    expect(problems()?.textContent).toContain(reason);
    fireEvent.click(screen.getByRole('button', { name: plan.save }));
    expect((await db().repos.settings.get()).weeklyPattern).toBeNull();
  });

  it('"Use the standard week" clears a stored plan', async () => {
    await openPlan({ weeklyPattern: pattern({ 2: [A], 5: [B], 7: [C] }) });
    fireEvent.click(screen.getByRole('button', { name: plan.standard }));
    await screen.findByRole('heading', { level: 1, name: 'Move' });
    expect((await db().repos.settings.get()).weeklyPattern).toBeNull();
  });
});

describe('the jog in the editor (P3; EX-06, C51)', () => {
  const walk = (date: string) => ({
    date,
    templateId: WALK,
    movements: [done('seed:ex-beach-walk', 'standard', [900], true)],
    exertion: 2,
    soreness: 2,
  });
  const unlocked: MoveFixture = {
    jogOptIn: true,
    sessions: [
      ...['2000-01-02', '2000-01-04', '2000-01-06', '2000-01-08'].map(walk),
      { date: '2000-01-11', templateId: A, status: 'rested' },
    ],
  };
  const beachOptions = (day: string) =>
    within(screen.getByRole('radiogroup', { name: `Beach session on ${day}` }))
      .getAllByRole('radio')
      .map((r) => r.closest('label')?.querySelector('.ui-choice__label')?.textContent);

  it('locked: no jog, and the hint says how it unlocks', async () => {
    await openPlan();
    setDay('Sunday', null, null);
    expect(beachOptions('Sunday')).toEqual(['None', 'Beach walk']);
    expect(screen.getByText(plan.jogHint)).toBeDefined();
  });

  it('unlocked: a Sunday jog saves; with the switch off it is kept as the walk, and said so', async () => {
    await openPlan(unlocked);
    setDay('Sunday', null, 'Beach jog');
    fireEvent.click(screen.getByRole('button', { name: plan.save }));
    await screen.findByRole('heading', { level: 1, name: 'Move' });
    expect(
      (await db().repos.settings.get()).weeklyPattern?.find((d) => d.weekday === 7)?.templateIds,
    ).toEqual([JOG]);
    await db().repos.profile.update({ jogOptIn: false });
    cleanup();
    await renderMove('#/move-plan', 'Weekly plan');
    await screen.findByText(
      'Jogging is not on right now, so the beach walk is shown on Sunday. Saving this plan keeps the walk there.',
    );
    expect(screen.getByRole('button', { name: 'Sunday: Beach walk' })).toBeDefined();
  });
});

describe('RD-05 and rolling rest days (P5, P6)', () => {
  it('answer 6 open: only the reason, 111 and Healthline, and that sessions are kept', async () => {
    test = await moveFixture({ answers: { q6: 'yes' } });
    const main = await renderMove('#/move-plan', 'Weekly plan');
    await screen.findByTestId('gate-notice-exercisePlans');
    expect(main.querySelector('a[href="tel:111"]')).not.toBeNull();
    expect(main.querySelector('a[href="tel:0800611116"]')).not.toBeNull();
    expect(main.textContent).toContain(moveScreen.blockedKept);
    expect(screen.queryByRole('region', { name: plan.title })).toBeNull();
  });

  it('a plan that would leave fewer than two rest days in 7 days in a row, counting what was done, is refused (N33)', async () => {
    const weekDone = [
      ['2000-01-19', A],
      ['2000-01-20', WALK],
      ['2000-01-21', B],
      ['2000-01-22', WALK],
      ['2000-01-23', C],
    ] as const;
    await openPlan({
      now: '2000-01-22T20:00:00.000Z', // Sunday 23 January
      weeklyPattern: pattern({ 3: [A], 4: [WALK], 5: [B], 6: [WALK], 7: [C] }),
      sessions: weekDone.map(([date, templateId]) => ({ date, templateId })),
    });
    setDay('Monday', null, 'Beach walk');
    setDay('Tuesday', 'Session A', null);
    setDay('Wednesday', 'None', 'Beach walk');
    setDay('Thursday', 'Session B', 'None');
    setDay('Friday', 'None', 'Beach walk');
    setDay('Saturday', null, 'None');
    setDay('Sunday', 'None', null);
    expect(problems()?.textContent).toContain(plan.rollingRest);
    fireEvent.click(screen.getByRole('button', { name: plan.save }));
    await waitFor(() => {
      expect(document.activeElement).toBe(problems());
    });
    setDay('Monday', null, 'None');
    setDay('Tuesday', 'None', null);
    setDay('Saturday', 'Session A', null);
    expect(problems()).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: plan.save }));
    await screen.findByRole('heading', { level: 1, name: 'Move' });
    expect(
      (await db().repos.settings.get()).weeklyPattern?.find((d) => d.weekday === 6)?.templateIds,
    ).toEqual([A]);
  });
});
