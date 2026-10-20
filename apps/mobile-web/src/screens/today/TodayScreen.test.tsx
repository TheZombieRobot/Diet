// Today's order and states (item 16 design section 5.2: C2, C7, C10, C12). The real
// repositories on fake-indexeddb with the test clock; synthetic records only.
import { alcohol, fasting, privacy, targets, today, weight } from '@diet/core/copy/health';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { counts, type TestDb } from '../../db/testKit';
import { TodayScreen } from './TodayScreen';
import { regionLabels, renderToday, resetToday, TODAY_NOW, todayFixture } from './todayTestKit';

let test: TestDb | undefined;
afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
  resetToday(test);
  test = undefined;
});

const DAY = 86_400_000;
const daysBefore = (days: number) => new Date(Date.parse(TODAY_NOW) - days * DAY).toISOString();
const reminders = privacy.backupReminder.cardLabel;

describe('TD-01: the order of Today (C2; BK-03, D25, AL-09)', () => {
  it('the UX cards in order after the status block, with Reminders last', async () => {
    test = await todayFixture({ kickstart: false });
    const main = await renderToday();
    await screen.findByTestId('backup-reminder');
    expect(main.firstElementChild?.getAttribute('data-testid')).toBe('today-status');
    expect(regionLabels(main)).toEqual([
      weight.card.label,
      'Fast',
      targets.today.label,
      today.cards.water,
      today.cards.steps,
      today.cards.movement,
      today.cards.drinks,
      reminders,
    ]);
  });

  it('storage not protected: Reminders comes first with Backup first; the Talk card comes before it; then the update card', async () => {
    test = await todayFixture({
      kickstart: false,
      storage: 'not-protected',
      completedAt: daysBefore(3),
      answers: { q7: 'yes' },
      seed: async (t) => {
        await t.repos.cardState.markShown('update-notice', 'v2');
      },
    });
    const main = await renderToday();
    await screen.findByText(alcohol.helpCard);
    await screen.findByTestId('update-notice');
    const labels = regionLabels(main);
    expect(labels.slice(0, 4)).toEqual([
      alcohol.helpCardLabel,
      reminders,
      privacy.backupReminder.updateCardLabel,
      weight.card.label,
    ]);
    expect(labels.filter((l) => l === reminders)).toHaveLength(1);
    const card = screen.getByRole('region', { name: reminders });
    expect(within(card).getAllByRole('heading', { level: 3 })[0]?.textContent).toBe(
      privacy.backupReminder.title,
    );
  });

  it('no Reminders card when nothing is due', async () => {
    test = await todayFixture({
      kickstart: false,
      seed: async (t) => {
        await t.repos.settings.recordBackup(TODAY_NOW);
        await t.repos.cardState.dismiss('cholesterol-checkin', 'day-1');
      },
    });
    const main = await renderToday();
    expect(regionLabels(main)).not.toContain(reminders);
  });
});

describe('Talk to someone on Today (C7; AL-09, AL-09b, C41, C58)', () => {
  it('question 7 yes: first, with the weekend wording, call, text and a red 111 row only', async () => {
    test = await todayFixture({ answers: { q7: 'yes' } });
    const main = await renderToday();
    const card = await screen.findByRole('region', { name: alcohol.helpCardLabel });
    expect(regionLabels(main)[0]).toBe(alcohol.helpCardLabel);
    expect(card.textContent).toMatch(/heavily at weekends/i);
    const links = within(card).getAllByRole('link');
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      'tel:0800787797',
      'sms:8681',
      'tel:111',
    ]);
    expect(links.map((a) => a.classList.contains('ui-action-row--emergency'))).toEqual([
      false,
      false,
      true,
    ]);
    expect(card.textContent).toContain(alcohol.helpCardReturns);
    expect(regionLabels(main).filter((l) => l === alcohol.helpCardLabel)).toHaveLength(1);
  });

  it('shown with question 7 unanswered, and under 18 with question 7 yes', async () => {
    test = await todayFixture({ answers: { q1: 'yes', q7: 'yes' }, fast: false });
    await renderToday();
    expect(await screen.findByRole('region', { name: alcohol.helpCardLabel })).toBeDefined();
    cleanup();
    resetToday(test);
    test = await todayFixture({ seed: (t) => t.db.readiness.delete('q7') });
    await renderToday();
    expect(await screen.findByRole('region', { name: alcohol.helpCardLabel })).toBeDefined();
  });

  it('"Not now" hides it and moves focus to the next card heading (T27)', async () => {
    test = await todayFixture({ answers: { q7: 'yes' } });
    await renderToday();
    const card = await screen.findByRole('region', { name: alcohol.helpCardLabel });
    const notNow = within(card).getByRole('button', { name: alcohol.helpCardNotNow });
    notNow.focus();
    fireEvent.click(notNow);
    await waitFor(() => {
      expect(screen.queryByRole('region', { name: alcohol.helpCardLabel })).toBeNull();
    });
    await waitFor(() => {
      expect(document.activeElement?.textContent).toBe(weight.card.label);
    });
    expect(document.activeElement?.tagName).toBe('H2');
  });

  it('question 7 no: not shown', async () => {
    test = await todayFixture();
    const main = await renderToday();
    expect(regionLabels(main)).not.toContain(alcohol.helpCardLabel);
  });
});

