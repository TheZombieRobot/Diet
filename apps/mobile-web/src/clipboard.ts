/**
 * Copying text to the phone's clipboard (item 24 design 1.11; item 31 L38: one helper for the
 * list's Copy text and item 31's Copy code). The browser's clipboard API only: no fallback through
 * execCommand and no network (HS-14). True when the text was copied.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  const clipboard = typeof navigator === 'undefined' ? undefined : navigator.clipboard;
  if (typeof clipboard?.writeText !== 'function') return false;
  try {
    await clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
