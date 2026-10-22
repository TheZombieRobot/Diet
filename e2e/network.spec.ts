import {
  type APIRequestContext,
  type BrowserContext,
  expect,
  type Page,
  test,
} from '@playwright/test';
import {
  openFoodPanel,
  openRecipe,
  type ScreenName,
  seedOnboarded,
  SWEPT_RECIPE,
  visitEveryScreen,
  waitForServiceWorkerControl,
} from './support/app';
import { expectOnlyOwnOrigin, startAudit } from './support/network';

/** Item 18 (E2): the generic loop never opens a food, so the audit opens one on Foods in the app. */
const openAFood =
  (page: Page) =>
  async (screen: ScreenName): Promise<void> => {
    if (screen === 'Foods in the app') await openFoodPanel(page);
  };

// HS-14 / TR-11, as reworded by DOC_REVIEW C03: the phone app makes only GET requests to its own
// origin for app files and update checks, with no query string, header, cookie or body built
// from user data. (The relay origin, after "Send to laptop", arrives at checklist item 31.) The
// audit (support/network.ts) starts before the first page load and sees the service worker's own
// requests, every policy violation (a request the Content Security Policy blocks never reaches
// the network log) and every WebSocket; any one outside the rules fails it. The backup, restore,
// rescue and delete-all actions are audited the same way in backup.spec.ts. The last tests here
// check that the audit itself catches each kind of leak, and reads HTTP/2's own headers (GitHub
// Pages) only as the browser makes them.

test('online, every screen: requests go only to the app’s own files', async ({
  page,
  context,
  baseURL,
  request,
}) => {
  const audit = await startAudit(context, request, baseURL);
  await seedOnboarded(page);
  await waitForServiceWorkerControl(page);
  await visitEveryScreen(page, openAFood(page));
  // Item 20: a recipe's page (E4).
  await openRecipe(page, SWEPT_RECIPE);
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Today' }).click();
  // Item 16 (E3): logging on Today asks nothing of the network.
  await page.getByRole('button', { name: 'Add 250 mL' }).click();
  await expect(page.getByTestId('water-total')).toHaveText('250 mL');
  await page.getByRole('switch', { name: 'Electrolytes today' }).check();
  await page.getByRole('button', { name: 'Enter steps' }).click();
  await page.getByLabel('Steps today').fill('9000');
  await page.getByLabel('Steps today').press('Enter');
  await expect(page.getByTestId('steps-today')).toHaveText('9,000');
  await page.getByRole('button', { name: 'Quick actions' }).click();
  await page.evaluate(async () => {
    await (await navigator.serviceWorker.getRegistration())?.update();
  });

  expect(audit.seen.length).toBeGreaterThan(5);
  // The audit sees the service worker's own downloads, not just the page's.
  expect(audit.seen.some((s) => s.fromServiceWorker)).toBe(true);
  await audit.verify();
});

test('offline, every screen: no request reaches the network at all', async ({
  page,
  context,
  baseURL,
  request,
}) => {
  const audit = await startAudit(context, request, baseURL);
  await seedOnboarded(page);
  await waitForServiceWorkerControl(page);
  await context.setOffline(true);
  const failed: string[] = [];
  context.on('requestfailed', (r) => failed.push(r.url()));
  await page.reload();
  await visitEveryScreen(page, openAFood(page));
  await openRecipe(page, SWEPT_RECIPE);
  expect(failed).toEqual([]);
  await audit.verify();
});

/** The audit of a page that then makes one planted request; verify must refuse it. */
async function caught(
  {
    page,
    context,
    baseURL,
    request,
  }: {
    page: Page;
    context: BrowserContext;
    baseURL: string | undefined;
    request: APIRequestContext;
  },
  plant: () => void,
  message: RegExp,
): Promise<void> {
  const audit = await startAudit(context, request, baseURL);
  await seedOnboarded(page);
  await waitForServiceWorkerControl(page);
  await page.evaluate(plant);
  await expect(audit.verify()).rejects.toThrow(message);
}

test('the audit fails a same-origin request outside the app’s own files, such as one carrying data in its path', async ({
  page,
  context,
  baseURL,
  request,
}) => {
  // The policy allows a same-origin image, so only the path allowlist can catch this one.
  await caught(
    { page, context, baseURL, request },
    () => {
      const image = document.createElement('img');
      image.src = './example-leak-4-100.png';
      document.body.append(image);
    },
    /is not one of the app's own files/,
  );
});

