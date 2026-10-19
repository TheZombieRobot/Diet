import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'grocery',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'node',
  },
});
