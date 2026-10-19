import { expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseColourTokens, requireToken } from '../../packages/ui/src/tokens';

/** Every screen of the phone app, in the order a person reaches them. */
export const TABS = ['Today', 'Food', 'Move', 'Drinks', 'List'] as const;
export const SCREENS = [...TABS, 'Settings', 'About'] as const;
export type ScreenName = (typeof SCREENS)[number];

/** The app's base path, the same as on GitHub Pages. */
export const BASE_PATH = '/Diet/';

/** The built app (made by the Playwright web server before any test runs). */
export const DIST_DIR = join(import.meta.dirname, '../../apps/mobile-web/dist');

/** The exact policy index.html must carry (HS-14, TR-11, DOC_REVIEW C03). */
export const CONTENT_SECURITY_POLICY =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; worker-src 'self'; manifest-src 'self'; base-uri 'self'; form-action 'none'; object-src 'none'";

const tokens = parseColourTokens(
  readFileSync(join(import.meta.dirname, '../../packages/ui/src/styles/tokens.css'), 'utf8'),
);
/** The light-theme ground colour, which the manifest uses for its theme and background. */
export const GROUND_LIGHT = requireToken(tokens, '--color-ground').light;

export const heading = (page: Page) => page.getByRole('heading', { level: 1 });

/** Goes to a screen the way a person would: a tab, the settings gear, then "About this app". */
export async function goTo(page: Page, screen: ScreenName): Promise<void> {
  if ((TABS as readonly string[]).includes(screen)) {
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: screen })
      .click();
  } else {
    await page.getByRole('banner').getByRole('link', { name: 'Settings' }).click();
    if (screen === 'About') {
      await expect(heading(page)).toHaveText('Settings');
      await page.getByRole('link', { name: /^About this app/ }).click();
    }
  }
  await expect(heading(page)).toHaveText(screen);
}

/** Visits every screen in turn, calling `onScreen` on each. */
export async function visitEveryScreen(
  page: Page,
  onScreen: (screen: ScreenName) => Promise<void> = () => Promise.resolve(),
): Promise<void> {
  for (const screen of SCREENS) {
    await goTo(page, screen);
    await onScreen(screen);
  }
}

/** Waits until the service worker is active, then reloads once so it controls the page. */
export async function waitForServiceWorkerControl(page: Page): Promise<string> {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  if (await page.evaluate(() => navigator.serviceWorker.controller === null)) await page.reload();
  const script = await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL ?? '');
  expect(script).toMatch(/\/Diet\/sw\.js$/);
  return script;
}

/** Everything a person can read or hear on the page: the title, the text and the aria-labels. */
export function renderedText(page: Page): Promise<string> {
  return page.evaluate(() =>
    [
      document.title,
      document.body.innerText,
      ...Array.from(document.querySelectorAll('[aria-label]'), (e) => e.getAttribute('aria-label')),
    ].join('\n'),
  );
}

/** Width and height of a PNG, from its IHDR chunk. */
export function pngSize(bytes: Buffer): { width: number; height: number } {
  const signature = bytes.subarray(0, 8).toString('hex');
  if (signature !== '89504e470d0a1a0a') throw new Error('not a PNG');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}
