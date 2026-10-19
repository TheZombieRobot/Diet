/**
 * The checks on services/relay/wrangler.jsonc (checklist item 29; design sections 1.10 and S3).
 * CI runs them on every push (tools/scans/relay.test.ts), and the owner's deploy commands run them
 * first (tools/relay/deploy-check.ts), so a deploy is refused while a check fails or while the
 * storage id of that deployment is still the placeholder.
 *
 * Runs with Node's type stripping, so it imports only `node:` modules and the relay protocol by a
 * relative `.ts` path, like tools/icons/render-icons.ts.
 */
import {
  APP_ORIGIN,
  RELAY_TEST_TTL_SECONDS,
  RELAY_TTL_SECONDS,
} from '../../packages/core/src/relay/protocol.ts';

export const WRANGLER_CONFIG_PATH = 'services/relay/wrangler.jsonc';
export type Deployment = 'production' | 'test';

/**
 * Committed until the owner creates the storage (README, The relay, step 4) and the ids are
 * added. An id must never be left out instead: wrangler would then create unnamed storage by itself.
 */
export const KV_ID_PLACEHOLDERS: Readonly<Record<Deployment, string>> = Object.freeze({
  production: 'OWNER-FILLS-IN-production-storage-id',
  test: 'OWNER-FILLS-IN-test-storage-id',
});
const KV_ID = /^[0-9a-f]{32}$/;

/** Every key a deployment may have. No routes, domains, flags or other bindings (design 1.10). */
const DEPLOYMENT_KEYS = [
  'name',
  'workers_dev',
  'preview_urls',
  'upload_source_maps',
  'logpush',
  'observability',
  'tail_consumers',
  'vars',
  'kv_namespaces',
  'ratelimits',
];
const TOP_LEVEL_KEYS = [...DEPLOYMENT_KEYS, 'main', 'compatibility_date', 'send_metrics', 'env'];
const LOGGING_OFF = { enabled: false, logs: { enabled: false, invocation_logs: false } };
const RATE_LIMITS: Readonly<Record<Deployment, unknown>> = {
  production: [
    { name: 'RELAY_WRITE_LIMIT', namespace_id: '2901', simple: { limit: 10, period: 60 } },
    { name: 'RELAY_READ_LIMIT', namespace_id: '2902', simple: { limit: 60, period: 60 } },
  ],
  test: [
    { name: 'RELAY_WRITE_LIMIT', namespace_id: '2903', simple: { limit: 10, period: 60 } },
    { name: 'RELAY_READ_LIMIT', namespace_id: '2904', simple: { limit: 60, period: 60 } },
  ],
};
const EXPECTED: Readonly<Record<Deployment, { name: string; ttl: string }>> = {
  production: { name: 'list-relay', ttl: String(RELAY_TTL_SECONDS) },
  test: { name: 'list-relay-test', ttl: String(RELAY_TEST_TTL_SECONDS) },
};

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const sorted = (keys: readonly string[]) => [...keys].sort().join(', ');

/** The settings of one deployment: the top level, or `env.test`. */
export function deploymentOf(config: Json, deployment: Deployment): Json {
  const env = isObject(config['env']) ? config['env'] : {};
  const test = env['test'];
  return deployment === 'production' ? config : isObject(test) ? test : {};
}

/** The storage id of one deployment, or undefined when it has none. */
export function kvIdOf(config: Json, deployment: Deployment): unknown {
  const kv = deploymentOf(config, deployment)['kv_namespaces'];
  return Array.isArray(kv) && isObject(kv[0]) ? kv[0]['id'] : undefined;
}

