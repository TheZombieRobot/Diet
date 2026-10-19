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

/**
 * When a card that held focus leaves Today (the Talk to someone card's "Not now", the Reminders
 * card when its last item is hidden), focus moves to the heading of the card that took its place,
 * or the screen heading. `anchor` is any element directly inside Today's container (the status
 * block), so the watch covers exactly Today's own cards.
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
        nextRegionHeading(record.nextSibling)?.focus({ preventScroll: false });
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
 * one's when it was the last. When it was the only one the card goes and useFocusRescue takes
 * over. A failed write throws and leaves focus where it was.
 */
export async function hideReminder(
  item: HTMLElement | null,
  write: () => Promise<unknown>,
): Promise<void> {
  const title = (el: Element | null | undefined) =>
    el?.matches('.ui-reminder') === true ? el.querySelector<HTMLElement>('h3') : null;
  const target = title(item?.nextElementSibling) ?? title(item?.previousElementSibling);
  await write();
  if (target?.isConnected === true) target.focus();
}
