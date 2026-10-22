import { expect, test } from '@playwright/test';
import { auditPage, describeFinding, type Finding, isSevere } from './support/a11y';
import { GROUND, SCREENS, seedOnboarded, SUB_SCREENS, visitEveryView } from './support/app';
import { parseColour } from '../packages/ui/src/tokens';

// Checklist item 37: the accessibility audit Lighthouse's accessibility category runs (axe-core,
// with WCAG 2.2 A and AA and axe's best practices), on a 360 × 740 phone in both themes, on every
// screen and sub-screen with the conditional parts open. A serious or critical finding fails;
// any other is listed on the test's report. Setup's views get the same audit in first-run.spec.ts
// (P8). Contrast, 48 px targets and 200% text have their own sweeps (contrast.spec.ts and
// shell.spec.ts), which are stricter than the audit's.

for (const colorScheme of ['light', 'dark'] as const) {
  test(`${colorScheme}: every screen passes the accessibility audit with no serious or critical finding`, async ({
    page,
    context,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 360, height: 740 });
    await page.emulateMedia({ colorScheme });
    await seedOnboarded(page);
    const ground = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(parseColour(ground)).toEqual(parseColour(GROUND[colorScheme]));

    const found: Finding[] = [];
    const audited: string[] = [];
    await visitEveryView(page, context, async (view) => {
      found.push(...(await auditPage(page, view)));
      audited.push(view);
    });

    for (const finding of found.filter((f) => !isSevere(f))) {
      test
        .info()
        .annotations.push({ type: 'accessibility', description: describeFinding(finding) });
    }
    expect(found.filter(isSevere).map(describeFinding)).toEqual([]);
    expect(audited).toEqual(expect.arrayContaining([...SCREENS, ...SUB_SCREENS]));
  });
}

test('the audit reports an unnamed button, an unlabelled field and an image with no text, and makes no request', async ({
  page,
}) => {
  await seedOnboarded(page);
  expect(await auditPage(page, 'Today')).toEqual([]);
  await page.evaluate(() => {
    document
      .querySelector('main')
      ?.insertAdjacentHTML(
        'beforeend',
        '<button type="button"></button><input type="text"><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">',
      );
  });
  const rules = (await auditPage(page, 'Today, planted')).filter(isSevere).map((f) => f.rule);
  expect(rules.sort()).toEqual(['button-name', 'image-alt', 'label']);
});
