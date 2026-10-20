import {
  type APIRequestContext,
  type BrowserContext,
  expect,
  type Page,
  type Request,
} from '@playwright/test';
import { BASE_PATH, recordPolicyViolations } from './app';

// HS-14 / TR-11, as reworded by DOC_REVIEW C03: the phone app makes only GET requests to its own
// origin for app files and update checks, with no query string, header, cookie or body built
// from user data. context.on('request') also sees the service worker's own requests. A request
// the Content Security Policy blocks never reaches the network log, so the audit records policy
// violations too (recordPolicyViolations in app.ts), and a WebSocket appears only as a page event,
// so it records those as well. Same-origin requests are checked against the app's own files and
// their exact precache revisions, so a request that carries data in its path, its query or its
// headers fails the audit online too, not only when it fails offline (privacy review).

export interface Seen {
  url: string;
  method: string;
  body: string | null;
  fromServiceWorker: boolean;
  /** Every header the request carried, once read (readHeaders); undefined until then. */
  headers?: Readonly<Record<string, string>>;
  /** The request itself, for its headers. */
  request?: Request;
}

/**
 * The only request headers the audit accepts: the ones Chromium itself adds to the app's own
 * requests (page loads, scripts, fonts, the service worker's precache and update check). Anything
 * else, a custom header or any cookie, could carry user data, so it fails the audit.
 */
export const BROWSER_HEADERS: ReadonlySet<string> = new Set([
  'accept',
  'accept-encoding',
  'accept-language',
  'cache-control',
  'connection',
  'host',
  'if-modified-since',
  'if-none-match',
  'origin',
  'pragma',
  'purpose',
  'range',
  'referer',
  'sec-ch-ua',
  'sec-ch-ua-mobile',
  'sec-ch-ua-platform',
  'sec-fetch-dest',
  'sec-fetch-mode',
  'sec-fetch-site',
  'sec-fetch-user',
  'sec-purpose',
  'service-worker',
  'upgrade-insecure-requests',
  'user-agent',
]);

export function record(into: Seen[]) {
  return (request: Request) => {
    into.push({
      url: request.url(),
      method: request.method(),
      body: request.postData(),
      fromServiceWorker: request.serviceWorker() !== null,
      request,
    });
  };
}

/** Reads every recorded request's full headers (Playwright gives them only asynchronously). */
export async function readHeaders(seen: readonly Seen[]): Promise<void> {
  await Promise.all(
    seen.map(async (s) => {
      if (s.request === undefined || s.headers !== undefined) return;
      s.headers = await Promise.race([
        // A request of a page closed since (item 19's offline test closes one) keeps the
        // headers Playwright saw when it was sent.
        s.request.allHeaders().catch(() => s.request?.headers() ?? {}),
        new Promise<Record<string, string>>((resolve) => {
          setTimeout(() => {
            resolve(s.request?.headers() ?? {});
          }, 5_000);
        }),
      ]);
    }),
  );
}

/** The app's own origin: the local preview server, or the deployed site (DIET_E2E_URL). */
export function appOrigin(baseURL: string | undefined): string {
  if (baseURL === undefined) throw new Error('playwright.config.ts sets baseURL');
  return new URL(baseURL).origin;
}

/**
 * Every path the app may request, with the precache revision Workbox may add to it (null for the
 * page, the service worker, the Workbox runtime and files whose names carry a hash): read from the
 * sw.js the server serves, so a deployed copy is checked against its own files. Read with
 * Playwright's request API, outside the browser context, so this read is not itself audited.
 */
