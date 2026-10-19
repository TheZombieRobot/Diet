// K18 (item 13 design section 7.2; E40, E62): the acknowledgement, the completion time and the
// readiness answers are written only by the first-run actions (and the test kit). A second line
// behind the settings repository's own guard.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(import.meta.dirname, '..');
const ALLOWED = new Set(['onboarding/actions.ts', 'db/testKit.ts']);

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) && !/\.test\./.test(name) ? [path] : [];
  });
}

/** The argument text of each `settings.update(` call, by matching parentheses. */
function updateArguments(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(/\bsettings\.update\(/g)) {
    let depth = 1;
    let i = match.index + match[0].length;
    const start = i;
    while (i < text.length && depth > 0) {
      if (text[i] === '(') depth += 1;
      if (text[i] === ')') depth -= 1;
      i += 1;
    }
    found.push(text.slice(start, i - 1).trim());
  }
  return found;
}

describe('only the first-run actions write the setup markers and answers (K18)', () => {
  const files = sources(SRC)
    .map((path) => ({
      path: relative(SRC, path).replaceAll('\\', '/'),
      text: readFileSync(path, 'utf8'),
    }))
    .filter((f) => !ALLOWED.has(f.path));

  it('scans the app source', () => {
    expect(files.length).toBeGreaterThan(50);
    expect(files.some((f) => f.path === 'screens/backup/reminder.ts')).toBe(true);
  });

  it('every settings.update( patch elsewhere is an object literal without the acknowledgement or completion time', () => {
    const problems = files.flatMap((f) =>
      updateArguments(f.text).flatMap((arg) => {
        if (!/^\{[\s\S]*\}$/.test(arg) || /\.\.\./.test(arg)) return [`${f.path}: ${arg}`];
        return /\b(?:alcoholNoticeAckAt|onboardingCompletedAt)\s*:/.test(arg)
          ? [`${f.path}: ${arg}`]
          : [];
      }),
    );
    expect(problems).toEqual([]);
  });

  it('no file elsewhere calls readiness.answer(', () => {
    expect(files.filter((f) => /\breadiness\.answer\s*\(/.test(f.text)).map((f) => f.path)).toEqual(
      [],
    );
  });

  it('the check itself catches a variable patch, a spread and a completion time', () => {
    expect(updateArguments('repos.settings.update(patch)')).toEqual(['patch']);
    expect(updateArguments("settings.update({ ...x, theme: 'dark' })")).toEqual([
      "{ ...x, theme: 'dark' }",
    ]);
    expect(updateArguments('settings.update({ onboardingCompletedAt: now() })')).toEqual([
      '{ onboardingCompletedAt: now() }',
    ]);
  });
});
