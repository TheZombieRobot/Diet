/**
 * The Worker's entry point (wrangler.jsonc `main`). The clock is the runtime's own, and loopback
 * origins are never allowed here (design R10).
 */
import { createRelayHandler } from './handler';

const handleRelayRequest = createRelayHandler({
  now: () => Date.now(),
  allowLoopbackOrigins: false,
});

export default { fetch: handleRelayRequest };
