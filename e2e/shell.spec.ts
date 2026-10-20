import { createServer } from 'node:http';
import { expect, test, type Page } from '@playwright/test';
import {
  BASE_PATH,
  CONTENT_SECURITY_POLICY,
  goTo,
  heading,
  offerInstall,
  openBackupPanels,
  SCREENS,
  seedOnboarded,
  TABS,
  UNDER_SETTINGS,
  visitEveryScreen,
  waitForServiceWorkerControl,
} from './support/app';

// The app shell (checklist item 5): every screen renders in the production build, the tab bar and
// the offline pill work, the layout holds on narrow screens, focus and the back gesture behave,
// the Content Security Policy holds with nothing blocked, and the app will not run in a frame.

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

  await seedOnboarded(page);
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
  await expect(
    page.locator('.ui-fab-panel').getByRole('button', { name: 'Log weight' }),
  ).toBeVisible();

  expect(
    await page.evaluate(() => (window as unknown as { __cspViolations: string[] }).__cspViolations),
  ).toEqual([]);
  expect(problems).toEqual([]);
});

test('the bundled Manrope font loads from the app itself', async ({ page }) => {
  await seedOnboarded(page, './#/about');
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

test('the tab bar marks the current tab by more than colour; the gear marks Settings', async ({
  page,
}) => {
  await seedOnboarded(page);
  const nav = page.getByRole('navigation', { name: 'Main' });
  const gear = page.getByRole('banner').getByRole('link', { name: 'Settings' });
  const pill = (tab: string) =>
    nav
      .getByRole('link', { name: tab })
      .locator('.ui-tabbar__icon')
      .evaluate((e) => getComputedStyle(e).backgroundColor);
  for (const screen of SCREENS) {
    await goTo(page, screen);
    for (const tab of TABS) {
      const current = tab === screen;
      expect(await nav.getByRole('link', { name: tab }).getAttribute('aria-current')).toBe(
        current ? 'page' : null,
      );
      // A tinted pill behind the current tab's icon, so colour vision is not needed.
      if (current) expect(await pill(tab)).not.toBe('rgba(0, 0, 0, 0)');
      else expect(await pill(tab)).toBe('rgba(0, 0, 0, 0)');
    }
    // "page" only on Settings itself; a screen reached from Settings marks it as its section.
    expect(await gear.getAttribute('aria-current')).toBe(
      screen === 'Settings' ? 'page' : UNDER_SETTINGS.includes(screen) ? 'true' : null,
    );
  }
});

test('every control on every screen is at least 48 px by 48 px on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await seedOnboarded(page);
  const measure = async (where: string) => {
    const sizes = await page.locator('a:visible, button:visible').evaluateAll((controls) =>
      controls.map((c) => {
        const box = c.getBoundingClientRect();
        return { name: c.getAttribute('aria-label') ?? c.textContent, w: box.width, h: box.height };
      }),
    );
    expect(sizes.length, where).toBeGreaterThan(5);
    for (const { name, w, h } of sizes) {
      expect(h, `${where}: ${name} height`).toBeGreaterThanOrEqual(48);
      expect(w, `${where}: ${name} width`).toBeGreaterThanOrEqual(48);
    }
    return sizes.map((s) => s.name);
  };
  await visitEveryScreen(page, async (screen) => {
    await measure(screen);
  });
  // The conditional buttons: Install app and Not now on Today (with the "+" panel open), and
  // Install app on Settings. Reload is measured in update.spec.ts once an update is waiting.
  await offerInstall(page);
  await goTo(page, 'Today');
  await expect(page.getByText('Install this app')).toBeVisible();
  await page.getByRole('button', { name: 'Quick actions' }).click();
  await expect(page.locator('.ui-fab-panel .ui-action-row').first()).toBeVisible();
  expect(await measure('Today with the install banner')).toEqual(
    expect.arrayContaining(['Install app', 'Not now', 'Quick actions']),
  );
  await goTo(page, 'Settings');
  expect(await measure('Settings with the install button')).toEqual(
    expect.arrayContaining(['Install app']),
  );
  await openBackupPanels(page);
  expect(await measure('Settings with the backup panels open')).toEqual(
    expect.arrayContaining(['Save the backup file', 'Choose a backup file', 'Continue']),
  );
});

test('the offline pill flips with the connection', async ({ page, context }) => {
  await seedOnboarded(page);
  await waitForServiceWorkerControl(page);
  const pill = page.getByRole('banner').getByRole('status');
  await expect(pill).toHaveText('Online');
  await context.setOffline(true);
  await expect(pill).toHaveText('Offline, all saved');
  await context.setOffline(false);
  await expect(pill).toHaveText('Online');
});

/** Where the layout breaks on a narrow screen, if anywhere. */
async function narrowLayoutProblems(page: Page, where: string): Promise<string[]> {
  return page.evaluate((label) => {
    const problems: string[] = [];
    const width = document.documentElement.clientWidth;
    const overflow = document.documentElement.scrollWidth - width;
    if (overflow > 0) problems.push(`${label}: scrolls sideways by ${overflow} px`);
    const inside = (name: string, element: Element | null) => {
      const box = element?.getBoundingClientRect();
      if (box === undefined) problems.push(`${label}: no ${name}`);
      else if (box.left < 0 || box.right > width + 0.5) {
        problems.push(`${label}: ${name} at ${box.left}-${box.right} of ${width}`);
      }
    };
    inside('pill', document.querySelector('.ui-topbar .ui-pill'));
    inside('gear', document.querySelector('.ui-topbar a[aria-label="Settings"]'));
    const overlapping = (selector: string) => {
      const boxes = Array.from(document.querySelectorAll(selector), (e) =>
        e.getBoundingClientRect(),
      );
      boxes.forEach((box, i) => {
        const next = boxes[i + 1];
        if (next !== undefined && box.right > next.left + 0.5) {
          problems.push(
            `${label}: ${selector} ${i} overlaps the next by ${box.right - next.left} px`,
          );
        }
        if (box.right > width + 0.5)
          problems.push(`${label}: ${selector} ${i} runs off the screen`);
      });
    };
    overlapping('.ui-tabbar__link');
    overlapping('.ui-tabbar__label');
    // The Nutrition today card's meters and their figures stay inside its padding (F25).
    for (const card of document.querySelectorAll('main .ui-card:has(.ui-meter)')) {
      const edge = card.getBoundingClientRect();
      const style = getComputedStyle(card);
      const left = edge.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft);
      const right =
        edge.right - parseFloat(style.borderRightWidth) - parseFloat(style.paddingRight);
      for (const element of card.querySelectorAll('.ui-meter, .ui-meter *')) {
        const box = element.getBoundingClientRect();
        if (box.width > 0 && (box.left < left - 0.5 || box.right > right + 0.5)) {
          problems.push(`${label}: "${element.textContent}" runs past the card's padding`);
        }
      }
    }
    return problems;
  }, where);
}

