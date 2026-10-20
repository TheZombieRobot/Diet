// TD-01: the Today snapshot (item 16 design section 5.2 C1, T18). A structural text outline,
// with explicit assertions beside it so a wrong first snapshot cannot pass. CI runs with CI=true,
// where Vitest refuses to write a missing snapshot, and a guard requires the committed file.
import { alcohol, fasting, privacy, reminders, targets } from '@diet/core/copy/health';
import { cleanup, screen, within } from '@testing-library/react';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { TestDb } from '../../db/testKit';
import { todayOutline } from './outline';
import { regionLabels, renderToday, resetToday, todayFixture } from './todayTestKit';

let test: TestDb | undefined;
afterEach(() => {
  cleanup();
  resetToday(test);
  test = undefined;
});

describe('TD-01: the Today snapshot (C1)', () => {
  it('the committed snapshot exists, so CI compares rather than writes', () => {
    expect(
      existsSync(join(import.meta.dirname, '__snapshots__', 'TodayScreen.snapshot.test.tsx.snap')),
    ).toBe(true);
  });

  it('(a) the full fixture', async () => {
    test = await todayFixture();
    const main = await renderToday();
    await screen.findByTestId('today-status-line');
    await screen.findByTestId('backup-reminder');
    const outline = todayOutline(main);
    expect(outline.status).toEqual([
      'Wednesday 15 March',
      'Fasting 19 h 20 m. Eating window opens 6:00 pm.',
    ]);
    expect(screen.getByTestId('water-total').textContent).toBe('500 mL');
    expect(screen.getByRole('switch', { name: 'Electrolytes today' })).toHaveProperty(
      'checked',
      true,
    );
    expect(screen.getByTestId('steps-today').textContent).toBe('Not entered today');
    expect(screen.getByRole('button', { name: 'Same as yesterday: 12,000' })).toBeDefined();
    expect(screen.getByTestId('drinks-guidance').textContent).toBe(
      alcohol.guidance.line['nz-women'],
    );
    const reminderCard = screen.getByRole('region', { name: privacy.backupReminder.cardLabel });
    expect(
      within(reminderCard)
        .getAllByRole('heading', { level: 3 })
        .map((h) => h.textContent),
    ).toEqual([
      reminders.electrolytes.title,
      reminders.cholesterol.title['day-1'],
      privacy.backupReminder.title,
    ]);
    expect(regionLabels(main)).not.toContain(alcohol.helpCardLabel);
    // Item 21's card on a Kickstart day: protein at the top of the range, net carbs at 20 g.
    const nutrition = outline.blocks.find((b) => b.label === targets.today.label);
    expect(nutrition?.lines).toEqual(
      expect.arrayContaining(['Protein 0 of 140 g', 'Net carbs 0 / 20 g']),
    );
    expect(outline).toMatchSnapshot();
  });

  it('(b) fasting gated (q5 yes after the fast began) and q7 yes', async () => {
    test = await todayFixture({ answers: { q7: 'yes' }, answersLater: { q5: 'yes' } });
    const main = await renderToday();
    await screen.findByTestId('today-status-line');
    await screen.findByText(alcohol.helpCard);
    const outline = todayOutline(main);
    expect(regionLabels(main)[0]).toBe(alcohol.helpCardLabel);
    expect(outline.blocks[0]?.lines.join(' ')).toMatch(/heavily at weekends/i);
    expect(outline.status).toEqual([
      'Wednesday 15 March',
      'A fast you started is still open (19 h 20 m). You can end it below.',
    ]);
    expect(outline.status.join(' ')).not.toMatch(/Fasting|Eating window/);
    const reminderCard = screen.getByRole('region', { name: privacy.backupReminder.cardLabel });
    expect(within(reminderCard).queryByTestId('reminder-electrolytes')).toBeNull();
    expect(reminderCard.textContent).not.toMatch(/Kickstart|carb ceiling/i);
    const fastCard = screen.getByRole('region', { name: fasting.card.gatedLabel });
    expect(
      within(fastCard).getByRole('button', { name: fasting.gated.endOpenFast }),
    ).toHaveProperty('disabled', false);
    // Answer 5: item 21's card shows plain figures, with no target and no diet mode.
    const nutrition = screen.getByRole('region', { name: targets.today.label });
    expect(nutrition.textContent).toContain(targets.today.plainNote);
    expect(nutrition.textContent).not.toMatch(/ of |Keto/);
    expect(outline).toMatchSnapshot();
  });
});
