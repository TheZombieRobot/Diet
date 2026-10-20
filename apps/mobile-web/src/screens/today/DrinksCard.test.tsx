// The Drinks card (item 16 design section 5.2 C6; TD-05, NN-09, C25, C46, RD-01, HS-19, C11).
import type { AlcoholGuidanceSet, ProfileSex } from '@diet/core';
import { alcohol, readiness, today } from '@diet/core/copy/health';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { TestDb } from '../../db/testKit';
import { DrinksCard } from './DrinksCard';
import { renderToday, resetToday, todayFixture } from './todayTestKit';

let test: TestDb | undefined;
afterEach(() => {
  cleanup();
  resetToday(test);
  test = undefined;
});

const card = () => screen.getByRole('region', { name: today.cards.drinks });

/** Every line of text in the card under its heading, leaf by leaf. */
const lines = (region: HTMLElement): string[] =>
  [...region.querySelectorAll('*')]
    .filter((e) => e.children.length === 0 && !e.closest('.ui-card__header'))
    .map((e) => e.textContent.trim())
    .filter((text) => text !== '');

describe('the Drinks card (C6; TD-05)', () => {
  it.each(['nz-women', 'nz-men'] as const)(
    'NN-09: the %s card is exactly its guidance line, ending "No alcohol use is risk-free.", and the later-step line',
    (set) => {
      render(<DrinksCard drinks={{ kind: 'guidance', set }} />);
      // Exactly these two lines, so no other line can carry figures without the sentence.
      expect(lines(card())).toEqual([alcohol.guidance.line[set], today.laterStep.drinks]);
      expect(alcohol.guidance.line[set].endsWith(alcohol.noRiskFreeLevel)).toBe(true);
      expect(today.laterStep.drinks).not.toMatch(/\d/);
      expect(card().textContent).not.toMatch(/kcal|cans|\bleft\b|streak/i);
    },
  );

  it.each([
    ['female', 'nz-men', 'nz-women'],
    [null, null, 'nz-women'],
    ['male', 'nz-women', 'nz-women'],
    ['male', null, 'nz-men'],
  ] as const)(
    'C25, C46: sex %s with setting %s shows the %s line',
    async (sex: ProfileSex | null, setting: AlcoholGuidanceSet | null, set) => {
      test = await todayFixture({
        profile: { sex },
        seed: (t) => t.repos.settings.update({ alcoholGuidanceSet: setting }).then(() => undefined),
      });
      await renderToday();
      expect(screen.getByTestId('drinks-guidance').textContent).toBe(alcohol.guidance.line[set]);
      if (set === 'nz-women') expect(card().textContent).not.toMatch(/3 standard drinks|15 a week/);
    },
  );

  it('F30, TD-05: with readiness answer 2 "yes" the card shows the pregnancy line and no daily or weekly figures', async () => {
    // Unanswered (also gated) is covered by guidanceShown's own test in core.
    test = await todayFixture({ answers: { q2: 'yes' }, fast: false, kickstart: false });
    await renderToday();
    expect(lines(card())).toEqual([alcohol.guidance.pregnancy, today.laterStep.drinks]);
    expect(card().textContent).not.toMatch(/\d|standard drinks?/);
  });

  it('RD-01: under 18 the card stays with the reason and shows no figures', async () => {
    test = await todayFixture({ answers: { q1: 'yes' }, fast: false });
    await renderToday();
    expect(card().textContent).not.toMatch(/standard drinks?|alcohol-free/i);
    const reason = within(card()).getByTestId('gate-notice-alcoholLogging');
    expect(reason.textContent).toContain(readiness.featureNames.alcoholLogging);
    // The only figure is the reason's own "under 18".
    expect(card().textContent.replace(reason.textContent, '')).not.toMatch(/\d/);
    expect(within(card()).queryByTestId('later-step')).toBeNull();
  });
});
