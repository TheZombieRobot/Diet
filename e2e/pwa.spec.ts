import { expect, test } from '@playwright/test';
import {
  BASE_PATH,
  GROUND_LIGHT,
  goTo,
  heading,
  pngSize,
  SCREENS,
  visitEveryScreen,
  waitForServiceWorkerControl,
} from './support/app';

// PWA-01 as replaced by DOC_REVIEW C35 (Lighthouse 12 has no PWA audit): Chrome's own
// installability check, a manifest check that fetches every icon, and service-worker control.
// PWA-03 (offline part): with the network off, the app reloads and every screen opens.
// The same checks run against the deployed HTTPS URL once GitHub Pages is on (README).

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

test('Chrome finds nothing stopping installation (Page.getInstallabilityErrors)', async ({
  page,
}) => {
  await page.goto('./');
  await waitForServiceWorkerControl(page);
  const cdp = await page.context().newCDPSession(page);
  const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
  expect(installabilityErrors).toEqual([]);
  const { errors } = await cdp.send('Page.getAppManifest');
  expect(errors).toEqual([]);
});

test('the manifest has every field installation needs, and every icon it lists exists', async ({
  page,
  request,
}) => {
  await page.goto('./');
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
  expect(manifest.theme_color).toBe(GROUND_LIGHT);
  expect(manifest.background_color).toBe(GROUND_LIGHT);

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
  await page.goto('./');
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
  await page.goto('./');
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
    }
  });
  // A fresh tab straight to a deep link works offline too.
  const second = await context.newPage();
  await second.goto('./#/drinks');
  await expect(heading(second)).toHaveText('Drinks');
  await goTo(second, 'About');

  expect(fromNetwork).toEqual([]);
  expect(SCREENS).toHaveLength(7);
});