test('the audit fails a precache revision that is not the file’s own (data hidden in the query)', async ({
  page,
  context,
  baseURL,
  request,
}) => {
  await caught(
    { page, context, baseURL, request },
    () => {
      void fetch('./index.html?__WB_REVISION__=example-leak-4-100');
    },
    /only the file's own precache revision/,
  );
});

test('the audit fails a header the browser did not add', async ({
  page,
  context,
  baseURL,
  request,
}) => {
  await caught(
    { page, context, baseURL, request },
    () => {
      void fetch('./favicon.svg', { headers: { 'x-example': 'example-leak-4-100' } });
    },
    /carries a header the browser did not add/,
  );
});

test('the audit fails a cookie', async ({ page, context, baseURL, request }) => {
  await caught(
    { page, context, baseURL, request },
    () => {
      document.cookie = 'example=example-leak-4-100';
      void fetch('./manifest.webmanifest', { cache: 'no-store' });
    },
    /example=example-leak-4-100/,
  );
});

test('the audit waits for a request made a moment after the last action', async ({
  page,
  context,
  baseURL,
  request,
}) => {
  await caught(
    { page, context, baseURL, request },
    () => {
      setTimeout(() => {
        const image = document.createElement('img');
        image.src = './example-late-leak.png';
        document.body.append(image);
      }, 800);
    },
    /example-late-leak\.png is not one of the app's own files/,
  );
});

test('the audit sees a request the policy blocks', async ({ page, context, baseURL, request }) => {
  await caught(
    { page, context, baseURL, request },
    () => {
      void fetch('https://example.com/diet-audit-probe').catch(() => undefined);
    },
    /connect-src https:\/\/example\.com/,
  );
});

test('the audit fails a WebSocket to the app’s own origin, which the policy allows', async ({
  page,
  context,
  baseURL,
  request,
}) => {
  await caught(
    { page, context, baseURL, request },
    () => {
      const socket = new WebSocket(`${location.origin.replace(/^http/, 'ws')}/Diet/example-leak`);
      socket.onerror = () => undefined;
    },
    /example-leak/,
  );
});

test('the audit refuses to start after a page has loaded', async ({
  page,
  context,
  baseURL,
  request,
}) => {
  await page.goto('./');
  await expect(startAudit(context, request, baseURL)).rejects.toThrow(
    /the audit starts before any page of the context loads/,
  );
});

/** A deployed copy's page request over HTTP/2, as Chromium reports it, with `extra` added. */
function auditHttp2(extra: Readonly<Record<string, string>>): void {
  const origin = 'https://example.github.io';
  expectOnlyOwnOrigin(
    [
      {
        url: `${origin}/Diet/index.html?__WB_REVISION__=example-1`,
        method: 'GET',
        body: null,
        fromServiceWorker: true,
        headers: {
          ':authority': 'example.github.io',
          ':method': 'GET',
          ':path': '/Diet/index.html?__WB_REVISION__=example-1',
          ':scheme': 'https',
          accept: '*/*',
          ...extra,
        },
      },
    ],
    origin,
    new Map([['/Diet/index.html', 'example-1']]),
  );
}

test('over HTTP/2 the audit accepts the pseudo-headers naming the request and Chromium’s priority header', () => {
  for (const priority of ['u=0, i', 'u=1', 'u=4, i', 'i']) {
    expect(() => {
      auditHttp2({ priority });
    }, priority).not.toThrow();
  }
});

test('over HTTP/2 the audit fails a pseudo-header that does not name the request, any other priority, a header and a cookie', () => {
  for (const [name, value] of [
    [':authority', 'example.com'],
    [':authority', 'example.github.io:8443'],
    [':method', 'POST'],
    [':scheme', 'http'],
    [':path', '/Diet/index.html?__WB_REVISION__=example-1&example=4-100'],
    [':path', '/Diet/index.html'],
    [':protocol', 'websocket'],
    ['priority', 'u=8'],
    ['priority', 'u=1, i, example=4-100'],
    ['priority', 'u=1;example-4-100'],
    ['x-example', 'example-leak-4-100'],
    ['cookie', 'example=example-leak-4-100'],
  ] as const) {
    expect(() => {
      auditHttp2({ [name]: value });
    }, `${name}: ${value}`).toThrow(/carries a header the browser did not add, or a cookie/);
  }
});
