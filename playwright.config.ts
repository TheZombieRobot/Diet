import { defineConfig, devices } from '@playwright/test';

/**
 * The port `vite preview` serves the test build on. It is not the README's preview port (4173),
 * so a preview left open does not stop the tests; set DIET_E2E_PORT to use another one.
 */
const PORT = process.env['DIET_E2E_PORT'] ?? '4317';
if (!/^\d{2,5}$/.test(PORT)) throw new Error(`DIET_E2E_PORT must be a port number, not "${PORT}"`);
/** Where `vite preview` serves the production build of the phone app (apps/mobile-web). */
const PREVIEW_ORIGIN = `http://127.0.0.1:${PORT}`;
/** The app's base path, the same as on GitHub Pages (https://thezombierobot.github.io/Diet/). */
const APP_BASE = '/Diet/';

/**
 * Set DIET_E2E_URL to test a deployed copy instead of a local build, for example after a GitHub
 * Pages deploy (DOC_REVIEW C35):
 *   DIET_E2E_URL=https://thezombierobot.github.io/Diet/ pnpm exec playwright test e2e/pwa.spec.ts
 * The update test (e2e/update.spec.ts) always needs the local build.
 */
const deployedUrl = process.env['DIET_E2E_URL']?.replace(/\/?$/, '/');

// Report the service worker's own network requests to context.on('request'), and apply
// context.setOffline() to the service worker as well as the page. Without this, Playwright 1.56
// neither sees nor blocks them, and the network audit (HS-14, TR-11, DOC_REVIEW C03) and the
// offline tests (PWA-03) would miss everything the service worker fetches. Set here so the test
// workers, which launch the browser, inherit it.
process.env['PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS'] = '1';

// Browser end-to-end tests (TEST_PLAN.md section 1) against the production build: the web server
// below builds the app, then serves it with `vite preview`. Chromium only: the owner uses Chrome
// on Android and on the laptop.
export default defineConfig({
  testDir: './e2e',
  forbidOnly: !!process.env['CI'],
  retries: 0,
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: deployedUrl ?? `${PREVIEW_ORIGIN}${APP_BASE}`,
    trace: 'retain-on-failure',
    serviceWorkers: 'allow',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  ...(deployedUrl === undefined
    ? {
        webServer: {
          // --strictPort: fail rather than move to another port if this one is taken.
          command: `pnpm --filter @diet/mobile-web build && pnpm --filter @diet/mobile-web preview --port ${PORT} --strictPort`,
          url: `${PREVIEW_ORIGIN}${APP_BASE}`,
          // Always a fresh production build, never a server left running from earlier.
          reuseExistingServer: false,
          timeout: 120_000,
          stdout: 'ignore' as const,
          stderr: 'pipe' as const,
        },
      }
    : {}),
});
