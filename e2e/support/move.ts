import { expect, type Page } from '@playwright/test';

/**
 * Item 27 (design section 5.4): a weekly plan built from the page's own weekday d (Monday 1), so
 * a session is planned today whatever day the test runs: Session A and the beach walk on d, and
 * Session B three days later. That keeps two strength days apart and five rest days, so it passes
 * every plan rule, with no clock control. Written with raw IndexedDB, then the app reloads.
 */
export async function seedMovePlan(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const d = ((new Date().getDay() + 6) % 7) + 1;
        const b = ((d + 2) % 7) + 1;
        const weeklyPattern = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
          weekday,
          templateIds:
            weekday === d
              ? ['seed:session-a', 'seed:session-beach-walk']
              : weekday === b
                ? ['seed:session-b']
                : [],
        }));
        const request = indexedDB.open('diet');
        request.onerror = () => {
          reject(new Error('open failed'));
        };
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction(['settings'], 'readwrite');
          const get = tx.objectStore('settings').get('singleton');
          get.onsuccess = () => {
            tx.objectStore('settings').put({ ...(get.result as object), weeklyPattern });
          };
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => {
            reject(new Error('write failed'));
          };
        };
      }),
  );
  await page.reload();
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
}
