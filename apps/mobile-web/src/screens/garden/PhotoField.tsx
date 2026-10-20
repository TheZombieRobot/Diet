import { fillTemplate } from '@diet/core';
import { gardenScreen } from '@diet/core/copy/health';
import { Button, ButtonRow, CameraIcon, Notice, Thumbnail } from '@diet/ui';
import { type ReactElement, useId, useRef, useState } from 'react';
import { StorageRuleError } from '../../db/errors';
import { removePhoto, savePhoto, usePhotoUrl } from '../../garden/photoStore';
import { type PhotoErrorCode, type PhotoPlatform, preparePhoto } from '../../garden/preparePhoto';
import { type InventoryContext, type WriteProblem, writeProblemOf } from './inventory';
import { WriteProblemNotice } from './parts';

const copy = gardenScreen.photo;

const isPhotoRule = (error: unknown): boolean =>
  error instanceof StorageRuleError &&
  (error.rule === 'photo-format' || error.rule === 'photo-metadata' || error.rule === 'photo-size');

/**
 * A saved crop's photo (design 1.8; HEALTH_SAFETY section 7; G3 to G7, G27): one photo per crop,
 * kept on this phone only, prepared on the phone and saved on its own, outside the crop form.
 * The file chooser has no `capture`, so Android offers the camera or the gallery and the app asks
 * for no camera permission. A photo that finishes after the records closed (delete-all or a
 * restore, here or in another tab) is dropped.
 */
export function PhotoField({
  ctx,
  gardenId,
  cropName,
  platform,
  waitForForm,
  onStatus,
}: {
  readonly ctx: InventoryContext;
  readonly gardenId: string;
  readonly cropName: string;
  readonly platform: PhotoPlatform;
  /** The crop form has unsaved changes: opening the camera could lose them on a low-memory phone. */
  readonly waitForForm: boolean;
  readonly onStatus: (text: string) => void;
}): ReactElement {
  const { storage } = ctx;
  const url = usePhotoUrl(storage, gardenId);
  const headingId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [preparing, setPreparing] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [failure, setFailure] = useState<PhotoErrorCode | null>(null);
  const [problem, setProblem] = useState<WriteProblem | null>(null);
  const busy = preparing || waitForForm || ctx.closed;

  const chosen = async (file: File) => {
    setFailure(null);
    setProblem(null);
    setPreparing(true);
    try {
      const prepared = await preparePhoto(file, platform, storage.env.now);
      // Delete-all or a restore closed the records meanwhile: the screen says so; nothing is kept.
      if (!storage.gate.isOpen()) return;
      if (!prepared.ok) {
        setFailure(prepared.code);
        return;
      }
      await savePhoto(storage, gardenId, prepared.photo);
      onStatus(copy.kept);
    } catch (failed) {
      if (isPhotoRule(failed)) setFailure('not-cleaned');
      else setProblem(writeProblemOf(failed));
    } finally {
      setPreparing(false);
    }
  };

  const remove = async () => {
    setFailure(null);
    setProblem(null);
    try {
      await removePhoto(storage, gardenId);
      setConfirmRemove(false);
      onStatus(copy.removed);
    } catch (failed) {
      setProblem(writeProblemOf(failed));
    }
  };

  const pick = () => {
    setFailure(null);
    setProblem(null);
    input.current?.click();
  };

  return (
    <section className="ui-card__body" aria-labelledby={headingId}>
      <h4 id={headingId}>{copy.legend}</h4>
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        data-testid="garden-photo-file"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (file !== undefined) void chosen(file);
        }}
      />
      {url === null ? null : (
        <Thumbnail src={url} alt={fillTemplate(copy.alt, { crop: cropName })} size="large" />
      )}
      {confirmRemove ? (
        <Notice
          actions={
            <ButtonRow>
              <Button variant="caution" disabled={ctx.closed} onClick={() => void remove()}>
                {copy.removeYes}
              </Button>
              <Button
                onClick={() => {
                  setConfirmRemove(false);
                }}
              >
                {copy.removeNo}
              </Button>
            </ButtonRow>
          }
        >
          <p>{copy.removeConfirm}</p>
        </Notice>
      ) : url === null ? (
        <Button disabled={busy} onClick={pick}>
          <CameraIcon />
          {copy.add}
        </Button>
      ) : (
        <ButtonRow>
          <Button disabled={busy} onClick={pick}>
            {copy.replace}
          </Button>
          <Button
            variant="caution"
            disabled={busy}
            onClick={() => {
              setConfirmRemove(true);
            }}
          >
            {copy.remove}
          </Button>
        </ButtonRow>
      )}
      {preparing ? (
        <p className="ui-progress" role="status">
          <span className="ui-spinner" aria-hidden="true" />
          {copy.preparing}
        </p>
      ) : null}
      {waitForForm ? <p className="ui-text-muted">{copy.saveFirst}</p> : null}
      {failure === null ? null : (
        <Notice role="alert">
          <p>{copy.errors[failure]}</p>
        </Notice>
      )}
      <WriteProblemNotice problem={problem} />
      <p className="ui-text-muted">{copy.note}</p>
      <p className="ui-text-muted">{copy.savesAlone}</p>
    </section>
  );
}
