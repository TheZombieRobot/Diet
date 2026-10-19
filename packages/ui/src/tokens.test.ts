import { describe, expect, it } from 'vitest';
import baseCss from './styles/base.css?raw';
import componentsCss from './styles/components.css?raw';
import tokensCss from './styles/tokens.css?raw';
import {
  contrastRatio,
  over,
  parseColour,
  parseColourTokens,
  requireToken,
  type Rgba,
} from './tokens';

const tokens = parseColourTokens(tokensCss);
const THEMES = ['light', 'dark'] as const;

function colour(name: string, theme: (typeof THEMES)[number]): Rgba {
  const value = requireToken(tokens, name)[theme];
  const parsed = parseColour(value);
  if (parsed === undefined) throw new Error(`${name} (${theme}) is not a colour: ${value}`);
  return parsed;
}

describe('colour tokens (styles/tokens.css)', () => {
  it('reads every --color-* declaration, each with a light and a dark value', () => {
    const declared = [...tokensCss.matchAll(/^\s*(--color-[\w-]+)\s*:/gm)].map((m) => m[1]);
    expect(declared.length).toBeGreaterThan(20);
    expect([...tokens.keys()].sort()).toEqual([...declared].sort());
    for (const [name, value] of tokens) {
      expect(parseColour(value.light), `${name} light`).toBeDefined();
      expect(parseColour(value.dark), `${name} dark`).toBeDefined();
    }
  });

  it('keeps every colour in tokens.css: the other stylesheets only use the tokens', () => {
    for (const [file, css] of [
      ['base.css', baseCss],
      ['components.css', componentsCss],
    ] as const) {
      const code = css.replace(/\/\*[\s\S]*?\*\//g, '');
      expect(code.match(/#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|light-dark)\(/gi), file).toBeNull();
      for (const [, used] of code.matchAll(/var\((--color-[\w-]+)\)/g)) {
        expect(tokens.has(used ?? ''), `${file} uses ${used ?? ''}`).toBe(true);
      }
    }
  });

  it('follows the phone setting, with an explicit light or dark override for a later setting', () => {
    expect(tokensCss).toMatch(/:root\s*\{\s*color-scheme:\s*light dark;/);
    expect(tokensCss).toMatch(/:root\[data-theme='light'\]\s*\{\s*color-scheme:\s*light;/);
    expect(tokensCss).toMatch(/:root\[data-theme='dark'\]\s*\{\s*color-scheme:\s*dark;/);
  });

  // Text must stay readable in sunlight: WCAG AA (4.5:1) for every text and background pair.
  const TEXT_PAIRS: readonly [text: string, background: string][] = [
    ['--color-ink', '--color-ground'],
    ['--color-ink', '--color-card'],
    ['--color-ink', '--color-inset'],
    ['--color-ink-soft', '--color-chip'],
    ['--color-ink-soft', '--color-card'],
    ['--color-secondary', '--color-ground'],
    ['--color-secondary', '--color-card'],
    ['--color-teal', '--color-ground'],
    ['--color-teal', '--color-card'],
    ['--color-on-teal', '--color-teal'],
    ['--color-on-teal-tint', '--color-teal-tint'],
    ['--color-teal', '--color-teal-tint'],
    ['--color-amber', '--color-card'],
    ['--color-on-amber-tint', '--color-amber-tint'],
    ['--color-on-emergency', '--color-emergency'],
    ['--color-on-emergency-tint', '--color-emergency-tint'],
    ['--color-on-fab', '--color-fab'],
  ];

  for (const theme of THEMES) {
    it.each(TEXT_PAIRS)(`${theme}: %s on %s has at least 4.5:1 contrast`, (text, background) => {
      expect(contrastRatio(colour(text, theme), colour(background, theme))).toBeGreaterThanOrEqual(
        4.5,
      );
    });

    it(`${theme}: the caution button's amber outline stands out from the card (at least 3:1)`, () => {
      expect(
        contrastRatio(colour('--color-amber-strong', theme), colour('--color-card', theme)),
      ).toBeGreaterThanOrEqual(3);
    });

    // Item 21 (WCAG 1.4.11): each meter fill stands out from the track, and the select chevron
    // from the field. The chip tones' words are TEXT_PAIRS above.
    it.each([
      '--color-ink',
      '--color-teal',
      '--color-ink-soft',
      '--color-secondary',
      '--color-amber-strong',
    ])(`${theme}: the meter fill %s on the track has at least 3:1 contrast`, (fill) => {
      expect(
        contrastRatio(colour(fill, theme), colour('--color-chip', theme)),
      ).toBeGreaterThanOrEqual(3);
    });

    it(`${theme}: the select chevron stands out from the field (at least 3:1)`, () => {
      expect(
        contrastRatio(colour('--color-ink-soft', theme), colour('--color-inset', theme)),
      ).toBeGreaterThanOrEqual(3);
    });

    it(`${theme}: tab labels on the translucent tab bar have at least 4.5:1 contrast`, () => {
      const bar = over(colour('--color-tabbar', theme), colour('--color-ground', theme));
      expect(contrastRatio(colour('--color-secondary', theme), bar)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(colour('--color-teal', theme), bar)).toBeGreaterThanOrEqual(4.5);
    });
  }
});

describe('colour helpers', () => {
  it('parses hex and rgb() colours', () => {
    expect(parseColour('#fff')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseColour('#0B6E5B')).toEqual({ r: 11, g: 110, b: 91, a: 1 });
    expect(parseColour('#00000080')?.a).toBeCloseTo(0.5, 2);
    expect(parseColour('rgb(13 20 18 / 0.97)')).toEqual({ r: 13, g: 20, b: 18, a: 0.97 });
    expect(parseColour('rgba(14, 25, 22, 0.05)')).toEqual({ r: 14, g: 25, b: 22, a: 0.05 });
    expect(parseColour('teal')).toBeUndefined();
  });

  it('computes WCAG contrast ratios', () => {
    const black = { r: 0, g: 0, b: 0, a: 1 };
    const white = { r: 255, g: 255, b: 255, a: 1 };
    expect(contrastRatio(black, white)).toBeCloseTo(21, 5);
    expect(contrastRatio(white, black)).toBeCloseTo(21, 5);
    expect(contrastRatio(white, white)).toBe(1);
  });

  it('paints a translucent colour over an opaque one', () => {
    const half = { r: 255, g: 255, b: 255, a: 0.5 };
    expect(over(half, { r: 0, g: 0, b: 0, a: 1 })).toEqual({ r: 127.5, g: 127.5, b: 127.5, a: 1 });
  });

  it('reports a missing token by name', () => {
    expect(() => requireToken(tokens, '--color-missing')).toThrow('--color-missing');
  });
});
