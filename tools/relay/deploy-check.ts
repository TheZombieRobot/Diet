/**
 * Runs before every deploy (`pnpm relay:deploy-test`, `pnpm relay:deploy`): refuses to go on while
 * services/relay/wrangler.jsonc fails a check or the deployment's storage id is still the
 * placeholder. Reads one local file and contacts nothing.
 *
 * Usage: node tools/relay/deploy-check.ts <production | test>
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { deployProblems, WRANGLER_CONFIG_PATH, type Deployment } from './wranglerConfig.ts';

const deployment = process.argv[2];
if (deployment !== 'production' && deployment !== 'test') {
  process.stderr.write('Usage: node tools/relay/deploy-check.ts <production | test>\n');
  process.exit(1);
}

const root = join(import.meta.dirname, '../..');
const problems = deployProblems(
  readFileSync(join(root, WRANGLER_CONFIG_PATH), 'utf8'),
  deployment satisfies Deployment,
);
if (problems.length > 0) {
  process.stderr.write(
    `Not put online. ${WRANGLER_CONFIG_PATH} is not ready:\n${problems.map((p) => `- ${p}\n`).join('')}` +
      'If you are following the README, stop here and paste these lines into chat.\n',
  );
  process.exit(1);
}
process.stdout.write(`ok: ${WRANGLER_CONFIG_PATH} is ready for the ${deployment} relay\n`);
