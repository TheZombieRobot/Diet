import type { Page } from '@playwright/test';
import { contrastRatio, over, parseColour, type Rgba } from '../../packages/ui/src/tokens';

/**
 * The contrast sweep (WCAG 2 AA, 4.5:1). For every element with text of its own, the browser
 * reports the text colour and the background and opacity of each element from <html> down to it;
 * the colours are then painted over each other the way the browser composites them.
 */
export const MIN_CONTRAST = 4.5;

interface Layer {
  background: string;
  opacity: number;
}

export interface TextSample {
  text: string;
  color: string;
  /** From <html> down to the element itself. */
  layers: Layer[];
}

/** Every visible element with text of its own, except disabled controls (WCAG exempts them). */
export function textSamples(page: Page): Promise<TextSample[]> {
  return page.evaluate(() => {
    const samples: {
      text: string;
      color: string;
      layers: { background: string; opacity: number }[];
    }[] = [];
    for (const element of Array.from(document.body.querySelectorAll('*'))) {
      const own = Array.from(element.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent ?? '')
        .join('')
        .trim();
      if (own === '') continue;
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      if (box.width === 0 || box.height === 0 || style.visibility !== 'visible') continue;
      // An off action row ("Later", "Off") is aria-disabled but meant to be read at full contrast,
      // so it is swept.
      const exempt = ':disabled, [aria-disabled="true"]:not(.ui-action-row--off)';
      if (element.closest(`${exempt}, .ui-visually-hidden`)) continue;
      const chain: Element[] = [];
      for (let node: Element | null = element; node !== null; node = node.parentElement) {
        chain.unshift(node);
      }
      samples.push({
        text: own.replace(/\s+/g, ' ').slice(0, 48),
        color: style.color,
        layers: chain.map((node) => {
          const s = getComputedStyle(node);
          return { background: s.backgroundColor, opacity: Number(s.opacity) };
        }),
      });
    }
    return samples;
  });
}

function colour(value: string): Rgba {
  const parsed = parseColour(value);
  if (parsed === undefined) throw new Error(`The contrast sweep cannot read the colour "${value}"`);
  return parsed;
}

/** The contrast of a sample's text against everything painted beneath it. */
export function contrastOf(sample: TextSample): number {
  let backdrop: Rgba = { r: 255, g: 255, b: 255, a: 1 };
  let opacity = 1;
  for (const layer of sample.layers) {
    opacity *= layer.opacity;
    const background = colour(layer.background);
    if (background.a > 0) backdrop = over({ ...background, a: background.a * opacity }, backdrop);
  }
  const text = colour(sample.color);
  return contrastRatio(over({ ...text, a: text.a * opacity }, backdrop), backdrop);
}

/** The samples below MIN_CONTRAST, described for a failure message, and how many were checked. */
export async function lowContrastText(
  page: Page,
  where: string,
): Promise<{ low: string[]; checked: number }> {
  const samples = await textSamples(page);
  const low = samples
    .map((s) => ({ s, ratio: contrastOf(s) }))
    .filter(({ ratio }) => ratio < MIN_CONTRAST)
    .map(({ s, ratio }) => `${where}: "${s.text}" ${ratio.toFixed(2)}:1`);
  return { low, checked: samples.length };
}
