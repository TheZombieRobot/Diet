/**
 * Where focus goes when something on Today goes away (item 16 design section 1.14, T27): never
 * to the top of the page, so a keyboard or TalkBack user carries on from where they were.
 */
import { type RefObject, useEffect } from 'react';

/** The heading of the first card (section) from `from` on, or the screen heading when none. */
export function nextRegionHeading(from: Node | null): HTMLElement | null {
  for (let node = from; node !== null; node = node.nextSibling) {
    if (!(node instanceof HTMLElement)) continue;
    const heading = node.matches('section')
      ? node.querySelector<HTMLElement>(':scope > .ui-card__header > h2')
      : node.querySelector<HTMLElement>('section h2');
    if (heading !== null) return heading;
  }
  return document.querySelector<HTMLElement>('h1.ui-topbar__title');
}

/** A reminder's title, found by the reminder's test id under `root`. */
const reminderTitle = (root: ParentNode, id: string): HTMLElement | null =>
  root.querySelector<HTMLElement>(`.ui-reminder[data-testid="${id}"] > h3`);

/**
 * The title of the reminder that held focus, in a card added by the same change: the Reminders
 * card is drawn anew in its normal place when the backup reminder stops being prominent.
 */
function movedReminderTitle(lost: Element, records: readonly MutationRecord[]): HTMLElement | null {
  const id = lost.closest('.ui-reminder')?.getAttribute('data-testid');
  if (id === null || id === undefined) return null;
  for (const record of records) {
    for (const node of record.addedNodes) {
      const title = node instanceof Element ? reminderTitle(node, id) : null;
      if (title !== null) return title;
    }
  }
  return null;
}

/**
 * When a card that held focus leaves Today (the Talk to someone card's "Not now", the Reminders
 * card when its last item is hidden), focus moves to the heading of the card that took its place,
 * or the screen heading; when the Reminders card moved, to the same reminder's title in its new
 * place. `anchor` is any element directly inside Today's container (the status block), so the
 * watch covers exactly Today's own cards.
 */
export function useFocusRescue(anchor: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const container = anchor.current?.parentElement;
    if (container === null || container === undefined) return;
    let focused: Element | null = null;
    const onFocusIn = (event: FocusEvent): void => {
      focused = event.target instanceof Element ? event.target : null;
    };
    const observer = new MutationObserver((records) => {
      const lost = focused;
      if (lost === null || lost.isConnected) return;
      const active = document.activeElement;
      if (active !== null && active !== document.body && active.isConnected) return;
      for (const record of records) {
        if (![...record.removedNodes].some((node) => node.contains(lost))) continue;
        focused = null;
        const target = movedReminderTitle(lost, records) ?? nextRegionHeading(record.nextSibling);
        target?.focus({ preventScroll: false });
        return;
      }
    });
    container.addEventListener('focusin', onFocusIn);
    observer.observe(container, { childList: true });
    return () => {
      container.removeEventListener('focusin', onFocusIn);
      observer.disconnect();
    };
  }, [anchor]);
}

/**
 * Hides one reminder (`write`), then moves focus to the next reminder's title, or the previous
 * one's when it was the last; if the card has meanwhile been drawn anew in its other place, to
 * that title there. When it was the only one the card goes and useFocusRescue takes over. A
 * failed write throws and leaves focus where it was.
 */
export async function hideReminder(
  item: HTMLElement | null,
  write: () => Promise<unknown>,
): Promise<void> {
  const reminder = (el: Element | null | undefined) =>
    el?.matches('.ui-reminder') === true ? el : null;
  const next = reminder(item?.nextElementSibling) ?? reminder(item?.previousElementSibling);
  const target = next?.querySelector<HTMLElement>(':scope > h3') ?? null;
  const id = next?.getAttribute('data-testid') ?? null;
  await write();
  if (target?.isConnected === true) target.focus();
  else if (id !== null) reminderTitle(document, id)?.focus();
}
