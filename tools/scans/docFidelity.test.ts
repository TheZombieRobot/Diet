import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { alcohol, general, helpNumbers } from '../../packages/core/src/copy/health';

// health.ts must say exactly what the docs say (checklist conventions and item 42): each string
// is looked up in the document that defines it, so changing one without the other fails.
const root = resolve(import.meta.dirname, '../..');
const doc = (name: string) => readFileSync(join(root, 'docs', name), 'utf8');
const HEALTH_SAFETY = doc('HEALTH_SAFETY.md');
const UX_SCREENS = doc('UX_SCREENS.md');
const TEST_PLAN = doc('TEST_PLAN.md');

/** From the heading that matches to the next heading of the same or a higher level. */
function section(markdown: string, heading: RegExp): string {
  const lines = markdown.split('\n');
  const level = (line: string) => /^(#+)\s/.exec(line)?.[1]?.length;
  const start = lines.findIndex((l) => heading.test(l));
  if (start < 0) throw new Error(`No heading matches ${String(heading)}`);
  const own = level(lines[start] ?? '') ?? 1;
  const end = lines.findIndex((l, i) => i > start && (level(l) ?? Infinity) <= own);
  return lines.slice(start, end < 0 ? undefined : end).join('\n');
}

/** The first double-quoted text after `label`. */
function quoteAfter(text: string, label: string): string | undefined {
  const at = text.indexOf(label);
  return at < 0 ? undefined : /"([^"]+)"/.exec(text.slice(at + label.length))?.[1];
}

const firstRun = section(HEALTH_SAFETY, /^## 1\. /);
const alcoholSection = section(HEALTH_SAFETY, /^## 5\. /);

describe('health copy matches the docs word for word', () => {
  it('general.welcome is the UX_SCREENS.md Screen 1a quote', () => {
    expect(quoteAfter(UX_SCREENS, '**Screen 1a: Welcome.**')).toBe(general.welcome);
  });

  it('general.about is the bold not-a-medical-device sentence in HEALTH_SAFETY.md', () => {
    expect(
      /\*\*(The app is a personal logbook and planner\.[^*]+)\*\*/.exec(HEALTH_SAFETY)?.[1],
    ).toBe(general.about);
  });

  it('general.readinessOutcome is the HEALTH_SAFETY.md section 1 quote', () => {
    // The doc quotes it mid-sentence ('It says "nothing you have ..."'), so only the case of the
    // first letter may differ.
    const quoted = quoteAfter(firstRun, 'It says');
    expect(quoted?.slice(1)).toBe(general.readinessOutcome.slice(1));
    expect(quoted?.charAt(0).toUpperCase()).toBe(general.readinessOutcome.charAt(0));
  });

  it('alcohol.firstRunNotice is the mandatory notice in HEALTH_SAFETY.md section 1 and UX 1b', () => {
    expect(firstRun).toContain(`"${alcohol.firstRunNotice}"`);
    expect(quoteAfter(UX_SCREENS, '**Screen 1b:')).toBe(alcohol.firstRunNotice);
  });

  it('alcohol.helpCard is the card text in HEALTH_SAFETY.md section 5', () => {
    expect(quoteAfter(alcoholSection, 'Card text:')).toBe(alcohol.helpCard);
  });

  it('alcohol.noRiskFreeLevel is the phrase TEST_PLAN.md NN-09 requires', () => {
    const row = TEST_PLAN.split('\n').find((l) => l.startsWith('| NN-09 |')) ?? '';
    const phrase = /"([^"]*risk-free[^"]*)"/.exec(row)?.[1];
    expect(phrase).toBeDefined();
    expect(alcohol.noRiskFreeLevel.replace(/\.$/, '').toLowerCase()).toBe(phrase?.toLowerCase());
  });

  it('every help number is in the HEALTH_SAFETY.md help list, and nothing else is', () => {
    const start = HEALTH_SAFETY.indexOf('**Emergency and help numbers shown in the app');
    const list = HEALTH_SAFETY.slice(start, HEALTH_SAFETY.indexOf('\n\n', start));
    const listed = [...list.matchAll(/\*\*([\d ]+)\*\*/g)].map((m) => m[1]);
    // Need to Talk uses one number for calls and texts, so the numbers are compared as sets.
    const services = Object.values(helpNumbers).filter(
      (h): h is Exclude<typeof h, string> => typeof h !== 'string',
    );
    const numbers = services.flatMap((h) => ('text' in h ? [h.number, h.text] : [h.number]));
    expect(start).toBeGreaterThanOrEqual(0);
    expect(services.length).toBeGreaterThanOrEqual(4);
    expect(listed).toHaveLength(new Set(listed).size);
    expect(new Set(listed)).toEqual(new Set(numbers));
  });

  it('a service gets a tap-to-text row only where the help list says it takes texts', () => {
    const start = HEALTH_SAFETY.indexOf('**Emergency and help numbers shown in the app');
    const list = HEALTH_SAFETY.slice(start, HEALTH_SAFETY.indexOf('\n\n', start));
    for (const service of Object.values(helpNumbers)) {
      if (typeof service === 'string' || !('text' in service)) continue;
      const line = list.split('\n').find((l) => l.includes(`**${service.number}**`)) ?? '';
      expect(line, service.name).toMatch(/\btext\b/);
      expect(line, service.name).toContain(service.text);
    }
  });
});
