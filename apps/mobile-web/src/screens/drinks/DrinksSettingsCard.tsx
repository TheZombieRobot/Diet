/**
 * The Drinks card in Settings (UX 7; item 28 design 2.15; C21, C46; A25): when a new drinking day
 * starts, and, for a male profile only, which guidance figures apply. The options carry no
 * numbers; the guidance line for the set that now applies is shown under them, so the figures
 * always come with "No alcohol use is risk-free." Any other profile already has the women's
 * figures, the lower set, and sees why instead of a control. Hidden while drink logging is off.
 */
import { alcoholAccess, DRINKING_DAY_CUTOVER_MINUTES, guidanceFor } from '@diet/core';
import { alcohol } from '@diet/core/copy/health';
import { Card, ChoiceList, SelectField } from '@diet/ui';
import { type ReactElement, useId, useState } from 'react';
import { appStorageStore } from '../../db/runtime';
import { useReadinessGates } from '../../onboarding/state';
import { useStore } from '../../store';
import { WriteError } from '../today/WriteError';
import { cutoverText } from './drinksText';
import { useDrinksWrite } from './useDrinksWrite';

const s = alcohol.settings;
const g = alcohol.guidance;

const { min, max, step } = DRINKING_DAY_CUTOVER_MINUTES;
const CUTOVERS = Array.from({ length: (max - min) / step + 1 }, (_, i) => min + i * step);

export function DrinksSettingsCard(): ReactElement | null {
  const storage = useStore(appStorageStore);
  const gateView = useReadinessGates(storage);
  const write = useDrinksWrite();
  const name = useId();
  const [saved, setSaved] = useState(false);
  if (storage === null || gateView === undefined) return null;
  const { settings, profile } = gateView.state;
  const access = alcoholAccess({
    alcoholNoticeAckAt: settings.alcoholNoticeAckAt,
    gates: gateView.gates,
  });
  if (access !== 'open') return null;
  const guidance = guidanceFor(profile.sex, settings.alcoholGuidanceSet);
  /** Saves one setting; each patch is written out where it is made (writers.test.ts). */
  const save = (store: () => Promise<unknown>): void => {
    setSaved(false);
    void write.run(store).then((done) => {
      setSaved(done !== null);
    });
  };
  return (
    <Card label={s.cardLabel}>
      <SelectField
        label={s.cutoverLabel}
        hint={s.cutoverHint}
        value={String(settings.drinkingDayCutoverMinutes)}
        options={CUTOVERS.map((m) => ({ value: String(m), label: cutoverText(m) }))}
        disabled={write.busy}
        onChange={(value) => {
          const minutes = Number.parseInt(value, 10);
          save(() => storage.repos.settings.update({ drinkingDayCutoverMinutes: minutes }));
        }}
      />
      {profile.sex === 'male' ? (
        <ChoiceList
          legend={s.guidanceLabel}
          name={name}
          options={[
            { value: 'men', label: s.guidanceMen },
            { value: 'women', label: s.guidanceWomen },
          ]}
          value={settings.alcoholGuidanceSet === 'nz-women' ? 'women' : 'men'}
          disabled={write.busy}
          onChange={(value) => {
            const set = value === 'women' ? 'nz-women' : null;
            save(() => storage.repos.settings.update({ alcoholGuidanceSet: set }));
          }}
        />
      ) : (
        <p>{guidance.basis === 'no-sex' ? g.basis.noSex : g.basis.profile[guidance.set]}</p>
      )}
      <p className="ui-drinks-guidance">{g.line[guidance.set]}</p>
      <p role="status" className="ui-status-line">
        {saved ? s.saved : ''}
      </p>
      <WriteError write={write} />
    </Card>
  );
}