test('nothing scrolls sideways or runs off a narrow or zoomed screen, online or offline', async ({
  page,
  context,
}) => {
  await seedOnboarded(page);
  await waitForServiceWorkerControl(page);
  const problems: string[] = [];
  // 320 px: a small phone. 195 and 180 px: a 390 px and a 360 px phone at 200% zoom.
  for (const width of [320, 195, 180]) {
    await page.setViewportSize({ width, height: 640 });
    for (const offline of [false, true]) {
      await context.setOffline(offline);
      await visitEveryScreen(page, async (screen) => {
        problems.push(
          ...(await narrowLayoutProblems(
            page,
            `${screen} at ${width} px${offline ? ', offline' : ''}`,
          )),
        );
      });
    }
  }
  // The Backup and data card's panels, with their fields and button rows, at 200% zoom.
  await context.setOffline(false);
  await goTo(page, 'Settings');
  await openBackupPanels(page);
  problems.push(...(await narrowLayoutProblems(page, 'Settings with the backup panels open')));
  expect(problems).toEqual([]);
});

test('a new screen moves focus to its heading', async ({ page }) => {
  await seedOnboarded(page);
  await expect(heading(page)).not.toBeFocused();
  for (const screen of ['Food', 'Settings', 'About', 'Today'] as const) {
    await goTo(page, screen);
    await expect(heading(page)).toBeFocused();
  }
});

test('the "+" panel follows the "+", and closes on Escape, an outside tap or a screen change', async ({
  page,
}) => {
  await seedOnboarded(page);
  const plus = page.getByRole('button', { name: 'Quick actions' });
  const panel = page.locator('.ui-fab-panel');

  await plus.click();
  await expect(panel).toBeVisible();
  expect(
    await plus.evaluate(
      (button) =>
        (button.compareDocumentPosition(document.querySelector('.ui-fab-panel') as Node) &
          Node.DOCUMENT_POSITION_FOLLOWING) !==
        0,
    ),
  ).toBe(true);
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await expect(plus).toHaveAttribute('aria-expanded', 'false');
  await expect(plus).toBeFocused();

  await plus.click();
  await expect(panel).toBeVisible();
  await page.getByRole('main').click({ position: { x: 20, y: 20 } });
  await expect(panel).toHaveCount(0);

  await plus.click();
  await goTo(page, 'Food');
  await goTo(page, 'Today');
  await expect(plus).toHaveAttribute('aria-expanded', 'false');
  await expect(panel).toHaveCount(0);
});

