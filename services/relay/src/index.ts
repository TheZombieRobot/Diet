/** @diet/relay: Blind relay that briefly holds encrypted grocery lists. Built at checklist item 29; it never decrypts anything. */
export const PACKAGE_NAME = '@diet/relay' as const;

export { isAllowedClientOrigin, parseRelayConfig, type RelayConfig, type RelayEnv } from './config';
export {
  createRelayHandler,
  RELAY_ERROR_CODES,
  type RelayErrorCode,
  type RelayHandler,
  type RelayHandlerDeps,
  type RelayRequest,
} from './handler';
export { type KvSubset, type RateLimiterSubset } from './kv';
