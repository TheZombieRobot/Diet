import { defineConfig, devices } from '@playwright/test';

// Browser end-to-end tests (TEST_PLAN.md section 1). App-specific projects and a web server are
// added as each app is built. Chromium only: the owner uses Chrome on Android and on the laptop.
export default defineConfig({
  testDir: './e2e',
  forbidOnly: !!process.env['CI'],
  retries: 0,
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
