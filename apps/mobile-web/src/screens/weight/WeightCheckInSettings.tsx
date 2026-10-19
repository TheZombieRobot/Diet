import {
  fillTemplate,
  RAPID_LOSS_THRESHOLD_G_PER_WEEK,
  RAPID_LOSS_WEEKS,
  rapidLossSettingsInUse,
  type SettingsRecord,
} from '@diet/core';
import { weight } from '@diet/core/copy/health';
import { Button, Card, ChoiceList } from '@diet/ui';
import { useState, type ReactElement } from 'react';
import { useLiveQuery } from '../../db/liveQuery';
import { appStorageStore, type AppStorage } from '../../db/runtime';
import { useStore } from '../../store';
import { WriteFailure } from './parts';
import type { WeightStatusMessage } from './stores';
import { weightWriteMessage } from './writeErrors';

const copy = weight.rapidLossSettings;

/** 750, 800, … 1000 g a week: only ever as sensitive as the default or more (C46). */
const THRESHOLDS: readonly number[] = Array.from(
  {
    length:
      (RAPID_LOSS_THRESHOLD_G_PER_WEEK.max - RAPID_LOSS_THRESHOLD_G_PER_WEEK.min) /
        RAPID_LOSS_THRESHOLD_G_PER_WEEK.step +
      1,
  },
  (_, i) => RAPID_LOSS_THRESHOLD_G_PER_WEEK.min + i * RAPID_LOSS_THRESHOLD_G_PER_WEEK.step,
);

const readSettings = (storage: AppStorage): Promise<SettingsRecord> => storage.repos.settings.get();

function Body({ storage }: { storage: AppStorage }): ReactElement | null {
  const settings = useLiveQuery(storage, readSettings);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [failure, setFailure] = useState<WeightStatusMessage | null>(null);
  if (settings === undefined) return null;
  const inUse = rapidLossSettingsInUse(settings);

  // Each caller writes its own literal patch, so the first-run guard's scan (K18) can read it.
  const write = (save: () => Promise<unknown>) => {
    setStatus(null);
    setFailure(null);
    save().then(
      () => {
        setStatus(copy.saved);
      },
      (error: unknown) => {
        setFailure(weightWriteMessage(error, 'settings'));
      },
    );
  };

  return (
    <Card label={copy.label}>
      <p>{copy.explain1}</p>
      {open ? (
        <>
          <p>{copy.explain2}</p>
          <p>{copy.explain3}</p>
          {settings.rapidLossExplanationReadAt === null ? (
            <Button
              variant="primary"
              onClick={() => {
                write(() =>
                  storage.repos.settings.update({ rapidLossExplanationReadAt: storage.env.now() }),
                );
              }}
            >
              {copy.readIt}
            </Button>
          ) : (
            <>
              <ChoiceList
                legend={copy.thresholdLabel}
                name="rapid-loss-threshold"
                options={THRESHOLDS.map((g) => ({
                  value: String(g),
                  label: fillTemplate(copy.thresholdOption, { kg: String(g / 1000) }),
                }))}
                value={String(inUse.thresholdGPerWeek)}
                onChange={(value) => {
                  write(() =>
                    storage.repos.settings.update({ rapidLossThresholdGPerWeek: Number(value) }),
                  );
                }}
              />
              <ChoiceList
                legend={copy.weeksLabel}
                name="rapid-loss-weeks"
                options={RAPID_LOSS_WEEKS.values.map((n) => ({
                  value: String(n),
                  label: fillTemplate(copy.weeksOption, { n }),
                }))}
                value={String(inUse.weeks)}
                onChange={(value) => {
                  write(() =>
                    storage.repos.settings.update({
                      rapidLossConsecutiveWeeks: value === '2' ? 2 : 3,
                    }),
                  );
                }}
              />
              <Button
                onClick={() => {
                  write(() =>
                    storage.repos.settings.update({
                      rapidLossThresholdGPerWeek: RAPID_LOSS_THRESHOLD_G_PER_WEEK.default,
                      rapidLossConsecutiveWeeks: RAPID_LOSS_WEEKS.default,
                    }),
                  );
                }}
              >
                {copy.reset}
              </Button>
            </>
          )}
          <p role="status" className="ui-status-line">
            {status}
          </p>
          <div role="alert" className="ui-status-line">
            {failure === null ? null : <WriteFailure storage={storage} message={failure} />}
          </div>
          <Button
            variant="quiet"
            onClick={() => {
              setOpen(false);
              setStatus(null);
            }}
          >
            {copy.close}
          </Button>
        </>
      ) : (
        <Button
          variant="quiet"
          onClick={() => {
            setOpen(true);
          }}
        >
          {settings.rapidLossExplanationReadAt === null ? copy.open : copy.openAfterRead}
        </Button>
      )}
    </Card>
  );
}

/**
 * The Weight check-in card in Settings (C46, HS-11; item 14 design section 2.7): collapsed to a
 * line with no figure; the options appear only after "I have read this", and only ever make the
 * check-in card more sensitive. There is no off switch.
 */
export function WeightCheckInSettings(): ReactElement | null {
  const storage = useStore(appStorageStore);
  return storage === null ? null : <Body storage={storage} />;
}
