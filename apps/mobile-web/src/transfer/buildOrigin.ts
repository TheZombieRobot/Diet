/**
 * The relay origin a build sends to, and its place in the page's policy (checklist item 31 design
 * 1.9; C81, L10). Read by vite.config.ts, so it has no globals and imports core by a relative path
 * (the config loader bundles relative imports, but hands package names to Node, which cannot load
 * .ts). RELAY_ORIGIN stays the one place the real address lives; a browser-test build may use
 * only the reserved RELAY_E2E_ORIGIN, so no build can be pointed at a real host through the
 * environment.
 */
import {
  isRelayOrigin,
  RELAY_E2E_ORIGIN,
  RELAY_ORIGIN,
} from '../../../../packages/core/src/relay/protocol';

export const TEST_RELAY_ENV = 'DIET_TEST_RELAY_ORIGIN';

/** RELAY_ORIGIN, or the reserved test origin when a browser-test build asks for it. */
export function buildRelayOrigin(testValue: string | undefined): string | null {
  if (testValue === undefined || testValue === '') return RELAY_ORIGIN;
  if (testValue !== RELAY_E2E_ORIGIN) {
    throw new Error(`${TEST_RELAY_ENV} may only be ${RELAY_E2E_ORIGIN}`);
  }
  return RELAY_E2E_ORIGIN;
}

const CONNECT_SRC = "connect-src 'self';";

/** index.html with "connect-src 'self';" widened by `origin`, or unchanged for null. */
export function withRelayConnectSrc(html: string, origin: string | null): string {
  if (html.split(CONNECT_SRC).length !== 2) {
    throw new Error('index.html must hold exactly one connect-src directive');
  }
  if (origin === null) return html;
  if (!isRelayOrigin(origin)) throw new Error('The relay origin is not a plain https origin');
  return html.replace(CONNECT_SRC, `connect-src 'self' ${origin};`);
}
