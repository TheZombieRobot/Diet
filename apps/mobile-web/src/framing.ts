/**
 * The app refuses to run inside a frame on another page (item 5 review). A meta Content Security
 * Policy cannot say frame-ancestors and GitHub Pages cannot send headers, so the check is here: a
 * framing page could otherwise lay its own content over the app's buttons.
 */
export const FRAMED_MESSAGE = 'Open this app directly at its own address.';

/** True when the page is inside a frame (or the browser will not say, which counts as framed). */
export function isFramed(win: { readonly top: unknown; readonly self: unknown } = window): boolean {
  try {
    return win.top !== win.self;
  } catch {
    return true;
  }
}

/** Shows only the plain message: no app, no controls, nothing registered or stored. */
export function refuseToRunFramed(container: HTMLElement): void {
  container.textContent = FRAMED_MESSAGE;
}
