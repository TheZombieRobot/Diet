// Today's Movement card and the Complete workout quick action (item 27 design section 5.3, T1 to
// T4; UX 2 card 6, RD-05, HS-28): the whole app on #/today over fake-indexeddb.
import type { SessionRecord } from '@diet/core';
import { move, today } from '@diet/core/copy/health';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TestDb } from '../../db/testKit';
import {
  A,
  B,
  moveFixture,
  type MoveFixture,
  pattern,
  region,
  regionNames,
  renderMove,
  resetMove,
  sessionRows,
  WALK,
} from './moveTestKit';

let test: TestDb | undefined;
afterEach(() => {
  cleanup();
  resetMove(test);
  test = undefined;
  vi.restoreAllMocks();
});

const card = () => region(today.cards.movement);

async function openToday(fixture: MoveFixture = {}): Promise<HTMLElement> {
  test = await moveFixture(fixture);
  await renderMove('#/today', 'Today');
  await waitFor(() => {
    expect(card().querySelector('.ui-card__body')?.childElementCount ?? 0).toBeGreaterThan(0);
  });
  return card();
}

describe("Today's Movement card (T1; UX 2 card 6, N10)", () => {
  it("a Tuesday: today's session with Start, the week's plan and a link to Move", async () => {
    const movement = await openToday();
    expect(within(movement).getByText('Today: Session A')).toBeDefined();
    expect(within(movement).getByTestId('week-strip')).toBeDefined();
    expect(
      within(movement).getByRole('link', { name: 'Start Session A' }).getAttribute('href'),
    ).toBe('#/move-session/a');
    expect(within(movement).getByRole('link', { name: 'See this week' }).getAttribute('href')).toBe(
      '#/move',
    );
  });

  it('the strip shows the plan only: no done badge and no not-done outline', async () => {
    const movement = await openToday({
      now: '2000-01-21T20:00:00.000Z', // Saturday: Tuesday done, Friday not
      sessions: [{ date: '2000-01-18', templateId: A }],
    });
    expect(movement.querySelector('.ui-week__chip--done, .ui-week__chip--outline')).toBeNull();
    expect(within(movement).getByTestId('week-day-2000-01-18').dataset['state']).toBe('planned');
  });

  it('a rest day reads as one, with the footer and no Start', async () => {
    const movement = await openToday({ now: '2000-01-16T20:00:00.000Z' });
    expect(within(movement).getByText(move.rest.restDay)).toBeDefined();
    expect(within(movement).getByText(move.rest.general)).toBeDefined();
    expect(within(movement).queryByRole('link', { name: /^Start/ })).toBeNull();
  });

  it("ratings for today's done sessions: one group per session, changed but never cleared", async () => {
    const movement = await openToday({
      weeklyPattern: pattern({ 2: [A, WALK], 5: [B] }),
      sessions: [
        { date: '2000-01-18', templateId: A },
        { date: '2000-01-18', templateId: WALK },
      ],
    });
    const groups = within(movement).getAllByRole('group', { name: /^(Session A|Beach walk)$/ });
    expect(groups.map((g) => g.getAttribute('aria-labelledby') !== null)).toEqual([true, true]);
    const names = [...movement.querySelectorAll('input[type=radio]')].map((r) =>
      r.getAttribute('name'),
    );
    expect(new Set(names).size).toBe(6);
    const effort = () =>
      within(within(movement).getByRole('group', { name: 'Session A' })).getByRole('radiogroup', {
        name: 'Effort',
      });
    const rowA = async (): Promise<SessionRecord | undefined> =>
      (await sessionRows(test as TestDb)).find((r) => r.templateId === A);
    fireEvent.click(within(effort()).getByRole('radio', { name: '3' }));
    await waitFor(async () => {
      expect((await rowA())?.exertion).toBe(3);
    });
    fireEvent.click(within(effort()).getByRole('radio', { name: '4' }));
    await waitFor(async () => {
      expect((await rowA())?.exertion).toBe(4);
    });
    fireEvent.click(within(effort()).getByRole('radio', { name: '4' }));
    expect((await rowA())?.exertion).toBe(4);
  });

  it('a done session with no check (from a backup) has no rating radios', async () => {
    const movement = await openToday({
      sessions: [{ date: '2000-01-18', templateId: A, preCheck: null }],
    });
    expect(within(movement).getByText(move.week.dayDone)).toBeDefined();
    expect(within(movement).queryAllByRole('radio')).toHaveLength(0);
  });
});

describe('RD-05 on Today, the quick action, and the pending card (T2 to T4)', () => {
  it('answer 6 open: the card holds the reason, 111 and Healthline, and nothing else of Move', async () => {
    const movement = await openToday({ answers: { q6: 'yes' } });
    expect(within(movement).getByTestId('gate-notice-exercisePlans')).toBeDefined();
    expect(movement.querySelector('a[href="tel:111"]')).not.toBeNull();
    expect(movement.querySelector('a[href="tel:0800611116"]')).not.toBeNull();
    expect(within(movement).queryByTestId('week-strip')).toBeNull();
    expect(within(movement).queryByRole('link', { name: /^Start/ })).toBeNull();
    expect(within(movement).queryAllByRole('radio')).toHaveLength(0);
  });

  it.each([
    ['open', {}, true],
    ['off with answer 6', { answers: { q6: 'yes' as const } }, false],
  ])('Complete workout %s', async (_, fixture, ready) => {
    await openToday({
      ...fixture,
      sessions: [{ date: '2000-01-18', templateId: A, status: 'planned' }],
    });
    fireEvent.click(screen.getByRole('button', { name: today.quickActions.title }));
    const label = today.quickActions.labels['complete-workout'];
    if (!ready) {
      const off = await screen.findByRole('button', { name: new RegExp(label) });
      expect(off.getAttribute('aria-disabled')).toBe('true');
      expect(off.hasAttribute('href')).toBe(false);
      await waitFor(() => {
        const reason = document.getElementById(off.getAttribute('aria-describedby') ?? '');
        expect(reason?.textContent).toContain('exercise warning signs');
      });
      return;
    }
    fireEvent.click(await screen.findByRole('link', { name: new RegExp(label) }));
    await screen.findByRole('region', { name: move.finish.title });
    expect(window.location.hash).toBe('#/move-session/a/finish');
    expect(regionNames(screen.getByRole('main'))[0]).toBe(move.safety.stopRules.title);
  });

  it('while the records are read, the card is there and empty; then its headline fills the same place', async () => {
    test = await moveFixture();
    let release: (rows: SessionRecord[]) => void = () => undefined;
    const held = new Promise<SessionRecord[]>((resolve) => {
      release = resolve;
    });
    vi.spyOn(test.repos.sessions, 'list').mockReturnValueOnce(held);
    await renderMove('#/today', 'Today');
    const movement = await screen.findByRole('region', { name: today.cards.movement });
    expect(movement.querySelector('.ui-card__body')?.childElementCount).toBe(0);
    release([]);
    await waitFor(() => {
      expect(within(card()).getByText('Today: Session A')).toBeDefined();
    });
  });
});
