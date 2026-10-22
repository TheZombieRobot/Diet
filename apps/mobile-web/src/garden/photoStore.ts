/**
 * The garden photos, for the garden screen (item 19 design 1.8 and section 3; HEALTH_SAFETY
 * section 7; C49; G7, G27). The only app file outside db/ that reaches the photo store (the
 * device-only scan in tools/scans/rules.ts enforces it): photos stay on this phone and never go
 * into a backup, a list or anything the app sends.
 *
 * Thumbnails are the stored photo shown small. Every photo URL is tracked (files.ts), so delete-all
 * revokes it; it is replaced when the photo changes, revoked when the thumbnail goes away, and
 * never made once the write gate has closed (a restore or delete-all here or in another tab).
 */
import type { GardenPhotoRecord } from '@diet/core';
import { useMemo, useSyncExternalStore } from 'react';
import type { PhotoInput } from '../db/repos/gardenPhotos';
import { liveStore, useLiveQuery } from '../db/liveQuery';
import type { AppStorage } from '../db/runtime';
import { revokeTrackedObjectUrl, trackedObjectUrl } from '../files';

const readPhotoIds = (storage: AppStorage): Promise<ReadonlySet<string>> =>
  storage.repos.gardenPhotos.ids().then((ids) => new Set(ids));

/** The garden ids that have a photo (keys only: the list never loads bytes for rows without one). */
export function usePhotoIds(storage: AppStorage): ReadonlySet<string> | undefined {
  return useLiveQuery(storage, readPhotoIds);
}

interface UrlStore {
  readonly get: () => string | null;
  readonly subscribe: (listener: () => void) => () => void;
}

/**
 * An object URL for one crop's photo while something shows it: made from the live record, swapped
 * (the old one revoked) when the record changes or goes away, revoked when the last viewer leaves.
 */
function photoUrlStore(storage: AppStorage, gardenId: string): UrlStore {
  const records = liveStore(() => storage.repos.gardenPhotos.get(gardenId), storage.gate);
  let url: string | null = null;
  let shown: GardenPhotoRecord | undefined;
  const release = () => {
    if (url !== null) revokeTrackedObjectUrl(url);
    url = null;
    shown = undefined;
  };
  const refresh = () => {
    const record = records.get();
    if (record === shown) return;
    release();
    if (record === undefined || !storage.gate.isOpen()) return;
    shown = record;
    url = trackedObjectUrl(new Blob([record.bytes], { type: record.mimeType }));
  };
  return {
    get: () => url,
    subscribe: (listener) => {
      const stop = records.subscribe(() => {
        refresh();
        listener();
      });
      return () => {
        stop();
        release();
      };
    },
  };
}

/** The URL of a crop's stored photo, or null while there is none (or it is still being read). */
export function usePhotoUrl(storage: AppStorage, gardenId: string): string | null {
  const store = useMemo(() => photoUrlStore(storage, gardenId), [storage, gardenId]);
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

/** Keeps a prepared photo for a saved crop, replacing any earlier one. */
export function savePhoto(
  storage: AppStorage,
  gardenId: string,
  photo: PhotoInput,
): Promise<GardenPhotoRecord> {
  return storage.repos.gardenPhotos.put(gardenId, photo);
}

/** Removes a crop's photo. Photos are not in backups, so it cannot be brought back. */
export function removePhoto(storage: AppStorage, gardenId: string): Promise<void> {
  return storage.repos.gardenPhotos.remove(gardenId);
}
