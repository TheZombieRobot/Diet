import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import type { WaterRecord } from '../packages/core/src/index';
import { today } from '../packages/core/src/copy/health';
import { commerceRules, healthPhraseRules } from '../tools/scans/rules';
import { scanText } from '../tools/scans/scan';
import {
  BASE_PATH,
  DIST_DIR,
  goTo,
  heading,
  returnToApp,
  seedOnboarded,
  waitForServiceWorkerControl,
} from './support/app';
import { lowContrastText } from './support/contrast';
import { storeRows } from './support/scenario';
import { startStaticServer, type SwitchableServer } from './support/staticServer';

// PWA-05: "Deploy a new version, reopen app online: 'Update available' banner; reload applies it;
// data intact". Build A is the production build the web server made. Build B is the same app
// with a different build label. One origin serves A, then switches to B, as a deploy would. The
// data check reads the real database (full review F45, F54).

const BUILD_B = 'e2e-update-b';
let buildB: string;
let server: SwitchableServer;

test.beforeAll(async () => {
  test.setTimeout(120_000);
  buildB = mkdtempSync(join(tmpdir(), 'diet-build-b-'));
  execFileSync(
    'pnpm',
    ['--filter', '@diet/mobile-web', 'exec', 'vite', 'build', '--outDir', buildB, '--emptyOutDir'],
    { env: { ...process.env, DIET_BUILD_ID: BUILD_B }, stdio: 'pipe' },
  );
  server = await startStaticServer(DIST_DIR, BASE_PATH);
});

test.beforeEach(() => {
  server.serve(DIST_DIR);
});

test.afterAll(async () => {
  await server.close();
  rmSync(buildB, { recursive: true, force: true });
});

const updateBanner = (page: Page) =>
  page.getByRole('status').filter({ hasText: 'Update available' });

/** How many times the browser has fetched sw.js since `from` requests (each is an update check). */
const swChecksSince = (from: number): number =>
  server.requests.slice(from).filter((p) => p === `${BASE_PATH}sw.js`).length;

test('a new version shows "Update available"; Reload switches to it and keeps saved data', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await seedOnboarded(page, `${server.origin}${BASE_PATH}#/about`, `${server.origin}${BASE_PATH}`);
  await waitForServiceWorkerControl(page);
  await expect(heading(page)).toHaveText('About');
  const versionA = await page.getByTestId('app-version').textContent();
  expect(versionA).not.toContain(BUILD_B);
  // A record in the database, written the way the person writes one: a glass of water on Today.
  await goTo(page, 'Today');
  const water = page.getByRole('region', { name: today.cards.water, exact: true });
  await water.getByRole('button', { name: today.water.add }).click();
  await expect(water.getByRole('status')).toHaveText('Added 250 mL. Today: 250 mL.');
  const before = await storeRows<WaterRecord>(page, 'water_log');
  expect(before).toHaveLength(1);
  // And the records setup wrote: the onboarding weigh-in and the readiness answers (F54).
  const kept = async () => ({
    weights: await storeRows(page, 'weights'),
    readiness: await storeRows(page, 'readiness'),
  });
  const keptBefore = await kept();
  expect(keptBefore.weights).toHaveLength(1);
  expect(keptBefore.readiness).toHaveLength(7);
  await expect(page.getByText('Update available')).toHaveCount(0);

  // Deploy build B, then check for it directly (the resume test below covers the app's own check).
  server.serve(buildB);
  await page.evaluate(async () => {
    await (await navigator.serviceWorker.getRegistration())?.update();
  });

  const banner = updateBanner(page);
  await expect(banner).toBeVisible({ timeout: 15_000 });
  const text = (await banner.innerText()).replace(/\s+/g, ' ');
  expect(scanText('update banner', text, [...healthPhraseRules, ...commerceRules])).toEqual([]);

  // The button the person taps is a full-size target, and the banner is readable in both themes.
  const reload = banner.getByRole('button', { name: 'Reload' });
  const box = await reload.boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(48);
  expect(box?.height).toBeGreaterThanOrEqual(48);
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    const { low, checked } = await lowContrastText(
      page,
      `Today with the update banner, ${colorScheme}`,
    );
    expect(low).toEqual([]);
    expect(checked).toBeGreaterThan(10);
  }

  await Promise.all([page.waitForEvent('load', { timeout: 15_000 }), reload.click()]);
  // Data intact: the same record in the database, and on Today, under build B.
  await expect(page.getByTestId('water-total')).toHaveText('250 mL');
  expect(await storeRows<WaterRecord>(page, 'water_log')).toEqual(before);
  expect(await kept()).toEqual(keptBefore);
  await goTo(page, 'About');
  await expect(page.getByTestId('app-version')).toContainText(BUILD_B);
  await expect(page.getByText('Update available')).toHaveCount(0);
});

test('a new version changes only the app chunk: the vendor and jsQR files keep their names, so an update does not fetch them again', () => {
  const scripts = (dir: string) =>
    readdirSync(join(dir, 'assets')).filter((name) => name.endsWith('.js'));
  const [a, b] = [scripts(DIST_DIR), scripts(buildB)];
  // Build B differs from build A only in its build label, which is in the app's own code.
  expect(a.filter((name) => !b.includes(name))).toEqual([
    expect.stringMatching(/^index-[\w-]+\.js$/),
  ]);
  for (const chunk of [/^vendor-[\w-]+\.js$/, /^jsQR-[\w-]+\.js$/]) {
    expect(a.filter((name) => chunk.test(name) && b.includes(name))).toHaveLength(1);
  }
});

test('coming back to the app finds a new version by itself (an installed app resumed)', async ({
  page,
}) => {
  const start = server.requests.length;
  const swChecks = () => swChecksSince(start);
  await seedOnboarded(page, `${server.origin}${BASE_PATH}#/about`, `${server.origin}${BASE_PATH}`);
  await waitForServiceWorkerControl(page);

  // Chrome looks for a new sw.js by itself about a second after each navigation: here, after the
  // reload that put the page under the service worker. Wait for that check and a quiet moment
  // after it, so that only the app's own check, on return, can find build B.
  await expect.poll(swChecks, { timeout: 15_000 }).toBeGreaterThanOrEqual(2);
  let settled = swChecks();
  await expect
    .poll(
      async () => {
        await page.waitForTimeout(1_000);
        const now = swChecks();
        const quiet = now === settled;
        settled = now;
        return quiet;
      },
      { timeout: 15_000 },
    )
    .toBe(true);

  server.serve(buildB);
  await page.waitForTimeout(1_000);
  expect(swChecks()).toBe(settled);
  await expect(updateBanner(page)).toHaveCount(0);

  // The installed app is resumed from the background: no navigation, no reload, no update() here.
  await returnToApp(page);
  await expect(updateBanner(page)).toBeVisible({ timeout: 15_000 });
  expect(swChecks()).toBe(settled + 1);

  await updateBanner(page).getByRole('button', { name: 'Reload' }).click();
  await expect(page.getByTestId('app-version')).toContainText(BUILD_B, { timeout: 15_000 });
});
