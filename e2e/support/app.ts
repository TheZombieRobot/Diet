import { expect, type BrowserContext, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { privacy } from '../../packages/core/src/copy/health';
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
/** The brand teal (light value), the manifest's theme and background colour in both themes. */
export const BRAND_TEAL = requireToken(tokens, '--color-teal').light;
/** The page ground in each theme, to confirm which theme the browser is drawing. */
export const GROUND = requireToken(tokens, '--color-ground');

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

/**
 * Everything a person can read or hear on the page: the title, the text, the labels and
 * descriptions screen readers announce, tooltips, image text, placeholders and form values.
 */
export function renderedText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const attributes = ['aria-label', 'aria-description', 'title', 'alt', 'placeholder'];
    const fromAttributes = attributes.flatMap((name) =>
      Array.from(document.querySelectorAll(`[${name}]`), (e) => e.getAttribute(name) ?? ''),
    );
    const values = Array.from(
      document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
        'input, textarea, select',
      ),
      (e) => e.value,
    );
    const options = Array.from(document.querySelectorAll('option'), (o) => `${o.value} ${o.text}`);
    return [document.title, document.body.innerText, ...fromAttributes, ...values, ...options].join(
      '\n',
    );
  });
}

/**
 * On Settings: opens the Backup and data card's export, restore and delete-all panels together,
 * with the delete-all panel at its second confirmation, so sweeps see every new control and note.
 */
export async function openBackupPanels(page: Page): Promise<void> {
  const card = page.getByRole('region', { name: privacy.backupCard.title });
  await card.getByRole('button', { name: privacy.backupCard.exportAction }).click();
  await expect(card.getByRole('switch', { name: privacy.exportBackup.lockLabel })).toBeChecked();
  await card.getByRole('button', { name: privacy.backupCard.restoreAction }).click();
  await card.getByRole('button', { name: privacy.backupCard.deleteAllAction }).click();
  await expect(card.getByRole('button', { name: privacy.deleteAll.next })).toBeVisible();
}

/** Makes Chrome's install prompt available, so the install banner and button render too. */
export async function offerInstall(page: Page): Promise<void> {
  await page.evaluate(() => {
    const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt: () => Promise.resolve(),
      userChoice: new Promise(() => undefined),
    });
    window.dispatchEvent(event);
  });
}

/** The app comes back into view, as when Android resumes an installed app from the background. */
export async function returnToApp(page: Page): Promise<void> {
  await page.evaluate(() => {
    const show = (state: DocumentVisibilityState) => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
      document.dispatchEvent(new Event('visibilitychange'));
    };
    show('hidden');
    show('visible');
    Reflect.deleteProperty(document, 'visibilityState');
  });
}

/**
 * Collects every Content Security Policy violation on every page of the context, across reloads.
 * A blocked request never reaches the network log, so this is how the audits see one.
 */
export async function recordPolicyViolations(context: BrowserContext): Promise<string[]> {
  const seen: string[] = [];
  await context.exposeFunction('dietReportPolicyViolation', (violation: string) => {
    seen.push(violation);
  });
  await context.addInitScript(() => {
    const report = (window as unknown as { dietReportPolicyViolation: (v: string) => unknown })
      .dietReportPolicyViolation;
    document.addEventListener(
      'securitypolicyviolation',
      (event) => {
        void report(`${event.violatedDirective} ${event.blockedURI}`);
      },
      true,
    );
  });
  return seen;
}

/** Width and height of a PNG, from its IHDR chunk. */
export function pngSize(bytes: Buffer): { width: number; height: number } {
  const signature = bytes.subarray(0, 8).toString('hex');
  if (signature !== '89504e470d0a1a0a') throw new Error('not a PNG');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}
