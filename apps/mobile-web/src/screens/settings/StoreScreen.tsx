/**
 * Settings, Store (item 24 design 1.12; GL-08): the store name shown at the top of the grocery list
 * and in its exports, as plain text. Saving changes the profile and the current list together.
 * The field is filled once, when the profile first arrives, so a later live update never overwrites
 * what the owner is typing. Nothing here contacts the store.
 */
import { DEFAULT_STORE_NAME, fillTemplate, type ProfileRecord } from '@diet/core';
import { grocery, privacy } from '@diet/core/copy/health';
import { checkStoreName } from '@diet/grocery';
import { Button, ButtonRow, Card, Notice, TextField } from '@diet/ui';
import { type ReactElement, useState } from 'react';
import { useLiveQueryState } from '../../db/liveQuery';
import { type AppStorage, appStorageStore } from '../../db/runtime';
import { useStore } from '../../store';
import { listWriteMessage, type ListMessage } from '../list/writeErrors';

const copy = grocery.store;
const ERRORS = {
  required: copy.errors.required,
  length: copy.errors.length,
  'price-text': copy.errors.nameOnly,
} as const;

const readProfile = (storage: AppStorage): Promise<ProfileRecord> => storage.repos.profile.get();

export function StoreScreen(): ReactElement {
  const storage = useStore(appStorageStore);
  if (storage === null) {
    return (
      <Card label={copy.label}>
        <p className="ui-text-muted">{copy.loading}</p>
      </Card>
    );
  }
  return <StoreSetting storage={storage} />;
}

function StoreSetting({ storage }: { readonly storage: AppStorage }): ReactElement {
  const read = useLiveQueryState(storage, readProfile);
  const [name, setName] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);
  const [saved, setSaved] = useState('');
  const [failure, setFailure] = useState<ListMessage | null>(null);
  const [saving, setSaving] = useState(false);

  if (read.status === 'error') {
    return (
      <Card label={copy.label}>
        <Notice
          tone="amber"
          role="alert"
          actions={
            <Button variant="secondary" onClick={storage.platform.reload}>
              {grocery.reload}
            </Button>
          }
        >
          <p>{copy.readFailed}</p>
        </Notice>
      </Card>
    );
  }
  if (read.status === 'pending') {
    return (
      <Card label={copy.label}>
        <p className="ui-text-muted">{copy.loading}</p>
      </Card>
    );
  }
  // Filled once, from the profile as it first arrives.
  const value = name ?? read.value.storeName;
  if (name === null) setName(read.value.storeName);

  const save = async () => {
    const checked = checkStoreName(value);
    setSaved('');
    if (!checked.ok) {
      setError(ERRORS[checked.problem]);
      return;
    }
    setError(undefined);
    setSaving(true);
    try {
      await storage.repos.groceryBuild.setStoreName(checked.value);
      setFailure(null);
      setSaved(copy.saved);
    } catch (e) {
      const message = listWriteMessage(e, 'row');
      setFailure(
        message.reload === true || message.text === privacy.storageFull
          ? message
          : { text: copy.saveFailed, tone: 'alert' },
      );
    }
    setSaving(false);
  };

  return (
    <Card label={copy.label}>
      <TextField
        label={copy.field}
        hint={copy.hint}
        autoComplete="off"
        value={value}
        error={error}
        onChange={(event) => {
          setName(event.currentTarget.value);
        }}
      />
      {failure === null ? null : (
        <Notice
          tone="amber"
          role="alert"
          actions={
            failure.reload === true ? (
              <Button variant="secondary" onClick={storage.platform.reload}>
                {privacy.backupCard.reload}
              </Button>
            ) : undefined
          }
        >
          <p>{failure.text}</p>
        </Notice>
      )}
      <ButtonRow>
        {/* Never disabled while saving, which would move focus to the top of the page. */}
        <Button
          variant="primary"
          onClick={() => {
            if (!saving) void save();
          }}
        >
          {copy.save}
        </Button>
        {value === DEFAULT_STORE_NAME ? null : (
          <Button
            variant="secondary"
            onClick={() => {
              setName(DEFAULT_STORE_NAME);
            }}
          >
            {fillTemplate(copy.useDefault, { store: DEFAULT_STORE_NAME })}
          </Button>
        )}
      </ButtonRow>
      <p className="ui-status-line" role="status">
        {saved}
      </p>
    </Card>
  );
}