export async function appFiles(
  request: APIRequestContext,
  baseURL: string | undefined,
): Promise<ReadonlyMap<string, string | null>> {
  if (baseURL === undefined) throw new Error('playwright.config.ts sets baseURL');
  const base = new URL(baseURL);
  const worker = new URL('sw.js', base);
  const response = await request.get(worker.href);
  expect(response.ok(), worker.href).toBe(true);
  const text = await response.text();
  const files = new Map<string, string | null>([
    [base.pathname, null],
    [worker.pathname, null],
  ]);
  for (const [, url = '', revision] of text.matchAll(
    /\burl:\s*"([^"]+)",\s*revision:\s*(?:"([^"]+)"|null)/g,
  )) {
    files.set(new URL(url, base).pathname, revision ?? null);
  }
  for (const [, runtime = ''] of text.matchAll(/["'](\.\/workbox-[\w-]+)["']/g)) {
    files.set(new URL(`${runtime}.js`, base).pathname, null);
  }
  // A real manifest: the page, its scripts and styles, and the icons, with their revisions.
  const paths = [...files.keys()];
  expect(paths.some((f) => f.endsWith('/index.html'))).toBe(true);
  expect(paths.some((f) => /\/assets\/index-[\w-]+\.js$/.test(f))).toBe(true);
  expect(paths.some((f) => /\/workbox-[\w-]+\.js$/.test(f))).toBe(true);
  expect([...files.values()].some((r) => r !== null)).toBe(true);
  return files;
}

/**
 * Every request: to the app's own origin and base path, for one of its own files, a GET with no
 * body; no query but Workbox's cache-busting revision, and that only with the exact revision of
 * that file; and, once its headers are read (readHeaders), only browser-made headers and no cookie.
 */
export function expectOnlyOwnOrigin(
  seen: readonly Seen[],
  origin: string,
  files: ReadonlyMap<string, string | null>,
): void {
  for (const { url, method, body, headers } of seen) {
    // Item 19: an object URL the page made itself (a garden photo's thumbnail) is read from the
    // page's own memory: nothing leaves the browser.
    const objectUrl = `blob:${origin}/`;
    if (url.startsWith(objectUrl) && /^[0-9a-f-]{36}$/.test(url.slice(objectUrl.length))) {
      expect(method, url).toBe('GET');
      continue;
    }
    const parsed = new URL(url);
    expect(parsed.origin, url).toBe(origin);
    expect(parsed.pathname.startsWith(BASE_PATH), url).toBe(true);
    expect(files.has(parsed.pathname), `${url} is not one of the app's own files`).toBe(true);
    expect(method, url).toBe('GET');
    expect(body, url).toBeNull();
    const query = [...parsed.searchParams.entries()];
    if (query.length > 0) {
      const revision = files.get(parsed.pathname) ?? null;
      expect(query, `${url}: only the file's own precache revision may be in the query`).toEqual([
        ['__WB_REVISION__', revision ?? 'no query for this file'],
      ]);
    }
    if (headers !== undefined) {
      const names = Object.keys(headers).map((name) => name.toLowerCase());
      expect(
        names.filter((name) => !BROWSER_HEADERS.has(name)),
        `${url} carries a header the browser did not add, or a cookie`,
      ).toEqual([]);
    }
  }
}

export interface Audit {
  readonly seen: Seen[];
  readonly violations: string[];
  readonly sockets: string[];
  /**
   * Waits until the requests, policy violations and sockets have stayed unchanged for a quiet
   * period (about 2 s), so a request made a moment after the last action is counted too, then
   * checks everything recorded since the first page load, and that no page has a cookie.
   */
  readonly verify: () => Promise<void>;
}

/** How long nothing new may happen before the audit is checked. */
const QUIET_MS = 2_000;

/**
 * The network audit, started before the first page of the context loads (it checks that): every
 * request of the context (the service worker's included), every policy violation and every
 * WebSocket of every page, a second tab included.
 */
export async function startAudit(
  context: BrowserContext,
  request: APIRequestContext,
  baseURL: string | undefined,
): Promise<Audit> {
  expect(
    context.pages().map((p) => p.url()),
    'the audit starts before any page of the context loads',
  ).toEqual(context.pages().map(() => 'about:blank'));
  const files = await appFiles(request, baseURL);
  const origin = appOrigin(baseURL);
  const seen: Seen[] = [];
  context.on('request', record(seen));
  const violations = await recordPolicyViolations(context);
  const sockets: string[] = [];
  const watch = (page: Page): void => {
    page.on('websocket', (socket) => {
      sockets.push(socket.url());
    });
  };
  for (const page of context.pages()) watch(page);
  context.on('page', watch);
  return {
    seen,
    violations,
    sockets,
    verify: async () => {
      const signature = () =>
        `${String(seen.length)}/${String(violations.length)}/${String(sockets.length)}`;
      let last = signature();
      let quietSince = Date.now();
      const giveUp = Date.now() + 30_000;
      while (Date.now() - quietSince < QUIET_MS && Date.now() < giveUp) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        if (signature() !== last) {
          last = signature();
          quietSince = Date.now();
        }
      }
      expect(seen.length).toBeGreaterThan(0);
      // The first request is the app's page itself: nothing ran before the audit started.
      expect(new URL(seen[0]?.url ?? origin).pathname).toBe(new URL(baseURL ?? origin).pathname);
      await readHeaders(seen);
      expectOnlyOwnOrigin(seen, origin, files);
      expect(violations).toEqual([]);
      expect(sockets).toEqual([]);
      for (const page of context.pages()) {
        if (page.isClosed() || !page.url().startsWith(origin)) continue;
        expect(await page.evaluate(() => document.cookie), page.url()).toBe('');
      }
    },
  };
}
