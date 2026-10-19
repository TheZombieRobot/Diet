import { type APIRequestContext, expect, type Request } from '@playwright/test';
import { BASE_PATH } from './app';

// HS-14 / TR-11, as reworded by DOC_REVIEW C03: the phone app makes only GET requests to its own
// origin for app files and update checks, with no query string or body built from user data.
// context.on('request') also sees the service worker's own requests. A request the Content
// Security Policy blocks never reaches the network log, so the audits record policy violations too
// (recordPolicyViolations in app.ts). Same-origin requests are checked against an allowlist of
// paths, the app's own files, so a request that carries data in its path fails the audit online
// too, not only when it fails offline (privacy review).

export interface Seen {
  url: string;
  method: string;
  body: string | null;
  fromServiceWorker: boolean;
}

export function record(into: Seen[]) {
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
export function appOrigin(baseURL: string | undefined): string {
  if (baseURL === undefined) throw new Error('playwright.config.ts sets baseURL');
  return new URL(baseURL).origin;
}

/**
 * Every path the app may request: the page itself, the service worker, the Workbox runtime it
 * loads, and each file of its precache manifest, read from the sw.js the server serves (so a
 * deployed copy is checked against its own files). Read with Playwright's request API, outside
 * the browser context, so this read is not itself audited.
 */
export async function appFiles(
  request: APIRequestContext,
  baseURL: string | undefined,
): Promise<ReadonlySet<string>> {
  if (baseURL === undefined) throw new Error('playwright.config.ts sets baseURL');
  const base = new URL(baseURL);
  const worker = new URL('sw.js', base);
  const response = await request.get(worker.href);
  expect(response.ok(), worker.href).toBe(true);
  const text = await response.text();
  const files = new Set([base.pathname, worker.pathname]);
  for (const [, url = ''] of text.matchAll(/\burl:\s*"([^"]+)"/g)) {
    files.add(new URL(url, base).pathname);
  }
  for (const [, runtime = ''] of text.matchAll(/["'](\.\/workbox-[\w-]+)["']/g)) {
    files.add(new URL(`${runtime}.js`, base).pathname);
  }
  // A real manifest: the page, its scripts and styles, and the icons.
  expect([...files].some((f) => f.endsWith('/index.html'))).toBe(true);
  expect([...files].some((f) => /\/assets\/index-[\w-]+\.js$/.test(f))).toBe(true);
  expect([...files].some((f) => /\/workbox-[\w-]+\.js$/.test(f))).toBe(true);
  return files;
}

export function expectOnlyOwnOrigin(
  seen: readonly Seen[],
  origin: string,
  files: ReadonlySet<string>,
): void {
  for (const { url, method, body } of seen) {
    const parsed = new URL(url);
    expect(parsed.origin, url).toBe(origin);
    expect(parsed.pathname.startsWith(BASE_PATH), url).toBe(true);
    expect(files.has(parsed.pathname), `${url} is not one of the app's own files`).toBe(true);
    expect(method, url).toBe('GET');
    expect(body, url).toBeNull();
    // Workbox adds a cache-busting revision to files whose names carry no hash; nothing else.
    expect(
      [...parsed.searchParams.keys()].filter((k) => k !== '__WB_REVISION__'),
      url,
    ).toEqual([]);
  }
}
