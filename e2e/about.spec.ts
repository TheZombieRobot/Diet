import { expect, type Page, test } from '@playwright/test';
import { about, alcohol, general, onboarding, readiness } from '../packages/core/src/copy/health';
import { heading, seedOnboarded, waitForServiceWorkerControl } from './support/app';

// HS-13 (About portion) and PWA-03 in the production build (item 16 design section 5.3 E1): the
// not-a-medical-device sentence, every help number as a link to call or text with only 111 in
// the emergency style, privacy with the shared-origin caveat (C34), the badge lines that name no
// food data source (C97) and the version; online, offline, and from inside setup (C41).

const LINKS = ['tel:111', 'tel:0800611116', 'tel:0800787797', 'sms:8681', 'tel:1737', 'sms:1737'];
const SHOWN = ['111', '0800 611 116', '0800 787 797', 'Text 8681', 'Text 1737'];

async function expectHelpNumbers(page: Page): Promise<void> {
  const main = page.getByRole('main');
  const hrefs = await main
    .getByRole('link')
    .evaluateAll((links) => links.map((a) => a.getAttribute('href')));
  expect(hrefs).toEqual(expect.arrayContaining(LINKS));
  const text = await main.innerText();
  for (const number of SHOWN) expect(text).toContain(number);
  await expect(main.locator('.ui-action-row--emergency')).toHaveCount(1);
  await expect(main.locator('.ui-action-row--emergency')).toHaveAttribute('href', 'tel:111');
}

async function expectAbout(page: Page): Promise<void> {
  await expect(heading(page)).toHaveText('About');
  const main = page.getByRole('main');
  await expect(main).toContainText(general.about);
  await expect(main).toContainText(about.sharedOrigin);
  await expectHelpNumbers(page);
  const sources = page.getByRole('region', { name: 'Data sources' });
  for (const line of about.dataSources.badges) await expect(sources).toContainText(line);
  await expect(page.getByTestId('app-version')).toBeVisible();
  await expect(page.getByTestId('app-version')).not.toBeEmpty();
}

test('HS-13: About says what the app is, lists every help number, and names no data source; offline too', async ({
  page,
  context,
}) => {
  await seedOnboarded(page, './#/about');
  await waitForServiceWorkerControl(page);
  await expectAbout(page);
  await context.setOffline(true);
  await page.reload();
  await expectAbout(page);
});

test('C41: About is reachable from setup, after the alcohol notice, with every help number', async ({
  page,
}) => {
  await page.goto('./');
  await expect(heading(page)).toHaveText(onboarding.welcome.title);
  await page.getByRole('button', { name: onboarding.frame.continue }).click();
  await expect(heading(page)).toHaveText(alcohol.notice.title);
  await page.getByRole('button', { name: alcohol.notice.acknowledge }).click();
  await expect(heading(page)).toHaveText(readiness.questions.q1);
  await page.getByRole('button', { name: onboarding.frame.helpLink }).click();
  await expect(heading(page)).toHaveText('About');
  await expectHelpNumbers(page);
});
