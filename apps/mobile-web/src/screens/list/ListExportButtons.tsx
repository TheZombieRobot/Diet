/**
 * Copy text, CSV and JSON (item 24 design 1.11; GL-06, GL-07): made on the phone from the list
 * record alone, with no network. A download goes through the storage platform (files.ts
 * offerDownload underneath), so tests stub it as item 12's backup tests do. Item 31's Send and
 * export section renders these same buttons; ListExportSection, with the note, is item 24's until
 * then.
 */
import { exportFileName, fillTemplate, type GroceryListRecord, localDateOf } from '@diet/core';
import { grocery } from '@diet/core/copy/health';
import { listCsv, listJson, listText } from '@diet/grocery';
import { Button } from '@diet/ui';
import { type ReactElement, useState } from 'react';
import { browserEnv } from '../../db/env';
import { appStorageStore, browserPlatform } from '../../db/runtime';
import { copyToClipboard } from '../../clipboard';
import { useStore } from '../../store';

const copy = grocery.exports;

export function ListExportButtons(props: { readonly list: GroceryListRecord }): ReactElement {
  const storage = useStore(appStorageStore);
  const [status, setStatus] = useState('');
  const platform = storage?.platform ?? browserPlatform;
  const env = storage?.env ?? browserEnv();

  const copyText = async () => {
    const text = listText(props.list);
    if (text === '') {
      setStatus(copy.nothingToCopy);
      return;
    }
    setStatus((await copyToClipboard(text)) ? copy.copied : copy.copyFailed);
  };
  const download = (kind: 'grocery-list-csv' | 'grocery-list-json') => {
    try {
      const name = exportFileName(kind, localDateOf(env.now(), env.timeZone()));
      platform.download(
        kind === 'grocery-list-csv' ? listCsv(props.list) : listJson(props.list),
        name,
      );
      setStatus(fillTemplate(copy.downloaded, { file: name }));
    } catch {
      setStatus(copy.failed);
    }
  };

  return (
    <>
      <div className="ui-button-grid">
        <Button variant="secondary" onClick={() => void copyText()}>
          {copy.copy}
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            download('grocery-list-csv');
          }}
        >
          {copy.csv}
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            download('grocery-list-json');
          }}
        >
          {copy.json}
        </Button>
      </div>
      <p className="ui-text-muted" role="status">
        {status}
      </p>
    </>
  );
}

/** Item 24's Export section, until item 31's Send and export replaces it (design 1.15). */
export function ListExportSection({ list }: { readonly list: GroceryListRecord }): ReactElement {
  return (
    <section aria-label={copy.sectionLabel} className="ui-export">
      <ListExportButtons list={list} />
      <p className="ui-text-muted">{copy.note}</p>
    </section>
  );
}
