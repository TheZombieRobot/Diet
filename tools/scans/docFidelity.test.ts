import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  alcohol,
  fasting,
  general,
  helpNumbers,
  move,
  profile,
  readiness,
  reflux,
  schedule,
  targets,
  weight,
} from '../../packages/core/src/copy/health';
import { fillTemplate } from '../../packages/core/src/copy/template';
import { KETO_CEILING_CLOSED_BY } from '../../packages/core/src/storage/readiness';

// health.ts must say exactly what the docs say (checklist conventions and item 42): each string
// is looked up in the document that defines it, so changing one without the other fails.
const root = resolve(import.meta.dirname, '../..');
const doc = (name: string) => readFileSync(join(root, 'docs', name), 'utf8');
const HEALTH_SAFETY = doc('HEALTH_SAFETY.md');
const UX_SCREENS = doc('UX_SCREENS.md');
const TEST_PLAN = doc('TEST_PLAN.md');
const STORAGE_DESIGN = doc('STORAGE_DESIGN.md');

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
const weightSection = section(HEALTH_SAFETY, /^## 2\. /);
const DECISIONS = doc('DECISIONS.md');
const alcoholSection = section(HEALTH_SAFETY, /^## 5\. /);
const fastingSection = section(HEALTH_SAFETY, /^## 3\. /);
const today = section(UX_SCREENS, /^## 2\. Today/);
const REQUIRED_COPY = JSON.parse(
  readFileSync(join(root, 'tools', 'scans', 'required-copy.json'), 'utf8'),
) as string[];

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

  // Item 14: the weight copy (HEALTH_SAFETY section 2; DECISIONS C102 row).
  it('weight.phase.kickstartNote is the weight card quote in HEALTH_SAFETY.md section 2', () => {
    expect(quoteAfter(weightSection, 'The weight card says:')).toBe(weight.phase.kickstartNote);
  });

  it('weight.rapidLoss.body is the rapid-loss card quote in HEALTH_SAFETY.md section 2', () => {
    expect(quoteAfter(weightSection, 'Rapid-loss card:')).toBe(weight.rapidLoss.body);
  });

  it('the chart lines are the "trend, not a promise" and "typical range, not a promise" quotes', () => {
    expect(quoteAfter(weightSection, 'carries the line')).toBe(
      weight.chart.trendLine.replace(/\.$/, '').replace(/^T/, 't'),
    );
    expect(weightSection).toContain('"typical range, not a promise"');
    expect(weight.chart.bandLegend).toContain('typical range, not a promise');
  });

  it('weight.phase.steadyPace and the stop-sign action line are the HEALTH_SAFETY.md section 2 sentences', () => {
    const pace = weight.phase.steadyPace.replace(/\.$/, '');
    expect(weightSection).toContain(pace.charAt(0).toLowerCase() + pace.slice(1));
    const action = /The card says to ([^.]+)\./.exec(weightSection)?.[1] ?? '';
    expect(weight.stopSigns.action).toBe(`${action.charAt(0).toUpperCase()}${action.slice(1)}.`);
  });

  it('the blood-pressure stop-sign line carries the DECISIONS C102 wording', () => {
    const wording = 'check with your pharmacist or GP before adding salt';
    expect(readiness.bloodPressure.stopSign).toContain(wording);
    expect(DECISIONS).toContain(wording);
  });

  it('the daily-change lines say a litre of water is a kilogram, and the goal refusal names BMI 18.5 for the height', () => {
    expect(weightSection).toContain('"a litre of water is a kilogram"');
    expect(weight.fluctuation.body).toContain('a litre of water is a kilogram');
    expect(weight.trend.howToRead).toContain('a litre of water is a kilogram');
    expect(weight.goal.belowBmiFloor).toContain('below a BMI of 18.5 for your height');
  });
});

describe('first-run copy matches the docs word for word (item 13)', () => {
  it('the seven readiness questions are HEALTH_SAFETY.md section 1, in order', () => {
    const listed = [...firstRun.matchAll(/^\d\. (.+?) →/gm)].map((m) => m[1]);
    expect(listed).toEqual(Object.values(readiness.questions));
  });

  it('general.welcome is the bold not-a-medical-device sentence, shown on the first-run screen', () => {
    expect(general.welcome).toBe(general.about);
  });

  it('the Kickstart label, the Kickstart line with 140 g and the reflux label are the UX 1d and 1e quotes', () => {
    const profileScreen = UX_SCREENS.slice(UX_SCREENS.indexOf('**Screen 1d: Profile.**'));
    expect(quoteAfter(profileScreen, 'Kickstart choice (')).toBe(profile.kickstartLabel);
    const scheduleScreen = UX_SCREENS.slice(UX_SCREENS.indexOf('**Screen 1e: Eating schedule.**'));
    expect(quoteAfter(scheduleScreen, 'with a line:')).toBe(
      fillTemplate(schedule.kickstartLine, { proteinG: 140 }),
    );
    expect(quoteAfter(scheduleScreen, 'Reflux option:')).toBe(schedule.refluxLabel);
  });

  it('the 22:2 and 23:1 names are the HEALTH_SAFETY.md section 3 preset names', () => {
    for (const [id, name] of Object.entries(schedule.presetNames)) {
      const quoted =
        quoteAfter(fastingSection, `${id} (`) ?? quoteAfter(fastingSection, `**${id} (`);
      expect(quoted?.toLowerCase(), id).toBe(name.toLowerCase());
    }
  });

  it('STORAGE_DESIGN.md 13.3 closes the keto ceiling and goal setting with the same answers as the code', () => {
    const rowOf = (output: string) =>
      STORAGE_DESIGN.split('\n').find((l) => l.startsWith(`| \`${output}\` |`)) ?? '';
    // under18 is gated(q1) or a birth year that may be under 18 (13.3, first row).
    const questions = (row: string) =>
      [...row.matchAll(/gated\((q\d)\)|\bunder18\b/g)].map((m) => m[1] ?? 'q1');
    expect(questions(rowOf('ketoCeilingAvailable'))).toEqual([...KETO_CEILING_CLOSED_BY]);
    expect(questions(rowOf('goalSettingAvailable'))).toEqual(['q1', 'q2', 'q5']);
  });
});

describe('Move copy matches the docs word for word (item 26)', () => {
  const exerciseSection = section(HEALTH_SAFETY, /^## 6\. /);

  it('the stop rules are HEALTH_SAFETY.md section 6, with the quoted 111 line (HS-28, C77)', () => {
    expect(exerciseSection).toContain(move.safety.stopRules.body);
    expect(exerciseSection).toContain(`"${move.safety.stopRules.emergency}"`);
  });

  it('the beach prompts are the six HEALTH_SAFETY.md section 6 bullets, in order, their source links aside (HS-12)', () => {
    const withoutLinks = exerciseSection.replace(/ \(\[[^\]]+\]\([^)]+\)\)/g, '');
    // The bullet list right under the "**Beach prompts" line.
    const list = /\*\*Beach prompts[^\n]*\n((?:- [^\n]*\n)+)/.exec(withoutLinks)?.[1] ?? '';
    const bullets = list.trimEnd().split('\n');
    expect(bullets).toHaveLength(6);
    expect(move.safety.beachPrompts.items).toHaveLength(bullets.length);
    move.safety.beachPrompts.items.forEach((item, i) => {
      expect(bullets[i]).toContain(item.replace(/\.$/, ''));
    });
  });

  it('the over-24-hours line is the HEALTH_SAFETY.md section 3 quote, then "It is fine to eat now" (ruling 9)', () => {
    expect(move.preCheck.overCeiling).toBe(
      `${quoteAfter(fastingSection, 'If a running fast passes 24 hours') ?? ''} It's fine to eat now.`,
    );
  });
});

describe('fasting copy matches the docs word for word (item 15)', () => {
  it('the over-24 warning, the stop-sign action and the alcohol note are the HEALTH_SAFETY.md section 3 quotes', () => {
    expect(quoteAfter(fastingSection, 'shows:')).toBe(fasting.card.overCeiling);
    expect(quoteAfter(fastingSection, 'severe weakness.')).toBe(fasting.stopSigns.action);
    expect(quoteAfter(fastingSection, 'shows a neutral note:')).toBe(fasting.alcoholNote);
  });

  it('the widen line and the Today status line are the UX_SCREENS.md section 2 quotes', () => {
    expect(quoteAfter(today, 'If protein or energy is short:')).toBe(fasting.mealCheck.widen);
    const status = `${fillTemplate(fasting.status.fasting, { duration: '14 h 20 m' })} ${fillTemplate(
      fasting.status.snackOpens,
      { time: '5:00 pm' },
    )}`;
    expect(quoteAfter(today, 'one-line status such as')).toBe(status);
  });

  it('the reflux GP line is the reviewed required sentence', () => {
    expect(REQUIRED_COPY).toContain(reflux.gpLine);
  });

  it("the fasting pharmacist line is item 13's schedule sentence, one wording (C07)", () => {
    expect(fasting.pharmacist).toBe(schedule.pharmacistNote);
  });
});

describe('Diet and targets copy matches the docs word for word (item 21)', () => {
  const nutritionSection = section(HEALTH_SAFETY, /^## 4\. /);

  it('the diet-mode names are UX_SCREENS.md screen 3a, in order (C-3)', () => {
    expect(UX_SCREENS).toContain(`(${Object.values(targets.dietMode.names).join(' / ')})`);
  });

  it('"the floor is a safety net, not a target" is HEALTH_SAFETY.md section 4', () => {
    expect(nutritionSection).toContain('the floor is a safety net, not a target');
    expect(targets.energy.floorBinds).toContain('The floor is a safety net, not a target.');
  });
});
