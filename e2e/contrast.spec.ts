import { expect, test } from '@playwright/test';
import { parseColour } from '../packages/ui/src/tokens';
import {
  GROUND,
  seedOnboarded,
  VIEW_TODAY_OFF,
  VIEW_TODAY_OPEN,
  visitEveryView,
} from './support/app';
import { lowContrastText, MIN_CONTRAST, textSamples } from './support/contrast';

// Text must stay readable in sunlight (UX_SCREENS.md design rules; WCAG 2 AA). tokens.test.ts
// checks the main colour pairs from the token list; this sweep checks what the browser actually
// draws on a 360 × 740 phone: every piece of text on every screen and sub-screen, against the
// backgrounds beneath it, in both themes, with the conditional parts open (visitEveryView: the
// install banner, the "+" panel, the install button, the backup panels and the offline pill).

for (const colorScheme of ['light', 'dark'] as const) {
  test(`${colorScheme}: every piece of text on every screen has at least ${MIN_CONTRAST}:1 contrast`, async ({
    page,
    context,
  }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 360, height: 740 });
    await page.emulateMedia({ colorScheme });
    await seedOnboarded(page);
    // The theme really is the one under test (a sweep of the wrong theme would prove nothing).
    const ground = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(parseColour(ground)).toEqual(parseColour(GROUND[colorScheme]));

    const low: string[] = [];
    let checked = 0;
    const swept = async () => (await textSamples(page)).map((sample) => sample.text);
    await visitEveryView(page, context, async (view) => {
      const result = await lowContrastText(page, view);
      low.push(...result.low);
      checked += result.checked;
      // The aria-disabled exemption must not skip the quick actions built since (the Off row
      // is aria-disabled but meant to be read at full contrast).
      if (view === VIEW_TODAY_OPEN) {
        expect(await swept()).toEqual(expect.arrayContaining(['Finish meal', 'Open grocery list']));
      }
      if (view === VIEW_TODAY_OFF) {
        expect(await swept()).toEqual(expect.arrayContaining(['Add drink', 'Off']));
      }
    });

    expect(low).toEqual([]);
    expect(checked).toBeGreaterThan(60);
  });
}
