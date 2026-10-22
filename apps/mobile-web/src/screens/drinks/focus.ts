/**
 * Where focus goes on the Drinks screen when the control that held it goes away (item 28 design
 * 2.2: focus is never left on <body>). The screen's own moves come first: a closed panel hands
 * focus back to the button that opened it, and an undo to the status line. This rescue catches the
 * rest, such as a deleted entry or a form that closes after a save: focus moves to the heading of
 * the card the control was in, or, when that card has gone too, to the screen part it was in. A
 * keyboard or TalkBack user carries on from there rather than from the top of the page.
 */
import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';

/** The heading of a card, which can take focus from code (packages/ui Card). */
const cardHeading = (card: Element | null): HTMLElement | null =>
  card?.querySelector<HTMLElement>(':scope > .ui-card__header > h2') ?? null;

export function useDrinksFocusRescue(container: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const root = container.current;
    if (root === null) return;
    let lost: { element: Element; card: Element | null; part: HTMLElement | null } | null = null;
    const onFocusIn = (event: FocusEvent): void => {
      const element = event.target instanceof Element ? event.target : null;
      lost =
        element === null
          ? null
          : {
              element,
              card: element.closest('section.ui-card'),
              part: element.closest<HTMLElement>('.ui-drinks-part'),
            };
    };
    const observer = new MutationObserver(() => {
      if (lost === null || lost.element.isConnected) return;
      const active = document.activeElement;
      if (active !== null && active !== document.body && active.isConnected) return;
      const { card, part } = lost;
      lost = null;
      const target =
        (card?.isConnected === true ? cardHeading(card) : null) ??
        (part?.isConnected === true ? part : null) ??
        document.querySelector<HTMLElement>('h1.ui-topbar__title');
      target?.focus();
    });
    root.addEventListener('focusin', onFocusIn);
    observer.observe(root, { childList: true, subtree: true });
    return () => {
      root.removeEventListener('focusin', onFocusIn);
      observer.disconnect();
    };
  }, [container]);
}

/**
 * Focus moved on purpose once the next render is on screen: `focusNext(() => element)` after a
 * panel closes, so the element it names (often drawn by that render) can take it.
 */
export function useFocusNext(): (find: () => HTMLElement | null | undefined) => void {
  const pending = useRef<(() => HTMLElement | null | undefined) | null>(null);
  const [request, setRequest] = useState(0);
  useEffect(() => {
    const find = pending.current;
    if (find === null) return;
    pending.current = null;
    find()?.focus();
  }, [request]);
  return useCallback((find) => {
    pending.current = find;
    setRequest((n) => n + 1);
  }, []);
}

/**
 * Scrolls `element` to the top of the screen and moves focus to `focus`. The page's scroll padding
 * is the top bar's measured height (TopBar), so the element lands below the bar however many lines
 * it has wrapped to at 200% text.
 */
export function scrollToTop(element: HTMLElement, focus: HTMLElement = element): void {
  // jsdom has no scrollIntoView (FastingScreen and the Backup card guard it the same way).
  if (typeof element.scrollIntoView === 'function') element.scrollIntoView({ block: 'start' });
  focus.focus({ preventScroll: true });
}
