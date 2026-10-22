import { APP_VERSION } from './appVersion';

/**
 * An optional build label (the deploy sets the commit; browser tests set their own). Only About
 * imports this module, so the label is in the entry chunk alone and a new label changes no other
 * file of the build (vite.config.ts, sharedWithLazyScreens; e2e/update.spec.ts).
 */
export const APP_BUILD: string = __APP_BUILD__;

/** "0.1.0", or "0.1.0, build abc1234" when the build has a label. */
export const versionLabel = (version: string = APP_VERSION, build: string = APP_BUILD): string =>
  build === '' ? version : `${version}, build ${build}`;
