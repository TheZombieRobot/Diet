// @vitest-environment node
// The pairing repository (checklist item 30 design 1.6; A1, A17; TR-03a, TR-10, C34). Real Dexie
// over fake-indexeddb, with a real non-extractable key.
import { StorageValidationError } from '@diet/core';
import { importPairingKey, NO_RELAY_URL } from '@diet/grocery/transfer';
import { V1_RELAY, V1_ROOM_ID, V5_ROOM_ID, VECTOR_KEY_BYTES } from '@diet/test-fixtures';
import { describe, expect, it } from 'vitest';
import { StorageClosedError, StorageOperationError } from '../errors';
import { openTestDb } from '../testKit';
import { crudRepo } from './crud';

const input = async (roomId = V1_ROOM_ID, relayUrl = V1_RELAY) => ({
  roomId,
  relayUrl,
  key: await importPairingKey(VECTOR_KEY_BYTES),
});

describe('repos.pairing (item 30; A1)', () => {
  it('saves one pairing dated now, replaces it on a second save, and removes it', async () => {
    const test = await openTestDb();
    const saved = await test.repos.pairing.save(await input());
    expect(saved).toMatchObject({ id: 'singleton', roomId: V1_ROOM_ID, relayUrl: V1_RELAY });
    expect(saved.pairedAt).toBe(test.env.now());
    expect((await test.repos.pairing.get())?.key.extractable).toBe(false);
    test.env.advanceDays(1);
    await test.repos.pairing.save(await input(V5_ROOM_ID, NO_RELAY_URL));
    expect(await test.db.transfer_pairings.count()).toBe(1);
    expect(await test.repos.pairing.get()).toMatchObject({
      roomId: V5_ROOM_ID,
      relayUrl: NO_RELAY_URL,
      pairedAt: test.env.now(),
    });
    await test.repos.pairing.remove();
    expect(await test.repos.pairing.get()).toBeUndefined();
    await test.repos.pairing.remove();
  });

  it('refuses an extractable key, an http address and a short room id, and stores nothing', async () => {
    const test = await openTestDb();
    const extractable = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
      'encrypt',
      'decrypt',
    ]);
    const good = await input();
    for (const bad of [
      { ...good, key: extractable },
      { ...good, relayUrl: 'http://relay.example.com' },
      { ...good, roomId: V1_ROOM_ID.slice(1) },
    ]) {
      await expect(test.repos.pairing.save(bad)).rejects.toBeInstanceOf(StorageValidationError);
    }
    expect(await test.db.transfer_pairings.count()).toBe(0);
  });

  it('writes nothing once the write gate has closed', async () => {
    const test = await openTestDb();
    await test.repos.pairing.save(await input());
    test.db.gate.close();
    await expect(test.repos.pairing.save(await input(V5_ROOM_ID))).rejects.toBeInstanceOf(
      StorageClosedError,
    );
    await expect(test.repos.pairing.remove()).rejects.toBeInstanceOf(StorageClosedError);
    expect((await test.repos.pairing.get())?.roomId).toBe(V1_ROOM_ID);
  });

  it('A17: is the only repository of transfer_pairings; the generic one refuses every operation', async () => {
    const test = await openTestDb();
    const generic = crudRepo(
      { db: test.db, env: test.env, gate: test.db.gate, hooks: {} },
      'transfer_pairings',
    );
    expect(() => generic.list()).toThrow(StorageOperationError);
    expect(() => generic.get('singleton')).toThrow(StorageOperationError);
    expect(() => generic.create({} as never)).toThrow(StorageOperationError);
    expect(() => generic.update('singleton', {})).toThrow(StorageOperationError);
    expect(() => generic.remove('singleton')).toThrow(StorageOperationError);
  });
});
