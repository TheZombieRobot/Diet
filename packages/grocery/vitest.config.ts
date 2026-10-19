import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'grocery',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    environment: 'node',
  },
});
