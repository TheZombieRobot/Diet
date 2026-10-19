import { expect, test } from '@playwright/test';

// Proves the browser test harness runs. Replaced by real app flows from checklist item 5 onwards.
test('browser harness starts and renders a page', async ({ page }) => {
  await page.setContent('<main><h1>Harness check</h1></main>');
  await expect(page.getByRole('heading', { name: 'Harness check' })).toBeVisible();
});
