/**
 * A structural text outline of Today for its snapshot (item 16 design section 5.2 C1, T18): the
 * status block's lines, then each block in order (a card, or the install banner) with its leaf
 * lines and its controls. Lines are never joined across elements, so the committed snapshot,
 * which the repository scans read as text, never runs words together. Imported only by tests.
 */

export interface OutlineControl {
  readonly role: string;
  readonly name: string;
  readonly disabled?: true;
  readonly checked?: boolean;
  readonly href?: string;
}

export interface OutlineBlock {
  readonly label: string;
  readonly lines: readonly string[];
  readonly controls: readonly OutlineControl[];
}

export interface TodayOutline {
  readonly status: readonly string[];
  readonly blocks: readonly OutlineBlock[];
}

// A meter's head is its label and figure (item 21's Nutrition today card).
const LEAVES = 'p, h3, li, dt, dd, label, .ui-stat__value, .ui-meter__head';
const CONTROLS = 'a, button, input';

/** The element's text nodes, each trimmed, joined by one space (so spans never run together). */
function text(element: Element): string {
  const parts: string[] = [];
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const part = (node.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (part !== '') parts.push(part);
  }
  return parts.join(' ');
}

/** Leaf text elements: those with no other leaf inside them. */
function lines(block: Element): string[] {
  return [...block.querySelectorAll(LEAVES)]
    .filter((element) => element.querySelector(LEAVES) === null)
    .map(text)
    .filter((line) => line !== '');
}

function control(element: Element): OutlineControl {
  const disabled =
    element.hasAttribute('disabled') || element.getAttribute('aria-disabled') === 'true';
  const role =
    element.getAttribute('role') ??
    (element.tagName === 'A' ? 'link' : element.tagName === 'INPUT' ? 'textbox' : 'button');
  const labelled = element.closest('label');
  const name =
    element.getAttribute('aria-label') ??
    (element.tagName === 'INPUT' && labelled !== null ? text(labelled) : text(element));
  return {
    role,
    name,
    ...(disabled ? { disabled: true as const } : {}),
    ...(element instanceof HTMLInputElement && element.type === 'checkbox'
      ? { checked: element.checked }
      : {}),
    ...(element.tagName === 'A' ? { href: element.getAttribute('href') ?? '' } : {}),
  };
}

function block(element: Element, label: string): OutlineBlock {
  return {
    label,
    lines: lines(element),
    controls: [...element.querySelectorAll(CONTROLS)].map(control),
  };
}

export function todayOutline(main: HTMLElement): TodayOutline {
  const status = main.querySelector('[data-testid="today-status"]');
  const blocks: OutlineBlock[] = [];
  for (const element of main.querySelectorAll('section, .ui-banner')) {
    if (element.matches('.ui-banner')) {
      blocks.push(block(element, 'banner'));
    } else if (element.parentElement?.closest('section') === null) {
      blocks.push(block(element, text(element.querySelector('h2') ?? element)));
    }
  }
  return { status: status === null ? [] : lines(status), blocks };
}
