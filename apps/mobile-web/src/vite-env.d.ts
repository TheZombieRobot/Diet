/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

/** The app version from package.json, replaced at build time (vite.config.ts). */
declare const __APP_VERSION__: string;
/** The build label from DIET_BUILD_ID, or an empty string, replaced at build time. */
declare const __APP_BUILD__: string;
/** The relay origin this build sends to, or null (item 31; vite.config.ts, buildRelayOrigin). */
declare const __RELAY_ORIGIN__: string | null;