test('back from any tab goes to Today, then leaves the app; back from About returns to Settings', async ({
  page,
}) => {
  await seedOnboarded(page);
  const entries = () => page.evaluate(() => history.length);
  const start = await entries();
  for (const tab of ['Food', 'Move', 'Drinks', 'List', 'Food'] as const) await goTo(page, tab);
  expect(await entries()).toBe(start + 1);
  await page.goBack();
  await expect(heading(page)).toHaveText('Today');
  await page.goBack();
  expect(page.url().includes(BASE_PATH)).toBe(false);

  await page.goForward();
  await expect(heading(page)).toHaveText('Today');
  await goTo(page, 'Settings');
  await page.getByRole('link', { name: /^About this app/ }).click();
  await expect(heading(page)).toHaveText('About');
  await page.goBack();
  await expect(heading(page)).toHaveText('Settings');
});

test('on Today the "+" never covers the last card', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 420 });
  await seedOnboarded(page);
  await offerInstall(page);
  await expect(page.getByText('Install this app')).toBeVisible();
  const scrolls = await page.evaluate(
    () => document.documentElement.scrollHeight > document.documentElement.clientHeight,
  );
  expect(scrolls, 'the screen is long enough to scroll').toBe(true);
  await page.evaluate(() => {
    window.scrollTo(0, document.documentElement.scrollHeight);
  });
  const { lastBottom, fabTop } = await page.evaluate(() => {
    const cards = document.querySelectorAll('main .ui-card');
    return {
      lastBottom: cards[cards.length - 1]?.getBoundingClientRect().bottom ?? Infinity,
      fabTop: document.querySelector('.ui-fab')?.getBoundingClientRect().top ?? 0,
    };
  });
  expect(lastBottom).toBeLessThanOrEqual(fabTop);
});

test("Today's Water and Steps sit side by side, stack when narrow or editing, keep their content inside, and keep 48 px controls; the panel scrolls", async ({
  page,
}) => {
  // Item 16 design section 5.3 E6 (T25): side by side from 360 px; 320 px, 195 px and 180 px (a
  // 390 px and a 360 px phone at 200% zoom) stacked by the width alone, with nothing inside a card
  // running out of it, and no sideways scroll even with the steps editor open.
  await page.setViewportSize({ width: 390, height: 600 });
  await seedOnboarded(page);
  const water = page.getByRole('region', { name: 'Water', exact: true });
  const steps = page.getByRole('region', { name: 'Steps', exact: true });
  await expect(steps).toBeVisible();
  const sideBySide = async () => {
    const [a, b] = [await water.boundingBox(), await steps.boundingBox()];
    if (a === null || b === null) throw new Error('no card pair');
    return Math.abs(a.y - b.y) < 1 && b.x >= a.x + a.width;
  };
  const outsideTheirCard = () =>
    page.evaluate(() =>
      Array.from(document.querySelectorAll('.ui-card-pair > .ui-card')).flatMap((card) => {
        const edge = card.getBoundingClientRect();
        return Array.from(card.querySelectorAll('*'))
          .filter((e) => !e.closest('.ui-visually-hidden'))
          .map((e) => ({ e, box: e.getBoundingClientRect() }))
          .filter(({ box }) => box.left < edge.left - 0.5 || box.right > edge.right + 0.5)
          .map(({ e, box }) => `${e.textContent.slice(0, 24)} at ${box.left}-${box.right}`);
      }),
    );
  const overflow = () =>
    page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
  for (const width of [412, 390, 360, 320, 195, 180]) {
    await page.setViewportSize({ width, height: 640 });
    expect(await sideBySide(), `${width} px`).toBe(width >= 360);
    expect(await outsideTheirCard(), `${width} px`).toEqual([]);
    expect(await overflow(), `${width} px`).toBeLessThanOrEqual(0);
  }
  await page.setViewportSize({ width: 390, height: 600 });
  await steps.getByRole('button', { name: 'Enter steps' }).click();
  expect(await sideBySide()).toBe(false);

  await page.getByRole('button', { name: 'Quick actions' }).click();
  // Five Later rows: item 28 built Add drink.
  await expect(page.locator('.ui-fab-panel [aria-disabled="true"]')).toHaveCount(5);
  const small = await page.locator('a:visible, button:visible').evaluateAll((controls) =>
    controls
      .map((c) => ({ name: c.textContent, box: c.getBoundingClientRect() }))
      .filter(({ box }) => box.width < 48 || box.height < 48)
      .map(({ name }) => name),
  );
  expect(small).toEqual([]);
  expect(
    await page
      .locator('.ui-fab-panel')
      .evaluate((p) => p.scrollHeight > p.clientHeight && getComputedStyle(p).overflowY === 'auto'),
  ).toBe(true);
  await page.keyboard.press('Escape');

  // The steps editor open on a narrow or zoomed screen.
  for (const width of [320, 195, 180]) {
    await page.setViewportSize({ width, height: 640 });
    expect(await sideBySide(), `${width} px`).toBe(false);
    expect(await outsideTheirCard(), `${width} px, editing`).toEqual([]);
    expect(await overflow(), `${width} px, editing`).toBeLessThanOrEqual(0);
  }
});

