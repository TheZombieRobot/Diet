/**
 * Draws the app icon (a leaf on a plate, on teal; no text) and renders the PNG sizes the web app
 * manifest needs through the Chromium that Playwright already installs. Run after changing the
 * mark or the teal token:
 *
 *   pnpm icons
 *
 * Writes to apps/mobile-web/public/: icon-192.png and icon-512.png (purpose "any", rounded
 * corners), maskable-512.png (full bleed, the mark inside the central safe zone),
 * apple-touch-icon.png (180 px, full bleed) and favicon.svg. The privacy scan allows only these
 * names there, each at most 64 KB and without camera metadata. Colours come from
 * packages/ui/src/styles/tokens.css (light theme teal and the text colour on teal).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { parseColourTokens, requireToken } from '../../packages/ui/src/tokens.ts';

const root = resolve(import.meta.dirname, '../..');
const publicDir = join(root, 'apps/mobile-web/public');
const tokens = parseColourTokens(
  readFileSync(join(root, 'packages/ui/src/styles/tokens.css'), 'utf8'),
);
const teal = requireToken(tokens, '--color-teal').light;
const onTeal = requireToken(tokens, '--color-on-teal').light;

/**
 * The mark on a 512 grid: a plate (outer ring and a softer inner rim) with a leaf on it. Its
 * radius is 162, inside the maskable safe zone (a circle of radius 204.8 around the centre).
 */
const MARK = `
  <circle cx="256" cy="256" r="150" fill="none" stroke="${onTeal}" stroke-width="24" />
  <circle cx="256" cy="256" r="114" fill="none" stroke="${onTeal}" stroke-opacity="0.45" stroke-width="8" />
  <path d="M200 312C200 244 244 200 312 200C312 268 268 312 200 312Z" fill="${onTeal}" />
  <path d="M200 312L178 334" fill="none" stroke="${onTeal}" stroke-width="12" stroke-linecap="round" />
  <path d="M214 298L290 222" fill="none" stroke="${teal}" stroke-width="10" stroke-linecap="round" />
`;

/** rounded: the "any" icon with corners cut, for browsers and the install dialog. */
function iconSvg(rounded: boolean, size?: number): string {
  const dimensions = size === undefined ? '' : ` width="${size}" height="${size}"`;
  const corner = rounded ? ' rx="112"' : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"${dimensions}><rect width="512" height="512"${corner} fill="${teal}" />${MARK}</svg>`;
}

const PNGS: readonly { file: string; size: number; rounded: boolean }[] = [
  { file: 'icon-192.png', size: 192, rounded: true },
  { file: 'icon-512.png', size: 512, rounded: true },
  { file: 'maskable-512.png', size: 512, rounded: false },
  { file: 'apple-touch-icon.png', size: 180, rounded: false },
];

mkdirSync(publicDir, { recursive: true });
const browser = await chromium.launch();
try {
  for (const { file, size, rounded } of PNGS) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(
      `<!doctype html><html><body style="margin:0;background:transparent">${iconSvg(rounded, size)}</body></html>`,
    );
    const png = await page.screenshot({
      type: 'png',
      omitBackground: true,
      clip: { x: 0, y: 0, width: size, height: size },
    });
    writeFileSync(join(publicDir, file), png);
    await page.close();
    console.warn(`${file}: ${size} x ${size}, ${png.length} bytes`);
  }
} finally {
  await browser.close();
}
writeFileSync(join(publicDir, 'favicon.svg'), `${iconSvg(true)}\n`);
console.warn('favicon.svg written');
