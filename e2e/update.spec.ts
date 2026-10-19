import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { commerceRules, healthPhraseRules } from '../tools/scans/rules';
import { scanText } from '../tools/scans/scan';
import {
  BASE_PATH,
  DIST_DIR,
  heading,
  returnToApp,
  waitForServiceWorkerControl,
} from './support/app';
import { lowContrastText } from './support/contrast';
import { startStaticServer, type SwitchableServer } from './support/staticServer';

// PWA-05: "Deploy a new version, reopen app online: 'Update available' banner; reload applies it;
// data intact". Build A is the production build the web server made. Build B is the same app
// with a different build label. One origin serves A, then switches to B, as a deploy would.

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
  await page.goto(`${server.origin}${BASE_PATH}#/about`);
  await waitForServiceWorkerControl(page);
  await expect(heading(page)).toHaveText('About');
  const versionA = await page.getByTestId('app-version').textContent();
  expect(versionA).not.toContain(BUILD_B);
  // Stands in for the person's records until the database arrives (checklist item 12).
  await page.evaluate(() => {
    localStorage.setItem('e2e-kept', 'still here');
  });
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
      `About with the update banner, ${colorScheme}`,
    );
    expect(low).toEqual([]);
    expect(checked).toBeGreaterThan(10);
  }

  await reload.click();
  await expect(page.getByTestId('app-version')).toContainText(BUILD_B, { timeout: 15_000 });
  await expect(page.getByText('Update available')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('e2e-kept'))).toBe('still here');
});

test('coming back to the app finds a new version by itself (an installed app resumed)', async ({
  page,
}) => {
  const start = server.requests.length;
  const swChecks = () => swChecksSince(start);
  await page.goto(`${server.origin}${BASE_PATH}#/about`);
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
