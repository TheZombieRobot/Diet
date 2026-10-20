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

/** NN-09 at render level: every element that names standard drinks also says no use is risk-free. */
function expectRiskFreeBeside(region: HTMLElement): void {
  const named = [...region.querySelectorAll('*')].filter(
    (e) => e.children.length === 0 && /standard drinks?/i.test(e.textContent),
  );
  expect(named.length).toBeGreaterThan(0);
  for (const element of named) expect(element.textContent).toContain(alcohol.noRiskFreeLevel);
}

describe('the Drinks card (C6; TD-05)', () => {
  it.each(['nz-women', 'nz-men'] as const)(
    'the %s line carries "No alcohol use is risk-free." and nothing that scores',
    (set) => {
      render(<DrinksCard drinks={{ kind: 'guidance', set }} />);
      expect(screen.getByTestId('drinks-guidance').textContent).toBe(alcohol.guidance.line[set]);
      expect(card().textContent).toMatch(/no alcohol use is risk-free/i);
      expectRiskFreeBeside(card());
      expect(screen.getByTestId('later-step').textContent).not.toMatch(/\d/);
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
