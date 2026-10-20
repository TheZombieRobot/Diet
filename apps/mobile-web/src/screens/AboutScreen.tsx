import { fillTemplate, joinList, sourcesInUse } from '@diet/core';
import { about, foods, general, helpNumbers } from '@diet/core/copy/health';
import { ActionRow, Card, FoodIcon } from '@diet/ui';
import type { ReactElement } from 'react';
import { useFoodData } from '../foods/FoodDataContext';
import { offlineCopyStore, type OfflineCopy } from '../pwa/offline';
import { storageStore } from '../pwa/storage';
import { routeHref } from '../routes';
import { useStore } from '../store';
import { versionLabel } from '../version';
import { HelpNumberList } from './HelpNumbers';
import { storageStatusText } from './backup/storageStatus';
import { AttributionList } from './foods/AttributionList';

const OFFLINE_COPY_TEXT: Readonly<Record<OfflineCopy, string>> = {
  saving: 'Still saving the offline copy',
  ready: 'Ready to use offline',
  unavailable: 'This browser could not save an offline copy',
};

function FoodsLink(): ReactElement {
  return (
    <ActionRow
      href={routeHref('foods')}
      badge={<FoodIcon size={22} />}
      title={foods.about.linkTitle}
      detail={foods.about.linkDetail}
    />
  );
}

/**
 * The Data sources card's contents (item 16, with item 18's design 1.2): what each badge means,
 * the Database line naming a food database only once one is approved and in use (C97, NU-09), the
 * catalogue, the link to it, and each database in use with the attribution its licence asks for.
 * It reads only the bundled data, never the records.
 */
function DataSources(): ReactElement {
  const { data, attributions } = useFoodData();
  const sources = sourcesInUse(data);
  const names = sources.map((id) => attributions[id]?.name ?? '');
  const databaseLine =
    sources.length === 0
      ? foods.about.databaseBadgeNone
      : fillTemplate(foods.about.databaseBadge, {
          sources: joinList(names, foods.listComma, foods.listAnd),
        });
  const badges = [about.dataSources.badges.label, databaseLine, about.dataSources.badges.estimate];
  return (
    <>
      <p>{about.dataSources.intro}</p>
      <ul className="ui-plain-list">
        {badges.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <p>
        {data.status !== 'ok'
          ? foods.screen.readFailed
          : sources.length === 0
            ? fillTemplate(foods.about.catalogue, { count: data.catalogue.foods.length })
            : fillTemplate(foods.about.catalogueLoaded, {
                count: data.catalogue.foods.length,
                loaded: Object.keys(data.release.foods).length,
              })}
      </p>
      <p className="ui-text-muted">{foods.about.attributionNote}</p>
      <FoodsLink />
      {data.status === 'ok' ? (
        <AttributionList
          sources={sources.map((id) => ({
            name: attributions[id]?.name ?? '',
            edition: data.release.sources.find((s) => s.id === id)?.edition ?? '',
            text: attributions[id]?.text ?? '',
          }))}
        />
      ) : null}
    </>
  );
}

/**
 * HS-13 (About portion): not a medical device, the help numbers, privacy (with the shared-origin
 * caveat, C34), what the food-figure badges mean and where food data comes from, and the version.
 * It reads nothing from the records, so it shows the same whether they open, are closed or failed.
 */
export function AboutScreen(): ReactElement {
  const storage = useStore(storageStore);
  const offlineCopy = useStore(offlineCopyStore);
  return (
    <>
      <Card label="About this app">
        <p className="ui-text-lead">{general.about}</p>
      </Card>

      <Card label="Help numbers">
        <p className="ui-text-muted">{helpNumbers.intro}</p>
        <HelpNumberList />
      </Card>

      <Card label="Privacy">
        <p>{general.privacy}</p>
        <p>{about.sharedOrigin}</p>
      </Card>

      <Card label="Data sources">
        <DataSources />
      </Card>

      <Card label="This copy of the app">
        <dl className="ui-facts">
          <div>
            <dt className="ui-facts__term">Version</dt>
            <dd className="ui-facts__value" data-testid="app-version">
              {versionLabel()}
            </dd>
          </div>
          <div>
            <dt className="ui-facts__term">Offline copy</dt>
            <dd className="ui-facts__value" data-testid="offline-copy">
              {OFFLINE_COPY_TEXT[offlineCopy]}
            </dd>
          </div>
          <div>
            <dt className="ui-facts__term">Storage on this device</dt>
            <dd className="ui-facts__value" data-testid="storage-protection">
              {storageStatusText(storage)}
            </dd>
          </div>
        </dl>
      </Card>
    </>
  );
}
