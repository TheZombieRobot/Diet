/**
 * Files the app hands to the person: object URLs and downloads (storage spec sections 10.5 step 5
 * and 11 step 5). A download is a Blob, an object URL and a click on an <a download> link, which
 * needs no network (HS-14). Every object URL the app makes is tracked, so delete-all can revoke
 * them all (a pending download, and later the garden photo thumbnails).
 */

const created = new Set<string>();

/** URL.createObjectURL, remembered so delete-all can revoke it. */
export function trackedObjectUrl(blob: Blob): string {
  const url = URL.createObjectURL(blob);
  created.add(url);
  return url;
}

export function revokeTrackedObjectUrl(url: string): void {
  URL.revokeObjectURL(url);
  created.delete(url);
}

/** Revokes every object URL the app created (delete-all step 5). */
export function revokeAllObjectUrls(): void {
  for (const url of [...created]) revokeTrackedObjectUrl(url);
}

/** How long a download link stays usable after the click. */
export const DOWNLOAD_URL_LIFETIME_MS = 60_000;

/** The MIME type for a file the app offers, from its name (item 24: the grocery list's CSV). */
export function downloadTypeFor(fileName: string): string {
  if (fileName.endsWith('.csv')) return 'text/csv;charset=utf-8';
  if (fileName.endsWith('.txt')) return 'text/plain;charset=utf-8';
  return 'application/json';
}

/** Offers `text` as a file named `fileName` (typed by downloadTypeFor), then revokes the URL after 60 s. */
export function offerDownload(text: string, fileName: string, doc: Document = document): void {
  const url = trackedObjectUrl(new Blob([text], { type: downloadTypeFor(fileName) }));
  const link = doc.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  link.hidden = true;
  doc.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => {
    revokeTrackedObjectUrl(url);
  }, DOWNLOAD_URL_LIFETIME_MS);
}
