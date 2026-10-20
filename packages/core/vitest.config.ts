import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'core',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    environment: 'node',
    // Under load from parallel builds the 5 s default timed property and crypto tests out; a slow
    // test is not a failure.
    testTimeout: 20_000,
  },
});
