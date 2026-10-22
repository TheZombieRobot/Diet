import { isRelayOrigin } from '@diet/core';

/**
 * The only origin the phone ever builds a relay address from (checklist item 31 design 1.9; the
 * item-30/31 transfer contract, section 3.5): RELAY_ORIGIN, or the reserved test origin in a
 * browser-test build (vite.config.ts, buildRelayOrigin). Null while the owner has not confirmed
 * the relay's address: Send to laptop then makes a paste code and the phone contacts nothing.
 */
export const BUILD_RELAY_ORIGIN: string | null = isRelayOrigin(__RELAY_ORIGIN__)
  ? __RELAY_ORIGIN__
  : null;
