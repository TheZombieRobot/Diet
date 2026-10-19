/**
 * Garden photos (storage spec sections 4.8 and 8.2; C49). Device only: never in a backup. A photo
 * for a garden row that does not exist is refused (section 5 rule 7); removing a garden row removes
 * its photo (repos/crud.ts). Item 19 downscales photos before calling put().
 */
import { type GardenPhotoRecord, StorageInvariantError } from '@diet/core';
import { prepare } from '../prepare';
import { guardedWrite, type RepoContext } from './context';

export type PhotoInput = Omit<GardenPhotoRecord, 'gardenId'>;

export interface GardenPhotosRepo {
  readonly get: (gardenId: string) => Promise<GardenPhotoRecord | undefined>;
  readonly put: (gardenId: string, photo: PhotoInput) => Promise<GardenPhotoRecord>;
  readonly remove: (gardenId: string) => Promise<void>;
}

export function gardenPhotosRepo(ctx: RepoContext): GardenPhotosRepo {
  const { db, env } = ctx;
  return {
    get: (gardenId) => db.garden_photos.get(gardenId),
    put: (gardenId, photo) =>
      guardedWrite(ctx, () => {
        const row = prepare('garden_photos', { ...photo, gardenId }, env);
        return db.transaction('rw', ['garden', 'garden_photos'], () =>
          db.garden.get(gardenId).then((garden) => {
            if (garden === undefined) throw new StorageInvariantError('garden-photo');
            return db.garden_photos.put(row).then(() => row);
          }),
        );
      }),
    remove: (gardenId) =>
      guardedWrite(ctx, () =>
        db.transaction('rw', ['garden_photos'], () => db.garden_photos.delete(gardenId)),
      ),
  };
}