test('a focused row is scrolled clear of the top bar and the tab bar', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 600 });
  await seedOnboarded(page, './#/about');
  await expect(heading(page)).toHaveText('About');
  const hidden: string[] = [];
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    const where = await page.evaluate(() => {
      const focused = document.activeElement;
      if (focused === null || !focused.closest('main')) return null;
      const box = focused.getBoundingClientRect();
      const top = document.querySelector('.ui-topbar')?.getBoundingClientRect().bottom ?? 0;
      const bottom = document.querySelector('.ui-tabbar')?.getBoundingClientRect().top ?? 0;
      return { name: focused.textContent, box: [box.top, box.bottom], clear: [top, bottom] };
    });
    if (where === null) continue;
    const [boxTop = 0, boxBottom = 0] = where.box;
    const [clearTop = 0, clearBottom = 0] = where.clear;
    if (boxTop < clearTop - 0.5 || boxBottom > clearBottom + 0.5) hidden.push(where.name);
  }
  expect(hidden).toEqual([]);
});

test('inside a frame on another site, the app shows only a note to open it directly', async ({
  page,
  baseURL,
}) => {
  const app = new URL('#/settings', baseURL).href;
  const framer = createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(
      `<!doctype html><title>Another site</title><iframe src="${app}" width="400" height="600"></iframe>`,
    );
  });
  await new Promise<void>((resolve) => framer.listen(0, '127.0.0.1', resolve));
  try {
    const address = framer.address();
    if (address === null || typeof address === 'string') throw new Error('no port');
    await page.goto(`http://127.0.0.1:${address.port}/`);
    const framed = page.frameLocator('iframe');
    await expect(framed.locator('#root')).toHaveText('Open this app directly at its own address.');
    expect(await framed.locator('a, button, input, select, textarea, [tabindex]').count()).toBe(0);
    const frame = page.frames().find((f) => f.url().startsWith(new URL(BASE_PATH, baseURL).href));
    expect(frame).toBeDefined();
    expect(
      await frame?.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length),
    ).toBe(0);
  } finally {
    framer.closeAllConnections();
    await new Promise<void>((resolve) => {
      framer.close(() => {
        resolve();
      });
    });
  }

  // Opened directly, the same address runs the app.
  await seedOnboarded(page, './#/settings');
  await expect(heading(page)).toHaveText('Settings');
});

test('a pressed control darkens and, unless motion is reduced, shrinks slightly', async ({
  page,
}) => {
  await seedOnboarded(page);
  const food = page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Food' });
  const pressed = async () => {
    const box = await food.boundingBox();
    if (box === null) throw new Error('no Food tab');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    // Two frames: with reduced motion, base.css turns every change into a 0.01 ms transition.
    const style = await food.evaluate(
      (e) =>
        new Promise<{ transform: string; background: string }>((resolve) => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              const s = getComputedStyle(e);
              resolve({ transform: s.transform, background: s.backgroundColor });
            });
          });
        }),
    );
    // Released on the tab: a tap, which opens Food (and does nothing once Food is open).
    await page.mouse.up();
    await expect(heading(page)).toHaveText('Food');
    return style;
  };
  const resting = await food.evaluate((e) => getComputedStyle(e).backgroundColor);
  const normal = await pressed();
  expect(normal.background).not.toBe(resting);
  expect(normal.transform).not.toBe('none');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const reduced = await pressed();
  expect(reduced.background).toBe(normal.background);
  expect(reduced.transform).toBe('none');
});
