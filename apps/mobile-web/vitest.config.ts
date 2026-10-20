import { defineProject } from 'vitest/config';

export default defineProject({
  // The build-time constants from vite.config.ts, with test values.
  define: {
    __APP_VERSION__: JSON.stringify('0.0.0-test'),
    __APP_BUILD__: JSON.stringify(''),
  },
  test: {
    name: 'mobile-web',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    // Screen tests render into a simulated browser page.
    environment: 'jsdom',
    // The whole-app flow tests take 2–4 s alone; several builds share this machine's CPUs, so the
    // 5 s default timed them out under load (item 13 review).
    testTimeout: 20_000,
    setupFiles: ['src/testSetup/asyncWaits.ts'],
  },
});
