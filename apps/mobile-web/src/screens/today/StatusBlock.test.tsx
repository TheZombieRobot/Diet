// Today's status line through the screen (item 16 design section 5.2 C3; TD-07, HS-02, HS-03,
// RD-06, HS-18): item 15's live schedule and running span, item 13's live gates.
import { parseClockTime, zonedWallTimeToInstant } from '@diet/core';
import { fasting } from '@diet/core/copy/health';
import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { TestDb } from '../../db/testKit';
import { clockTo, renderToday, resetToday, todayFixture } from './todayTestKit';

let test: TestDb | undefined;
afterEach(() => {
  cleanup();
  resetToday(test);
  test = undefined;
});

const D = '2000-03-15';
const at = (time: string, date = D): string =>
  new Date(zonedWallTimeToInstant(date, parseClockTime(time), 'Pacific/Auckland')).toISOString();
const line = () => screen.findByTestId('today-status-line');
const lineIs = async (text: string) => {
  await waitFor(() => {
    expect(screen.getByTestId('today-status-line').textContent).toBe(text);
  });
};

describe('the status line (C3; TD-07)', () => {
  it('reads the running fast and the eating window, with no comma in the date, and moves with the clock', async () => {
    test = await todayFixture();
    await renderToday();
    expect((await line()).textContent).toBe('Fasting 19 h 20 m. Eating window opens 6:00 pm.');
    expect(screen.getByTestId('today-date').textContent).not.toContain(',');
    await clockTo(test, at('14:21'));
    await lineIs('Fasting 19 h 21 m. Eating window opens 6:00 pm.');
  });

  it('RD-06: a "yes" to question 2 written while a 2-hour fast runs gives only the "still open" line', async () => {
    test = await todayFixture({ fast: at('12:20') });
    await renderToday();
    await lineIs('Fasting 2 h. Eating window opens 6:00 pm.');
    await act(async () => {
      await test?.repos.readiness.answer('q2', 'yes');
    });
    await lineIs('A fast you started is still open (2 h). You can end it below.');
    const status = screen.getByTestId('today-status');
    expect(status.textContent).not.toMatch(/Eating window|pm/);
    const card = screen.getByRole('region', { name: fasting.card.gatedLabel });
    expect(within(card).getByRole('button', { name: fasting.gated.endOpenFast })).toHaveProperty(
      'disabled',
      false,
    );
  });

  it('HS-02: past 24 hours the warning shows even with fasting switched off (question 3 "yes")', async () => {
    test = await todayFixture({ now: at('20:00', D), answersLater: { q3: 'yes' } });
    await renderToday();
    await lineIs(`Fasting 25 h. ${fasting.card.overCeiling}`);
    const card = screen.getByRole('region', { name: fasting.card.gatedLabel });
    expect(card.textContent).toContain(fasting.card.overCeiling);
  });

  it('C41: with no readiness answers stored (an import without them), a running fast is only "still open"', async () => {
    test = await todayFixture({
      fast: at('12:20'),
      seed: (t) => t.db.readiness.clear(),
    });
    await renderToday();
    await lineIs('A fast you started is still open (2 h). You can end it below.');
  });

  it('T5: the 5 pm snack added for today makes the line "Snack window opens 5:00 pm."', async () => {
    test = await todayFixture({
      fast: false,
      seed: (t) =>
        t.repos.planDays.setWindows([{ date: D, window: { start: '17:00', end: '19:00' } }]),
    });
    await renderToday();
    await lineIs('Snack window opens 5:00 pm.');
  });

  it('C07: with answer 4 the stored 23:1 Kickstart default reads 22:2, as on the Fast card (merged fastingContext)', async () => {
    // Item 14's preset rule with the gates passed in (item 13 review): during a running Kickstart
    // the line names the 5 pm snack window, never the one-meal window at 6:00 pm.
    test = await todayFixture({ answers: { q4: 'yes' } });
    await renderToday();
    await lineIs('Fasting 19 h 20 m. Snack window opens 5:00 pm.');
    const card = screen.getByRole('region', { name: fasting.card.label });
    expect(card.textContent).toContain('5:00 pm');
  });

  it('C30: a fast begun at 5:30 pm names no window time at 7:30 pm (the next is 24 h 30 m after it)', async () => {
    test = await todayFixture({ fast: at('17:30'), now: at('19:30') });
    await renderToday();
    await lineIs("Fasting 2 h. It's fine to widen the window.");
  });

  it('no fast at 6:30 pm: "Eating window open until 7:00 pm."', async () => {
    test = await todayFixture({ fast: false, now: at('18:30') });
    await renderToday();
    await lineIs('Eating window open until 7:00 pm.');
  });
});
