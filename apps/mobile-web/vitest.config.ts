import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'mobile-web',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'node',
  },
});
