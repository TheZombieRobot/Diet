import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'relay',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'node',
  },
});
