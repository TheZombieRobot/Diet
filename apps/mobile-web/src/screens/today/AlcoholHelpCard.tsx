import { cardHidden, type CardStateRecord, cardTrigger, type SettingsRecord } from '@diet/core';
import { alcohol } from '@diet/core/copy/health';
import { Button, Card } from '@diet/ui';
import { type ReactElement, useEffect, useRef } from 'react';
import { useLiveQuery } from '../../db/liveQuery';
import type { AppStorage } from '../../db/runtime';
import { NoticeHelpRows } from '../../onboarding/NoticeHelpRows';
import { useReadinessGates } from '../../onboarding/state';
import { SaveError } from '../../onboarding/SaveError';
import { useSave } from '../../onboarding/useSave';

const CARD = 'alcohol-help';
const TRIGGER = 'readiness-q7';

interface HelpCardInputs {
  readonly row: CardStateRecord | undefined;
  readonly settings: SettingsRecord;
}

const readHelpCard = async (storage: AppStorage): Promise<HelpCardInputs> => {
  const [row, settings] = await Promise.all([
    storage.repos.cardState.get(CARD, TRIGGER),
    storage.repos.settings.get(),
  ]);
  return { row, settings };
};

/**
 * The "talk to someone" card from day one (HEALTH_SAFETY section 5; C58; AL-09, AL-09b; item 13
 * design section 3.14): shown while readiness answer 7 is yes or unanswered, unless "Not now" was
 * tapped in the last 720 hours. Its own dismissal rule decides (cardHidden): a done time is ignored
 * and a dismissal dated ahead hides nothing. There is no "done" control; the card can never be
 * turned off (C46).
 */
export function AlcoholHelpCard({
  storage,
}: {
  readonly storage: AppStorage;
}): ReactElement | null {
  const view = useReadinessGates(storage);
  const inputs = useLiveQuery(storage, readHelpCard);
  const save = useSave();
  const marking = useRef(false);
  const dismissal = cardTrigger(CARD, TRIGGER)?.dismissal;
  const visible =
    view !== undefined &&
    inputs !== undefined &&
    dismissal !== undefined &&
    view.gates.alcoholHelpCardFromDayOne &&
    !cardHidden({
      now: storage.env.now(),
      row: inputs.row,
      dismissal,
      drinkingDayCutoverMinutes: inputs.settings.drinkingDayCutoverMinutes,
    });
  const shownBefore = (inputs?.row?.firstShownAt ?? null) !== null;

  // The first time it shows, record it. Not something the owner did, so a failure is silent and is
  // tried again on a later render (section 3.15).
  useEffect(() => {
    if (!visible || shownBefore || marking.current) return;
    marking.current = true;
    storage.repos.cardState.markShown(CARD, TRIGGER).then(
      () => {
        marking.current = false;
      },
      () => {
        marking.current = false;
      },
    );
  });

  if (!visible) return null;
  return (
    <Card label={alcohol.helpCardLabel}>
      <p data-testid="alcohol-help-card">{alcohol.helpCard}</p>
      <NoticeHelpRows />
      <SaveError save={save} />
      <Button
        variant="quiet"
        disabled={save.busy}
        onClick={() => {
          void save.run(() => storage.repos.cardState.dismiss(CARD, TRIGGER));
        }}
      >
        {alcohol.helpCardNotNow}
      </Button>
      <p className="ui-text-muted">{alcohol.helpCardReturns}</p>
    </Card>
  );
}
