// Where focus goes when a reminder is hidden (item 16 design section 1.14, T27), when the
// Reminders card is drawn anew elsewhere before the hide's write has come back.
import { afterEach, describe, expect, it } from 'vitest';
import { hideReminder } from './focus';

afterEach(() => {
  document.body.replaceChildren();
});

/** A Reminders card holding these reminders, each a titled .ui-reminder. */
function card(ids: readonly string[]): HTMLElement {
  const section = document.createElement('section');
  for (const id of ids) {
    const item = document.createElement('div');
    item.className = 'ui-reminder';
    item.dataset['testid'] = id;
    const title = document.createElement('h3');
    title.tabIndex = -1;
    title.textContent = id;
    item.append(title);
    section.append(item);
  }
  return section;
}

describe('hideReminder (T27)', () => {
  it('focuses the next title in the card that replaced this one while the write ran', async () => {
    const before = card(['backup-reminder', 'reminder-cholesterol']);
    document.body.append(before);
    const after = card(['reminder-cholesterol']);
    await hideReminder(before.querySelector('.ui-reminder'), async () => {
      // The prominent card goes and the card is drawn again in its normal place.
      before.remove();
      document.body.append(after);
      await Promise.resolve();
    });
    expect(document.activeElement).toBe(after.querySelector('h3'));
  });
});
