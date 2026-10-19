import { expect, test } from '@playwright/test';
import { parseColour } from '../packages/ui/src/tokens';
import { goTo, GROUND, offerInstall, visitEveryScreen } from './support/app';
import { lowContrastText, MIN_CONTRAST } from './support/contrast';

// Text must stay readable in sunlight (UX_SCREENS.md design rules; WCAG 2 AA). tokens.test.ts
// checks the main colour pairs from the token list; this sweep checks what the browser actually
// draws: every piece of text on every screen, against the backgrounds beneath it, in both themes,
// with the conditional parts open (the install banner, the "+" panel, the install button and the
// offline pill). The update banner is swept in update.spec.ts, once a real update is waiting.

for (const colorScheme of ['light', 'dark'] as const) {
  test(`${colorScheme}: every piece of text on every screen has at least ${MIN_CONTRAST}:1 contrast`, async ({
    page,
    context,
  }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto('./');
    // The theme really is the one under test (a sweep of the wrong theme would prove nothing).
    const ground = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(parseColour(ground)).toEqual(parseColour(GROUND[colorScheme]));

    const low: string[] = [];
    let checked = 0;
    const sweep = async (where: string) => {
      const result = await lowContrastText(page, where);
      low.push(...result.low);
      checked += result.checked;
    };

    await visitEveryScreen(page, (screen) => sweep(screen));
    await offerInstall(page);
    await goTo(page, 'Today');
    await expect(page.getByText('Install this app')).toBeVisible();
    await page.getByRole('button', { name: 'Quick actions' }).click();
    await sweep('Today with the install banner and quick actions');
    await goTo(page, 'Settings');
    await expect(page.getByRole('button', { name: 'Install app' })).toBeVisible();
    await sweep('Settings with the install button');
    await context.setOffline(true);
    await expect(page.getByRole('banner').getByRole('status')).toHaveText(/^Offline/);
    await sweep('Settings offline');

    expect(low).toEqual([]);
    expect(checked).toBeGreaterThan(60);
  });
}
