// Today's Reminders card (item 16 design section 5.2 C8; TD-06, NU-08, C72, C102, C07, C41,
// RD-09, BK-03): real repositories on fake-indexeddb with the test clock.
import { fasting, privacy, readiness, reminders, weight } from '@diet/core/copy/health';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { TestDb } from '../../db/testKit';
import { clockTo, renderToday, resetToday, TODAY_NOW, todayFixture } from './todayTestKit';

let test: TestDb | undefined;
afterEach(() => {
  cleanup();
  resetToday(test);
  test = undefined;
});

const DAY = 86_400_000;
const plusDays = (days: number) => new Date(Date.parse(TODAY_NOW) + days * DAY).toISOString();
const card = () => screen.getByRole('region', { name: privacy.backupReminder.cardLabel });
const titles = () =>
  within(card())
    .getAllByRole('heading', { level: 3 })
    .map((h) => h.textContent);
/** Setup finished now and nothing else due: the lipid test is the only reminder. */
const lipidOnly = {
  completedAt: TODAY_NOW,
  kickstart: false,
  profile: { carbCeilingStartedAt: null },
};

describe('the cholesterol check-ins (C8; NU-08, C109)', () => {
  it('the lipid test from the end of setup, in the HEALTH_SAFETY words; hidden for good', async () => {
    test = await todayFixture({
      ...lipidOnly,
      profile: { ...lipidOnly.profile, firstLowCarbAt: TODAY_NOW },
    });
    await renderToday();
    expect(titles()).toEqual([reminders.cholesterol.title['day-1']]);
    expect(screen.getByTestId('reminder-cholesterol').textContent).toContain(
      reminders.cholesterol.body,
    );
    const hide = within(card()).getByRole('button', { name: reminders.cholesterol.hide });
    hide.focus();
    fireEvent.click(hide);
    await waitFor(() => {
      expect(screen.queryByRole('region', { name: privacy.backupReminder.cardLabel })).toBeNull();
    });
    await clockTo(test, plusDays(55));
    // By now the backup reminder is due too (no backup since setup); no check-in yet.
    expect(screen.queryByTestId('reminder-cholesterol')).toBeNull();
    await clockTo(test, plusDays(56));
    await waitFor(() => {
      expect(titles()).toContain(reminders.cholesterol.title['day-56']);
    });
  });

  it('balanced at first: the lipid test hidden then comes back on the first low-carb day', async () => {
    test = await todayFixture({
      ...lipidOnly,
      profile: { dietMode: 'balanced', firstLowCarbAt: null, carbCeilingStartedAt: null },
      seed: (t) => t.repos.cardState.dismiss('cholesterol-checkin', 'day-1').then(() => undefined),
    });
    await renderToday();
    expect(screen.queryByRole('region', { name: privacy.backupReminder.cardLabel })).toBeNull();
    await clockTo(test, plusDays(30));
    // Item 21's switch, the only writer of the diet mode, sets the first low-carb day to now.
    await act(async () => {
      await test?.repos.dietMode.switchTo('moderate-low-carb', { endKickstart: false });
    });
    expect((await test.repos.profile.get()).firstLowCarbAt).toBe(plusDays(30));
    await waitFor(() => {
      expect(titles()).toContain(reminders.cholesterol.title['day-1']);
    });
  });
});

