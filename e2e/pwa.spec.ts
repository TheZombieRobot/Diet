import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import {
  BASE_PATH,
  BRAND_TEAL,
  goTo,
  heading,
  pngSize,
  SCREENS,
  screenArrived,
  seedOnboarded,
  visitEveryScreen,
  waitForServiceWorkerControl,
} from './support/app';

// PWA-01 as replaced by DOC_REVIEW C35 (Lighthouse 12 has no PWA audit): Chrome's own
// installability check, a manifest check that fetches every icon, and service-worker control.
// PWA-03 (offline part): with the network off, the app reloads and every screen opens.
// The same checks run against the deployed HTTPS URL after each deploy (pages.yml, verify).

interface ManifestIcon {
  src: string;
  sizes: string;
  type: string;
  purpose?: string;
}
interface Manifest {
  id: string;
  name: string;
  short_name: string;
  description: string;
  start_url: string;
  scope: string;
  display: string;
  theme_color: string;
  background_color: string;
  icons: ManifestIcon[];
}

/** Chrome's installability error ids for the page, from the DevTools protocol. */
async function installabilityErrors(context: BrowserContext, page: Page): Promise<string[]> {
  const cdp = await context.newCDPSession(page);
  try {
    const { installabilityErrors: errors } = await cdp.send('Page.getInstallabilityErrors');
    return errors.map((e) => e.errorId);
  } finally {
    await cdp.detach();
  }
}

test('Chrome finds nothing stopping installation (Page.getInstallabilityErrors)', async ({
  playwright,
  baseURL,
}) => {
  // Playwright's default headless shell reports no errors whatever the page holds, and a fresh
  // context counts as incognito ("in-incognito"). So this runs the full Chromium build with a
  // real, throwaway profile, where Chrome's own installability check runs (item 5 review).
  const profile = mkdtempSync(join(tmpdir(), 'diet-install-check-'));
  const context = await playwright.chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    serviceWorkers: 'allow',
    ...(baseURL === undefined ? {} : { baseURL }),
  });
  try {
    const page = context.pages()[0] ?? (await context.newPage());

    // The control: a page with no manifest, at the same origin, must be reported as such, so
    // this check can never quietly turn into one that passes whatever it is given.
    const control = new URL('/diet-installability-control.html', baseURL).href;
    await context.route(control, (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><title>No manifest</title><p>A page with no manifest.</p>',
      }),
    );
    await page.goto(control);
    expect(await installabilityErrors(context, page)).toContain('no-manifest');

    await seedOnboarded(page);
    await waitForServiceWorkerControl(page);
    expect(await installabilityErrors(context, page)).toEqual([]);
    const cdp = await context.newCDPSession(page);
    const { errors } = await cdp.send('Page.getAppManifest');
    expect(errors).toEqual([]);
  } finally {
    await context.close();
    rmSync(profile, { recursive: true, force: true });
  }
});

test('the manifest has every field installation needs, and every icon it lists exists', async ({
  page,
  request,
}) => {
  await seedOnboarded(page);
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBe(`${BASE_PATH}manifest.webmanifest`);
  const manifestUrl = new URL(href ?? '', page.url());
  const response = await request.get(manifestUrl.href);
  expect(response.status()).toBe(200);
  const manifest = (await response.json()) as Manifest;

  expect(manifest.name).toMatch(/\S/);
  expect(manifest.short_name).toBe('Diet');
  expect(manifest.description).toMatch(/\S/);
  for (const field of ['id', 'start_url', 'scope'] as const) {
    expect(new URL(manifest[field], manifestUrl).pathname, field).toBe(BASE_PATH);
  }
  expect(manifest.display).toBe('standalone');
  // One colour for the launch screen and task switcher in both themes: the icon's teal.
  expect(manifest.theme_color).toBe(BRAND_TEAL);
  expect(manifest.background_color).toBe(BRAND_TEAL);

  const has = (size: string, purpose: string) =>
    manifest.icons.some(
      (i) => i.sizes === size && (i.purpose ?? 'any').split(' ').includes(purpose),
    );
  expect(has('192x192', 'any')).toBe(true);
  expect(has('512x512', 'any')).toBe(true);
  expect(has('512x512', 'maskable')).toBe(true);

  for (const icon of manifest.icons) {
    const iconResponse = await request.get(new URL(icon.src, manifestUrl).href);
    expect(iconResponse.status(), icon.src).toBe(200);
    expect(iconResponse.headers()['content-type'], icon.src).toContain(icon.type);
    const [width, height] = icon.sizes.split('x').map(Number);
    expect(pngSize(await iconResponse.body()), icon.src).toEqual({ width, height });
  }
  for (const extra of ['favicon.svg', 'apple-touch-icon.png']) {
    expect((await request.get(extra)).status(), extra).toBe(200);
  }
});

