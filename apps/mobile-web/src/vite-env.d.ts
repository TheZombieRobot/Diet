/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

/** The app version from package.json, replaced at build time (vite.config.ts). */
declare const __APP_VERSION__: string;
/** The build label from DIET_BUILD_ID, or an empty string, replaced at build time. */
declare const __APP_BUILD__: string;
