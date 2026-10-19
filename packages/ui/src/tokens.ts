/**
 * Reads the colour tokens in styles/tokens.css, so the web app manifest, the browser theme colour
 * and the icon generator use the same values as the stylesheet, and tests can check contrast.
 * tokens.css stays the only place a colour is written.
 */

export interface ThemeColour {
  light: string;
  dark: string;
}

/** One `light-dark()` argument: a hex colour or a function such as `rgb(13 20 18 / 0.97)`. */
const ARGUMENT = String.raw`(#[0-9a-fA-F]{3,8}|[a-z]+\([^()]*\))`;
const DECLARATION = new RegExp(
  String.raw`(--color-[\w-]+)\s*:\s*light-dark\(\s*${ARGUMENT}\s*,\s*${ARGUMENT}\s*\)\s*;`,
  'g',
);

/** Every `--color-*: light-dark(a, b);` declaration in a stylesheet, by property name. */
export function parseColourTokens(css: string): ReadonlyMap<string, ThemeColour> {
  const tokens = new Map<string, ThemeColour>();
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const [, name, light, dark] of withoutComments.matchAll(DECLARATION)) {
    if (name !== undefined && light !== undefined && dark !== undefined) {
      tokens.set(name, { light, dark });
    }
  }
  return tokens;
}

/** A token that must exist; throws with the token name so a renamed token fails loudly. */
export function requireToken(tokens: ReadonlyMap<string, ThemeColour>, name: string): ThemeColour {
  const token = tokens.get(name);
  if (token === undefined) throw new Error(`Colour token ${name} is missing from tokens.css`);
  return token;
}

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** Parses `#rgb`, `#rrggbb`, `#rrggbbaa` and `rgb(r g b / a)`; undefined for anything else. */
export function parseColour(value: string): Rgba | undefined {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(value.trim())?.[1];
  if (hex !== undefined) {
    const full = hex.length === 3 ? hex.replace(/./g, (c) => c + c) : hex;
    const channel = (i: number) => parseInt(full.slice(i, i + 2), 16);
    return {
      r: channel(0),
      g: channel(2),
      b: channel(4),
      a: full.length === 8 ? channel(6) / 255 : 1,
    };
  }
  const rgb =
    /^rgba?\(\s*(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)(?:\s*[/,]\s*(\d*\.?\d+))?\s*\)$/i.exec(
      value.trim(),
    );
  if (rgb === null) return undefined;
  const [, r = '0', g = '0', b = '0', a = '1'] = rgb;
  return { r: Number(r), g: Number(g), b: Number(b), a: Number(a) };
}

/** A translucent colour painted over an opaque one. */
export function over(top: Rgba, bottom: Rgba): Rgba {
  const mix = (t: number, b: number) => t * top.a + b * (1 - top.a);
  return { r: mix(top.r, bottom.r), g: mix(top.g, bottom.g), b: mix(top.b, bottom.b), a: 1 };
}

/** WCAG 2 relative luminance of an opaque colour. */
export function relativeLuminance({ r, g, b }: Rgba): number {
  const linear = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** WCAG 2 contrast ratio between two opaque colours (1 to 21). */
export function contrastRatio(a: Rgba, b: Rgba): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}
