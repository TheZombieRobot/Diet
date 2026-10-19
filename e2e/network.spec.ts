import { expect, test, type Request } from '@playwright/test';
import { BASE_PATH, visitEveryScreen, waitForServiceWorkerControl } from './support/app';

// HS-14 / TR-11, as reworded by DOC_REVIEW C03: the phone app makes only GET requests to its own
// origin for app files and update checks, with no query string or body built from user data.
// (The relay origin, after "Send to laptop", arrives at checklist item 31.) context.on('request')
// also sees the service worker's own requests, such as the offline copy being downloaded.

interface Seen {
  url: string;
  method: string;
  body: string | null;
  fromServiceWorker: boolean;
}

function record(into: Seen[]) {
  return (request: Request) => {
    into.push({
      url: request.url(),
      method: request.method(),
      body: request.postData(),
      fromServiceWorker: request.serviceWorker() !== null,
    });
  };
}

/** The app's own origin: the local preview server, or the deployed site (DIET_E2E_URL). */
function appOrigin(baseURL: string | undefined): string {
  if (baseURL === undefined) throw new Error('playwright.config.ts sets baseURL');
  return new URL(baseURL).origin;
}

function expectOnlyOwnOrigin(seen: readonly Seen[], origin: string): void {
  for (const { url, method, body } of seen) {
    const parsed = new URL(url);
    expect(parsed.origin, url).toBe(origin);
    expect(parsed.pathname.startsWith(BASE_PATH), url).toBe(true);
    expect(method, url).toBe('GET');
    expect(body, url).toBeNull();
    // Workbox adds a cache-busting revision to files whose names carry no hash; nothing else.
    expect(
      [...parsed.searchParams.keys()].filter((k) => k !== '__WB_REVISION__'),
      url,
    ).toEqual([]);
  }
}

test('online, every screen: requests go only to the app’s own origin', async ({
  page,
  context,
  baseURL,
}) => {
  const seen: Seen[] = [];
  context.on('request', record(seen));
  await page.goto('./');
  await waitForServiceWorkerControl(page);
  await visitEveryScreen(page);
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Today' }).click();
  await page.getByRole('button', { name: 'Quick actions' }).click();
  await page.evaluate(async () => {
    await (await navigator.serviceWorker.getRegistration())?.update();
  });

  expect(seen.length).toBeGreaterThan(5);
  // The audit sees the service worker's own downloads, not just the page's.
  expect(seen.some((s) => s.fromServiceWorker)).toBe(true);
  expectOnlyOwnOrigin(seen, appOrigin(baseURL));
});

test('offline, every screen: no request reaches the network at all', async ({
  page,
  context,
  baseURL,
}) => {
  await page.goto('./');
  await waitForServiceWorkerControl(page);
  await context.setOffline(true);
  const seen: Seen[] = [];
  context.on('request', record(seen));
  const failed: string[] = [];
  context.on('requestfailed', (request) => failed.push(request.url()));
  await page.reload();
  await visitEveryScreen(page);
  expectOnlyOwnOrigin(seen, appOrigin(baseURL));
  expect(failed).toEqual([]);
});
