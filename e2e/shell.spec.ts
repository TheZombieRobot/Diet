import { expect, test } from '@playwright/test';
import {
  CONTENT_SECURITY_POLICY,
  goTo,
  heading,
  SCREENS,
  TABS,
  visitEveryScreen,
} from './support/app';

// The app shell (checklist item 5): every screen renders in the production build, the tab bar and
// the offline pill work, and the Content Security Policy holds with nothing blocked.

test('the built index.html carries the Content Security Policy as the first element in <head>', async ({
  request,
}) => {
  const response = await request.get('index.html');
  expect(response.status()).toBe(200);
  const html = await response.text();
  const head = html.slice(html.indexOf('<head>') + '<head>'.length);
  const firstTag = /^\s*(?:<!--[\s\S]*?-->\s*)*(<meta\b[^>]*>)/.exec(head)?.[1] ?? '';
  expect(firstTag).toMatch(/http-equiv="Content-Security-Policy"/);
  expect(/content="([^"]*)"/.exec(firstTag)?.[1]).toBe(CONTENT_SECURITY_POLICY);
  // Nothing inline that the policy would have to allow.
  expect(html).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/);
  expect(html).not.toMatch(/<style\b|\sstyle="/);
  expect(CONTENT_SECURITY_POLICY).not.toMatch(/unsafe-(?:eval|inline)/);
});

test('the live page applies the policy and nothing breaks it on any screen', async ({ page }) => {
  await page.addInitScript(() => {
    const seen: string[] = [];
    Object.defineProperty(window, '__cspViolations', { value: seen });
    document.addEventListener('securitypolicyviolation', (event) => {
      seen.push(`${event.violatedDirective} ${event.blockedURI}`);
    });
  });
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      problems.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => problems.push(`page error: ${error.message}`));

  await page.goto('./');
  await expect(heading(page)).toHaveText('Today');
  expect(
    await page.evaluate(() => {
      const first = document.head.firstElementChild;
      return first?.getAttribute('http-equiv') === 'Content-Security-Policy'
        ? first.getAttribute('content')
        : null;
    }),
  ).toBe(CONTENT_SECURITY_POLICY);

  await visitEveryScreen(page);
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Today' }).click();
  await page.getByRole('button', { name: 'Quick actions' }).click();
  await expect(page.getByText('Quick ways to log weight')).toBeVisible();

  expect(
    await page.evaluate(() => (window as unknown as { __cspViolations: string[] }).__cspViolations),
  ).toEqual([]);
  expect(problems).toEqual([]);
});

test('the bundled Manrope font loads from the app itself', async ({ page }) => {
  await page.goto('./#/about');
  await expect(heading(page)).toHaveText('About');
  const loaded = await page.evaluate(async () => {
    await document.fonts.ready;
    return document.fonts.check('800 16px "Manrope Variable"');
  });
  expect(loaded).toBe(true);
  expect(await heading(page).evaluate((h) => getComputedStyle(h).fontFamily)).toContain(
    'Manrope Variable',
  );
});

test('the tab bar marks the current tab, and the gear marks Settings and About', async ({
  page,
}) => {
  await page.goto('./');
  const nav = page.getByRole('navigation', { name: 'Main' });
  const gear = page.getByRole('banner').getByRole('link', { name: 'Settings' });
  for (const screen of SCREENS) {
    await goTo(page, screen);
    for (const tab of TABS) {
      expect(await nav.getByRole('link', { name: tab }).getAttribute('aria-current')).toBe(
        tab === screen ? 'page' : null,
      );
    }
    expect(await gear.getAttribute('aria-current')).toBe(
      screen === 'Settings' || screen === 'About' ? 'page' : null,
    );
  }
});

test('every control on every screen is at least 48 px by 48 px on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto('./');
  await visitEveryScreen(page, async (screen) => {
    const sizes = await page.locator('a:visible, button:visible').evaluateAll((controls) =>
      controls.map((c) => {
        const box = c.getBoundingClientRect();
        return { name: c.getAttribute('aria-label') ?? c.textContent, w: box.width, h: box.height };
      }),
    );
    expect(sizes.length, screen).toBeGreaterThan(5);
    for (const { name, w, h } of sizes) {
      expect(h, `${screen}: ${name} height`).toBeGreaterThanOrEqual(48);
      expect(w, `${screen}: ${name} width`).toBeGreaterThanOrEqual(48);
    }
  });
});

test('the offline pill flips with the connection', async ({ page, context }) => {
  await page.goto('./');
  const pill = page.getByRole('banner').getByRole('status');
  await expect(pill).toHaveText('Online');
  await context.setOffline(true);
  await expect(pill).toHaveText('Offline, all saved');
  await context.setOffline(false);
  await expect(pill).toHaveText('Online');
});

test('there is no horizontal scrolling on a narrow phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('./');
  await visitEveryScreen(page, async (screen) => {
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, screen).toBeLessThanOrEqual(0);
  });
});
