import { expect, test } from '@playwright/test';
import {
  recordPolicyViolations,
  visitEveryScreen,
  waitForServiceWorkerControl,
} from './support/app';
import { appFiles, appOrigin, expectOnlyOwnOrigin, record, type Seen } from './support/network';

// HS-14 / TR-11, as reworded by DOC_REVIEW C03: the phone app makes only GET requests to its own
// origin for app files and update checks, with no query string or body built from user data.
// (The relay origin, after "Send to laptop", arrives at checklist item 31.) context.on('request')
// also sees the service worker's own requests, such as the offline copy being downloaded. A
// request the Content Security Policy blocks never reaches the network log, so every policy
// violation is recorded as well, and any one fails the audit. The backup, restore, rescue and
// delete-all actions are audited the same way in backup.spec.ts.

test('online, every screen: requests go only to the app’s own files', async ({
  page,
  context,
  baseURL,
  request,
}) => {
  const files = await appFiles(request, baseURL);
  const seen: Seen[] = [];
  context.on('request', record(seen));
  const violations = await recordPolicyViolations(context);
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
  expectOnlyOwnOrigin(seen, appOrigin(baseURL), files);
  expect(violations).toEqual([]);
});

test('offline, every screen: no request reaches the network at all', async ({
  page,
  context,
  baseURL,
  request,
}) => {
  const files = await appFiles(request, baseURL);
  const violations = await recordPolicyViolations(context);
  await page.goto('./');
  await waitForServiceWorkerControl(page);
  await context.setOffline(true);
  const seen: Seen[] = [];
  context.on('request', record(seen));
  const failed: string[] = [];
  context.on('requestfailed', (request) => failed.push(request.url()));
  await page.reload();
  await visitEveryScreen(page);
  expectOnlyOwnOrigin(seen, appOrigin(baseURL), files);
  expect(failed).toEqual([]);
  expect(violations).toEqual([]);
});

test('the audit fails a same-origin request outside the app’s own files, such as one carrying data in its path', async ({
  page,
  context,
  baseURL,
  request,
}) => {
  const files = await appFiles(request, baseURL);
  const seen: Seen[] = [];
  context.on('request', record(seen));
  await page.goto('./');
  expectOnlyOwnOrigin(seen, appOrigin(baseURL), files);
  // The policy allows a same-origin image, so only the path allowlist can catch this one.
  await page.evaluate(() => {
    const image = document.createElement('img');
    image.src = './example-leak-4-100.png';
    document.body.append(image);
  });
  await expect.poll(() => seen.some((s) => s.url.includes('example-leak-4-100'))).toBe(true);
  expect(() => {
    expectOnlyOwnOrigin(seen, appOrigin(baseURL), files);
  }).toThrow(/is not one of the app's own files/);
});

test('the audit sees a request the policy blocks', async ({ page, context }) => {
  const violations = await recordPolicyViolations(context);
  await page.goto('./');
  await page.evaluate(() => {
    const image = document.createElement('img');
    image.src = 'https://example.com/diet-audit-probe.png';
    document.body.append(image);
  });
  await expect
    .poll(() => violations)
    .toEqual([expect.stringMatching(/^img-src https:\/\/example\.com\b/)]);
  await page.reload();
  await page.evaluate(() => {
    const image = document.createElement('img');
    image.src = 'https://example.org/after-reload.png';
    document.body.append(image);
  });
  await expect.poll(() => violations.length).toBe(2);
});
