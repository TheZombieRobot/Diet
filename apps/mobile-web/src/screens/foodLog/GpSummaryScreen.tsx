/**
 * Summary for your GP, #/gp-summary (item 23 design 1.10; C100; HEALTH_SAFETY section 4): average
 * daily saturated fat and net carbs, the share of food energy, the badge mix and the days with one
 * entry, over days ending yesterday. Offered to everyone, as a plain text or CSV file on the phone
 * only: no network request, never the relay, nothing stored (STORAGE_DESIGN 17). It reads only
 * the food log and the home zone: no weight, drinks or profile.
 */
import {
  exportFileName,
  fillTemplate,
  footerForEntries,
  type GpRangeDays,
  GP_SUMMARY_RANGE_DAYS,
  gpSummary,
  gpSummaryCsv,
  gpSummaryLines,
  gpSummaryRange,
  gpSummaryText,
  type LocalDate,
  nutritionFooter,
} from '@diet/core';
import { foodLog, general, privacy } from '@diet/core/copy/health';
import { Button, ButtonRow, Card, ChoiceList } from '@diet/ui';
import { type ReactElement, useCallback, useState } from 'react';
import { useLiveQuery } from '../../db/liveQuery';
import type { AppStorage } from '../../db/runtime';
import { appStorageStore } from '../../db/runtime';
import { offerDownload } from '../../files';
import { useFoodData } from '../../foods/FoodDataContext';
import { formatPlanDate } from '../../format';
import { gpSummaryRouteOf } from '../../routes';
import { useStore } from '../../store';
import { useLocationHash } from '../../useRoute';
import { ReloadButton } from '../recipes/parts';
import { useTargetsClock } from '../targets/useDayTargets';

const gp = foodLog.gp;

export function GpSummaryScreen(): ReactElement {
  const storage = useStore(appStorageStore);
  if (storage === null)
    return (
      <Card label={gp.linkTitle}>
        <p className="ui-text-muted">{privacy.backupCard.notReady}</p>
      </Card>
    );
  return <GpSummary storage={storage} />;
}

function GpSummary({ storage }: { readonly storage: AppStorage }): ReactElement {
  const { today } = useTargetsClock(storage);
  const hash = useLocationHash();
  const [days, setDays] = useState<GpRangeDays>(() => gpSummaryRouteOf(hash));
  const [offered, setOffered] = useState<string | null>(null);
  const { approved, attributions } = useFoodData();
  const { from, to } = gpSummaryRange(today, days);
  const query = useCallback(
    async (s: AppStorage) => {
      try {
        const [rows, settings] = await Promise.all([
          s.repos.foodLog.forLocalDates(from, to),
          s.repos.settings.get(),
        ]);
        return { ok: true as const, rows, settings };
      } catch {
        return { ok: false as const };
      }
    },
    [from, to],
  );
  const read = useLiveQuery(storage, query);
  const id = 'gp-range';
  const rangeCard = (
    <Card label={gp.linkTitle}>
      <p>{gp.intro}</p>
      <ChoiceList
        legend={gp.range}
        name={id}
        hint={gp.rangeHint}
        options={GP_SUMMARY_RANGE_DAYS.map((d) => ({
          value: String(d),
          label: gp.rangeOptions[d],
        }))}
        value={String(days)}
        onChange={(v) => {
          setDays(Number(v) as GpRangeDays);
          setOffered(null);
        }}
      />
    </Card>
  );
  if (read === undefined)
    return (
      <>
        {rangeCard}
        <p className="ui-text-muted">{privacy.backupCard.notReady}</p>
      </>
    );
  if (!read.ok)
    return (
      <>
        {rangeCard}
        <p>{foodLog.screen.readFailed}</p>
        <ReloadButton />
      </>
    );
  if (read.settings.onboardingCompletedAt === null)
    return <p className="ui-text-muted">{foodLog.screen.setupFirst}</p>;
  const summary = gpSummary({
    rows: read.rows,
    from,
    to,
    home: read.settings.homeTimeZone,
    approved,
  });
  const lines = gpSummaryLines(summary, {
    formatDate: (d: LocalDate) => formatPlanDate(d),
    footer: nutritionFooter(footerForEntries(read.rows, approved), attributions),
  });
  const offer = (kind: 'gp-summary-txt' | 'gp-summary-csv') => {
    const fileName = exportFileName(kind, today);
    if (kind === 'gp-summary-txt')
      offerDownload(gpSummaryText(lines), fileName, document, 'text/plain;charset=utf-8');
    else offerDownload(gpSummaryCsv(lines), fileName, document, 'text/csv;charset=utf-8');
    setOffered(fileName);
  };
  return (
    <>
      {rangeCard}
      <Card label={gp.summaryLabel}>
        {summary.daysLogged === 0 ? (
          <p className="ui-text-muted">{gp.noDays}</p>
        ) : (
          <>
            {lines.map((line, i) => {
              if (line.kind === 'heading') return <h3 key={`${i}-${line.text}`}>{line.text}</h3>;
              if (line.kind === 'note')
                return line.text === general.about ? null : (
                  <p key={`${i}-${line.text}`} className="ui-text-muted">
                    {line.text}
                  </p>
                );
              return (
                <dl key={line.label} className="ui-facts">
                  <dt>{line.label}</dt>
                  <dd>
                    {line.value}
                    {line.notes.map((n) => (
                      <p key={n} className="ui-text-muted">
                        {n}
                      </p>
                    ))}
                  </dd>
                </dl>
              );
            })}
            <p className="ui-text-small">{general.about}</p>
            <ButtonRow>
              <Button
                variant="secondary"
                onClick={() => {
                  offer('gp-summary-txt');
                }}
              >
                {gp.saveText}
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  offer('gp-summary-csv');
                }}
              >
                {gp.saveCsv}
              </Button>
            </ButtonRow>
            <p role="status" className="ui-text-muted ui-status-line">
              {offered === null ? '' : fillTemplate(gp.afterOffer, { fileName: offered })}
            </p>
          </>
        )}
      </Card>
    </>
  );
}
