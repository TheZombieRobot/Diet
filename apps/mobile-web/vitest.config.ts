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
  },
});
