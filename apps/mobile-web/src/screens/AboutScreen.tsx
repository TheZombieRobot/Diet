import { fillTemplate, sourcesInUse } from '@diet/core';
import { foods, general, helpNumbers } from '@diet/core/copy/health';
import { ActionRow, Card, FoodIcon } from '@diet/ui';
import type { ReactElement } from 'react';
import { useFoodData } from '../foods/FoodDataContext';
import { offlineCopyStore, type OfflineCopy } from '../pwa/offline';
import { routeHref } from '../routes';
import { storageStore } from '../pwa/storage';
import { useStore } from '../store';
import { versionLabel } from '../version';
import { AttributionList } from './foods/AttributionList';
import { HelpNumberList } from './HelpNumbers';
import { storageStatusText } from './backup/storageStatus';

const OFFLINE_COPY_TEXT: Readonly<Record<OfflineCopy, string>> = {
  saving: 'Still saving the offline copy',
  ready: 'Ready to use offline',
  unavailable: 'This browser could not save an offline copy',
};

/**
 * Item 18 (C97, NU-09): the food catalogue, the link to it, and each food database in use with the
 * attribution its licence asks for. It reads only the bundled data, never the records.
 */
function FoodDataSources(): ReactElement {
  const { data, attributions } = useFoodData();
  if (data.status !== 'ok') {
    return (
      <>
        <p>{foods.screen.readFailed}</p>
        <p className="ui-text-muted">{foods.about.attributionNote}</p>
        <FoodsLink />
      </>
    );
  }
  const sources = sourcesInUse(data);
  const count = data.catalogue.foods.length;
  return (
    <>
      <p>
        {sources.length === 0
          ? fillTemplate(foods.about.catalogue, { count })
          : fillTemplate(foods.about.catalogueLoaded, {
              count,
              loaded: Object.keys(data.release.foods).length,
            })}
      </p>
      <p className="ui-text-muted">{foods.about.attributionNote}</p>
      <FoodsLink />
      <AttributionList
        sources={sources.map((id) => ({
          name: attributions[id]?.name ?? '',
          edition: data.release.sources.find((s) => s.id === id)?.edition ?? '',
          text: attributions[id]?.text ?? '',
        }))}
      />
    </>
  );
}

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

/** HS-13 (About portion): not a medical device, the help numbers, privacy, sources and version. */
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
      </Card>

      <Card label="Data sources">
        <FoodDataSources />
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
