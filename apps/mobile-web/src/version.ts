/** Set at build time from package.json (vite.config.ts `define`). */
export const APP_VERSION: string = __APP_VERSION__;

/** An optional build label (the deploy sets the commit; browser tests set their own). */
export const APP_BUILD: string = __APP_BUILD__;

/** "0.1.0", or "0.1.0, build abc1234" when the build has a label. */
export const versionLabel = (version: string = APP_VERSION, build: string = APP_BUILD): string =>
  build === '' ? version : `${version}, build ${build}`;
