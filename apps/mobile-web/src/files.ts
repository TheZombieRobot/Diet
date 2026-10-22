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

/** The types of the files the app offers: backups (JSON), and item 23's GP summary (text or CSV). */
export type DownloadType =
  'application/json' | 'text/plain;charset=utf-8' | 'text/csv;charset=utf-8';

/** Offers `text` as a file named `fileName` (JSON unless given), then revokes the URL after 60 s. */
export function offerDownload(
  text: string,
  fileName: string,
  doc: Document = document,
  type: DownloadType = 'application/json',
): void {
  const url = trackedObjectUrl(new Blob([text], { type }));
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