describe('Today before setup, while reading, and when the read fails (C10, C12; TD-02, HS-20, C41)', () => {
  it.each(['onboardingCompletedAt', 'alcoholNoticeAckAt'] as const)(
    'with %s missing: the date and one line, nothing to tap and nothing written',
    async (field) => {
      // A gap in item 13's guard (a deep link, a reload mid-flow, an import; C53), written past
      // the settings repository, which refuses it.
      test = await todayFixture({
        seed: async (t) => {
          const settings = await t.repos.settings.get();
          await t.db.settings.put({ ...settings, [field]: null });
        },
      });
      const before = await counts(test.db);
      render(
        <main>
          <TodayScreen />
        </main>,
      );
      expect(await screen.findByText(today.setupFirst)).toBeDefined();
      const main = screen.getByRole('main');
      expect(screen.getByTestId('today-date').textContent).toBe('Wednesday 15 March');
      expect(within(main).queryAllByRole('button')).toHaveLength(0);
      expect(within(main).queryAllByRole('switch')).toHaveLength(0);
      expect(main.querySelectorAll('section')).toHaveLength(0);
      for (const element of main.querySelectorAll('*')) fireEvent.click(element);
      expect(await counts(test.db)).toEqual(before);
    },
  );

  it('while the first read is pending: only the date', async () => {
    test = await todayFixture();
    vi.spyOn(test.repos.steps, 'get').mockReturnValue(new Promise(() => undefined));
    render(
      <main>
        <TodayScreen />
      </main>,
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    const main = screen.getByRole('main');
    expect(screen.getByTestId('today-date')).toBeDefined();
    expect(main.querySelectorAll('section')).toHaveLength(0);
    expect(within(main).queryAllByRole('button')).toHaveLength(0);
  });

  it('a failed read says so and offers a reload, under the status line and the Talk to someone card, which have their own reads (T24; HS-02, AL-09)', async () => {
    // A fast from 11:20 am on 14 March: 27 h at 2:20 pm.
    test = await todayFixture({ answers: { q7: 'yes' }, fast: '2000-03-13T22:20:00.000Z' });
    vi.spyOn(test.repos.water, 'listByIndex').mockRejectedValue(new Error('synthetic failure'));
    render(
      <main>
        <TodayScreen />
      </main>,
    );
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(today.readFailed);
    await waitFor(() => {
      expect(screen.getByTestId('today-status-line').textContent).toBe(
        `Fasting 27 h. ${fasting.card.overCeiling}`,
      );
    });
    await screen.findByRole('region', { name: alcohol.helpCardLabel });
    expect(regionLabels(screen.getByRole('main'))).toEqual([alcohol.helpCardLabel]);
    fireEvent.click(within(alert).getByRole('button', { name: today.reload }));
    expect(test.storage.platform.reloads).toBe(1);
  });

  it('a failed read before setup is finished: only the date and the reload, nothing to write (HS-20)', async () => {
    test = await todayFixture({
      answers: { q7: 'yes' },
      seed: async (t) => {
        const settings = await t.repos.settings.get();
        await t.db.settings.put({ ...settings, onboardingCompletedAt: null });
      },
    });
    vi.spyOn(test.repos.water, 'listByIndex').mockRejectedValue(new Error('synthetic failure'));
    render(
      <main>
        <TodayScreen />
      </main>,
    );
    await screen.findByRole('alert');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
    const main = screen.getByRole('main');
    expect(main.querySelectorAll('section')).toHaveLength(0);
    expect(screen.queryByTestId('today-status-line')).toBeNull();
    expect(
      within(main)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual([today.reload]);
  });

  it("Movement: one later-step line, no figure and no button (Nutrition today is item 21's card)", async () => {
    test = await todayFixture();
    await renderToday();
    const card = screen.getByRole('region', { name: today.cards.movement });
    expect(within(card).getAllByTestId('later-step')).toHaveLength(1);
    expect(card.textContent).not.toMatch(/\d/);
    expect(within(card).queryAllByRole('button')).toHaveLength(0);
    expect(screen.getAllByTestId('later-step')).toHaveLength(1); // Movement (drinks: item 28)
  });
});
