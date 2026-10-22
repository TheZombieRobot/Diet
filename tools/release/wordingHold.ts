/**
 * Wording held back from publishing until the owner confirms it (cross-item ruling 8; item 28
 * A49; DOC_REVIEW C58). A string in health.ts that waits for the owner's confirmation carries a
 * comment containing WORDING_HOLD_MARKER (for example "// C58: wording awaits owner confirmation
 * at the week-1 review"). The Pages workflow's build job runs wording-hold.ts before it builds
 * anything, and it refuses while any such comment remains, so neither a "[deploy]" push nor a run
 * started by hand can publish the wording. The commit that records the owner's confirmation
 * (STOP 17) removes the markers, which lifts the hold.
 */

/** The words every hold comment contains. */
export const WORDING_HOLD_MARKER = 'wording awaits owner confirmation';

/** Where all user-visible health text lives (and so where held wording is marked). */
export const HEALTH_COPY_PATH = 'packages/core/src/copy/health.ts';

/** The 1-based numbers of the comment lines in `source` that hold wording back. */
export function heldWordingLines(source: string): number[] {
  return source
    .split('\n')
    .flatMap((line, i) =>
      /^\s*(?:\/\/|\/?\*)/.test(line) && line.includes(WORDING_HOLD_MARKER) ? [i + 1] : [],
    );
}