describe('the electrolyte reminder (C8; C72, C102)', () => {
  it.each([
    ['yes', true],
    ['unanswered', true],
    ['no', false],
  ] as const)(
    'on Kickstart day 15 with question 4 %s: the blood-pressure line is %s',
    async (q4, shown) => {
      test = await todayFixture({
        answers: q4 === 'unanswered' ? {} : { q4 },
        seed: q4 === 'unanswered' ? (t) => t.db.readiness.delete('q4') : undefined,
      });
      await renderToday();
      const item = screen.getByTestId('reminder-electrolytes');
      expect(item.textContent).toContain(reminders.electrolytes.body);
      expect(item.textContent.includes(readiness.bloodPressure.electrolyte)).toBe(shown);
    },
  );

  it('"Hide for today" hides it until local midnight and moves focus to the next title', async () => {
    test = await todayFixture();
    await renderToday();
    expect(titles()[0]).toBe(reminders.electrolytes.title);
    const hide = within(card()).getByRole('button', { name: reminders.electrolytes.hide });
    fireEvent.click(hide);
    await waitFor(() => {
      expect(screen.queryByTestId('reminder-electrolytes')).toBeNull();
    });
    expect(document.activeElement?.textContent).toBe(reminders.cholesterol.title['day-1']);
    expect(document.activeElement?.tagName).toBe('H3');
    await clockTo(test, '2000-03-15T10:59:00.000Z'); // 11:59 pm
    expect(screen.queryByTestId('reminder-electrolytes')).toBeNull();
    await clockTo(test, '2000-03-15T11:00:00.000Z'); // midnight
    expect(await screen.findByTestId('reminder-electrolytes')).toBeDefined();
  });

  it('T27: hiding the only reminder removes the card and moves focus to the next card heading', async () => {
    test = await todayFixture({
      kickstart: false,
      storage: 'not-protected',
      completedAt: plusDays(-3),
      profile: { carbCeilingStartedAt: null },
      seed: (t) => t.repos.cardState.dismiss('cholesterol-checkin', 'day-1').then(() => undefined),
    });
    await renderToday();
    expect(titles()).toEqual([privacy.backupReminder.title]);
    const notNow = within(card()).getByRole('button', { name: privacy.backupReminder.notNow });
    notNow.focus();
    fireEvent.click(notNow);
    await waitFor(() => {
      expect(document.activeElement?.textContent).toBe(weight.card.label);
    });
    expect(screen.queryByRole('region', { name: privacy.backupReminder.cardLabel })).toBeNull();
  });

  it('the backup title is a focusable h3 in the same card', async () => {
    test = await todayFixture();
    await renderToday();
    const backup = await screen.findByTestId('backup-reminder');
    const title = within(backup).getByRole('heading', { level: 3 });
    expect(title.textContent).toBe(privacy.backupReminder.title);
    expect(title.tabIndex).toBe(-1);
    expect(card().contains(backup)).toBe(true);
  });
});

describe('medication timing (C8; C07, RD-09): with the fasting timer, never twice', () => {
  const inMain = (text: string) => screen.getByRole('main').textContent.split(text).length - 1;

  it('question 4 yes and fasting available: on the Fast card, not in Reminders', async () => {
    test = await todayFixture({ answers: { q4: 'yes' } });
    await renderToday();
    const fast = screen.getByRole('region', { name: fasting.card.label });
    expect(fast.textContent).toContain(fasting.pharmacist);
    expect(screen.queryByTestId('reminder-medication')).toBeNull();
    expect(inMain(fasting.pharmacist)).toBe(1);
  });

  it('question 4 yes and fasting switched off (question 5 yes): a standing Reminders item, not on the Fast card', async () => {
    test = await todayFixture({ answers: { q4: 'yes' }, answersLater: { q5: 'yes' } });
    await renderToday();
    const item = await screen.findByTestId('reminder-medication');
    expect(item.textContent).toContain(fasting.pharmacist);
    expect(within(item).queryAllByRole('button')).toHaveLength(0);
    expect(screen.getByRole('region', { name: fasting.card.gatedLabel }).textContent).not.toContain(
      fasting.pharmacist,
    );
    expect(inMain(fasting.pharmacist)).toBe(1);
  });

  it('question 4 no: nowhere', async () => {
    test = await todayFixture();
    await renderToday();
    expect(inMain(fasting.pharmacist)).toBe(0);
    expect(screen.getByRole('region', { name: weight.card.label })).toBeDefined();
  });
});
