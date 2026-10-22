/**
 * Writes docs/COVERAGE.md: every HS-xx and NN-xx rule with the tests whose titles name it (see
 * ruleCoverage.ts). Exits non-zero, after writing, when a rule that is built has no test naming it
 * or a title names an ID that is not a rule. Reads local files only and contacts nothing.
 *
 * Usage: pnpm coverage:table
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { COVERAGE_PATH, renderCoverage, repoCoverage } from './ruleCoverage.ts';

const root = join(import.meta.dirname, '../..');
const result = repoCoverage(root);
writeFileSync(join(root, COVERAGE_PATH), renderCoverage(result));
const mapped = result.rules.filter((r) => r.titles.length > 0).length;
process.stdout.write(`wrote ${COVERAGE_PATH}: ${result.rules.length} rules, ${mapped} named\n`);
if (result.unmapped.length > 0 || result.unknown.length > 0) {
  if (result.unmapped.length > 0) {
    process.stderr.write(`No test names: ${result.unmapped.join(', ')}\n`);
  }
  if (result.unknown.length > 0) {
    process.stderr.write(`Titles name IDs that are not rules: ${result.unknown.join(', ')}\n`);
  }
  process.exit(1);
}
