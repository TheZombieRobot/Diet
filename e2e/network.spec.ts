import {
  type APIRequestContext,
  type BrowserContext,
  expect,
  type Page,
  test,
} from '@playwright/test';
import { visitEveryScreen, waitForServiceWorkerControl } from './support/app';
import { startAudit } from './support/network';

// HS-14 / TR-11, as reworded by DOC_REVIEW C03: the phone app makes only GET requests to its own
// origin for app files and update checks, with no query string, header, cookie or body built
// from user data. (The relay origin, after "Send to laptop", arrives at checklist item 31.) The
// audit (support/network.ts) starts before the first page load and sees the service worker's own
// requests, every policy violation (a request the Content Security Policy blocks never reaches
// the network log) and every WebSocket; any one outside the rules fails it. The backup, restore,
// rescue and delete-all actions are audited the same way in backup.spec.ts. The last tests here
// check that the audit itself catches each kind of leak.

test('online, every screen: requests go only to the app’s own files', async ({
  page,
  context,
  baseURL,
  request,
}) => {
  const audit = await startAudit(context, request, baseURL);
  await page.goto('./');
  await waitForServiceWorkerControl(page);
  await visitEveryScreen(page);
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Today' }).click();
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
  await page.goto('./');
  await waitForServiceWorkerControl(page);
  await context.setOffline(true);
  const failed: string[] = [];
  context.on('requestfailed', (r) => failed.push(r.url()));
  await page.reload();
  await visitEveryScreen(page);
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
  await page.goto('./');
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