function deploymentProblems(config: Json, deployment: Deployment): string[] {
  const settings = deploymentOf(config, deployment);
  const where = deployment === 'production' ? 'top level' : 'env.test';
  const problems: string[] = [];
  const keys = deployment === 'production' ? TOP_LEVEL_KEYS : DEPLOYMENT_KEYS;
  if (sorted(Object.keys(settings)) !== sorted(keys)) {
    problems.push(`${where}: the keys must be exactly ${sorted(keys)}`);
  }
  if (settings['name'] !== EXPECTED[deployment].name) {
    problems.push(`${where}: name must be ${EXPECTED[deployment].name}`);
  }
  // Logs, log push, tail workers and source uploads stay off; workers.dev only (R13, R15).
  const fixed: Json = {
    workers_dev: true,
    preview_urls: false,
    upload_source_maps: false,
    logpush: false,
    observability: LOGGING_OFF,
    tail_consumers: [],
  };
  for (const [key, value] of Object.entries(fixed)) {
    if (!same(settings[key], value))
      problems.push(`${where}: ${key} must be ${JSON.stringify(value)}`);
  }
  // The allowlist is exactly the app's origin in both deployments, so no other site can use the
  // relay from a browser. Item 32 adds the extension's origin here and in wrangler.jsonc together.
  const vars = settings['vars'];
  if (
    !isObject(vars) ||
    sorted(Object.keys(vars)) !== 'ALLOWED_ORIGINS, RELAY_TTL_SECONDS' ||
    vars['RELAY_TTL_SECONDS'] !== EXPECTED[deployment].ttl ||
    vars['ALLOWED_ORIGINS'] !== APP_ORIGIN
  ) {
    problems.push(
      `${where}: vars must be exactly RELAY_TTL_SECONDS "${EXPECTED[deployment].ttl}" and ALLOWED_ORIGINS "${APP_ORIGIN}"`,
    );
  }
  const kv = settings['kv_namespaces'];
  const id = kvIdOf(config, deployment);
  if (
    !Array.isArray(kv) ||
    kv.length !== 1 ||
    !isObject(kv[0]) ||
    sorted(Object.keys(kv[0])) !== 'binding, id' ||
    kv[0]['binding'] !== 'RELAY_KV' ||
    !(id === KV_ID_PLACEHOLDERS[deployment] || (typeof id === 'string' && KV_ID.test(id)))
  ) {
    problems.push(
      `${where}: kv_namespaces must be one RELAY_KV binding whose id is 32 lower-case hex characters or "${KV_ID_PLACEHOLDERS[deployment]}"`,
    );
  }
  if (
    settings['ratelimits'] !== undefined &&
    !same(settings['ratelimits'], RATE_LIMITS[deployment])
  ) {
    problems.push(`${where}: ratelimits must be as in the relay design (section 1.10)`);
  }
  return problems;
}

/** Everything wrong with the committed config, as plain sentences; none means it may be committed. */
export function wranglerConfigProblems(text: string): string[] {
  let config: unknown;
  try {
    config = JSON.parse(text);
  } catch {
    return ['it must be plain JSON: no comments and no trailing commas'];
  }
  if (!isObject(config)) return ['it must be a JSON object'];
  const problems: string[] = [];
  if (config['send_metrics'] !== false) problems.push('send_metrics must be false');
  if (config['main'] !== 'src/worker.ts') problems.push('main must be src/worker.ts');
  if (typeof config['compatibility_date'] !== 'string')
    problems.push('compatibility_date is missing');
  if (!isObject(config['env']) || sorted(Object.keys(config['env'])) !== 'test') {
    problems.push('env must hold exactly one deployment, test');
  }
  problems.push(...deploymentProblems(config, 'production'), ...deploymentProblems(config, 'test'));
  if (
    (deploymentOf(config, 'production')['ratelimits'] === undefined) !==
    (deploymentOf(config, 'test')['ratelimits'] === undefined)
  ) {
    problems.push('ratelimits must be in both deployments or in neither');
  }
  if (kvIdOf(config, 'production') === kvIdOf(config, 'test')) {
    problems.push('the two deployments must use different storage');
  }
  return problems;
}

/** Why one deployment may not be put online now; none means it may. */
export function deployProblems(text: string, deployment: Deployment): string[] {
  const problems = wranglerConfigProblems(text);
  if (problems.length > 0) return problems;
  const id = kvIdOf(JSON.parse(text) as Json, deployment);
  return typeof id === 'string' && KV_ID.test(id)
    ? []
    : [`the ${deployment} storage id is not filled in yet (README, The relay, step 4)`];
}
