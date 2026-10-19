import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { commerceRules, healthPhraseRules } from '../tools/scans/rules';
import { scanText } from '../tools/scans/scan';
import { BASE_PATH, DIST_DIR, heading, waitForServiceWorkerControl } from './support/app';
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

test.afterAll(async () => {
  await server.close();
  rmSync(buildB, { recursive: true, force: true });
});

test('a new version shows "Update available"; Reload switches to it and keeps saved data', async ({
  page,
}) => {
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

  // Deploy build B, then let the app check for it (as reopening or returning to the app does).
  server.serve(buildB);
  await page.evaluate(async () => {
    await (await navigator.serviceWorker.getRegistration())?.update();
  });

  const banner = page.getByRole('status').filter({ hasText: 'Update available' });
  await expect(banner).toBeVisible({ timeout: 15_000 });
  const text = (await banner.innerText()).replace(/\s+/g, ' ');
  expect(scanText('update banner', text, [...healthPhraseRules, ...commerceRules])).toEqual([]);

  await banner.getByRole('button', { name: 'Reload' }).click();
  await expect(page.getByTestId('app-version')).toContainText(BUILD_B, { timeout: 15_000 });
  await expect(page.getByText('Update available')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('e2e-kept'))).toBe('still here');
});
