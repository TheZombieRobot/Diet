/**
 * Runs in the Pages workflow's build job before anything is built for publishing: refuses while
 * health.ts holds wording that awaits the owner's confirmation (cross-item ruling 8; see
 * wordingHold.ts). Reads one local file and contacts nothing.
 *
 * Usage: node tools/release/wording-hold.ts [file]
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HEALTH_COPY_PATH, heldWordingLines } from './wordingHold.ts';

const file = process.argv[2] ?? join(import.meta.dirname, '../..', HEALTH_COPY_PATH);
const held = heldWordingLines(readFileSync(file, 'utf8'));
if (held.length > 0) {
  process.stderr.write(
    `Not published. ${HEALTH_COPY_PATH} still marks wording as awaiting the owner's confirmation ` +
      `at the week-1 review (STOP 17), on line ${held.join(', ')}. Under cross-item ruling 8 ` +
      'nothing carrying it is published until the owner confirms it; the commit that records the ' +
      'confirmation removes the markers.\n',
  );
  process.exit(1);
}
process.stdout.write(`ok: no wording in ${HEALTH_COPY_PATH} awaits the owner's confirmation\n`);
