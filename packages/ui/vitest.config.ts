import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'ui',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    // Component tests render into a simulated browser page.
    environment: 'jsdom',
    // Load the real stylesheets (tokens and contrast tests, tap-target sizes).
    css: true,
  },
});
