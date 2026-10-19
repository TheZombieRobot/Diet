import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'relay',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    environment: 'node',
  },
});