test('the service worker controls the app after a reload, scoped to /Diet/', async ({ page }) => {
  await seedOnboarded(page);
  const script = await waitForServiceWorkerControl(page);
  expect(new URL(script).pathname).toBe(`${BASE_PATH}sw.js`);
  const scope = await page.evaluate(
    async () => (await navigator.serviceWorker.getRegistration())?.scope ?? '',
  );
  expect(new URL(scope).pathname).toBe(BASE_PATH);
});

test('offline: the app reloads and every screen opens from the offline copy (PWA-03)', async ({
  page,
  context,
}) => {
  await seedOnboarded(page);
  await waitForServiceWorkerControl(page);

  await context.setOffline(true);
  const fromNetwork: string[] = [];
  page.on('response', (response) => {
    if (!response.fromServiceWorker()) fromNetwork.push(response.url());
  });
  await page.reload();
  await expect(heading(page)).toHaveText('Today');
  await expect(page.getByRole('banner').getByRole('status')).toHaveText('Offline, all saved');

  await visitEveryScreen(page, async (screen) => {
    await expect(page.getByRole('main')).not.toBeEmpty();
    if (screen === 'About') {
      await expect(page.getByRole('link', { name: /111$/ })).toBeVisible();
      await expect(page.getByTestId('offline-copy')).toHaveText('Ready to use offline');
    }
  });
  // A fresh tab straight to a deep link works offline too.
  const second = await context.newPage();
  await second.goto('./#/drinks');
  await expect(heading(second)).toHaveText('Drinks');
  await screenArrived(second);
  await goTo(second, 'About');

  expect(fromNetwork).toEqual([]);
  // Items 18 (Foods in the app), 19 (Garden and pantry), 20 (Recipes), 24 (Store) and 30 (Laptop
  // pairing) each added one, item 23 two (Food log, Summary for your GP); the Move sub-screens
  // (item 27) are covered by move.spec.ts.
  expect(SCREENS).toHaveLength(20);
});

test('until the offline copy is saved, About says so and the pill does not say "all saved"', async ({
  browser,
  baseURL,
}) => {
  // With service workers blocked, the offline copy can never be saved.
  const context = await browser.newContext({
    serviceWorkers: 'block',
    ...(baseURL === undefined ? {} : { baseURL }),
  });
  try {
    const page = await context.newPage();
    await seedOnboarded(page, './#/about');
    await expect(heading(page)).toHaveText('About');
    await expect(page.getByTestId('offline-copy')).toHaveText(
      'This browser could not save an offline copy',
    );
    await context.setOffline(true);
    await expect(page.getByRole('banner').getByRole('status')).toHaveText('Offline');
  } finally {
    await context.close();
  }
});

test('About says when the offline copy is ready', async ({ page }) => {
  await seedOnboarded(page, './#/about');
  await waitForServiceWorkerControl(page);
  await expect(page.getByTestId('offline-copy')).toHaveText('Ready to use offline');
});
