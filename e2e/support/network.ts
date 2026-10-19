import { expect, type Request } from '@playwright/test';
import { BASE_PATH } from './app';

// HS-14 / TR-11, as reworded by DOC_REVIEW C03: the phone app makes only GET requests to its own
// origin for app files and update checks, with no query string or body built from user data.
// context.on('request') also sees the service worker's own requests. A request the Content
// Security Policy blocks never reaches the network log, so the audits record policy violations too
// (recordPolicyViolations in app.ts).

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

export function expectOnlyOwnOrigin(seen: readonly Seen[], origin: string): void {
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
