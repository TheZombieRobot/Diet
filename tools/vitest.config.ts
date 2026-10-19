import { defineConfig } from 'vitest/config';

// Static safety scans (checklist item 3). Run with `pnpm scan`; CI runs them on every push.
export default defineConfig({
  test: {
    name: 'scans',
    root: import.meta.dirname,
    include: ['scans/**/*.test.ts'],
    testTimeout: 60_000,
  },
});
