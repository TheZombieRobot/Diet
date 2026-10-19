import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'test-fixtures',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    environment: 'node',
  },
});
