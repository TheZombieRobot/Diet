// BK-09 / C99 at the core level (section 16 test 33): the pinned version-1 reference files decode,
// the locked one decrypts with the reference phrase, and both import to migrateSnapshot(1, fixture).
import { decodeBackupText, migrateSnapshot, parseBackupText, sha256Hex } from '@diet/core';
import { describe, expect, it } from 'vitest';
import { fixtureEnv } from './env';
import {
  lockedReferenceEnvelopeV1,
  plainReferenceEnvelopeV1,
  REFERENCE_IV_V1,
  REFERENCE_PHRASE_V1,
  REFERENCE_SALT_V1,
} from './referenceEnvelopesV1';
import { snapshotV1 } from './snapshotV1';

/** Pinned with the reference files: they are never regenerated. */
const LOCKED_REFERENCE_SHA256 = 'be34e31002617d02feef1c8250a4e8b94e23faef396a9dd521ff6313dd3ff8d6';

/** The reference phrase, under a short name for the decode options. */
const phrase = REFERENCE_PHRASE_V1;

const expected = () =>
  migrateSnapshot(1, snapshotV1 as unknown as Record<string, unknown[]>, fixtureEnv()).snapshot;

describe('the fixed version-1 reference files (section 9.4; BK-09)', () => {
  it('the plain reference file imports and equals migrateSnapshot(1, fixture)', async () => {
    const decoded = await decodeBackupText(plainReferenceEnvelopeV1(), { env: fixtureEnv() });
    expect(decoded.schemaVersion).toBe(1);
    expect(decoded.snapshot).toEqual(expected());
  });

  it('the locked reference file decrypts with the reference phrase, imports and equals migrateSnapshot(1, fixture)', async () => {
    const text = lockedReferenceEnvelopeV1();
    const parsed = parseBackupText(text);
    expect(parsed.encrypted).toBe(true);
    if (!parsed.encrypted) return;
    expect(parsed.header).toEqual({
      iterations: 600_000,
      salt: REFERENCE_SALT_V1,
      iv: REFERENCE_IV_V1,
    });
    expect([...parsed.salt]).toEqual(Array.from({ length: 16 }, (_, i) => i + 1));
    expect([...parsed.iv]).toEqual(Array.from({ length: 12 }, (_, i) => 0xa0 + i));
    const decoded = await decodeBackupText(text, {
      password: phrase,
      env: fixtureEnv(),
    });
    expect(decoded.locked).toBe(true);
    expect(decoded.snapshot).toEqual(expected());
  });

  it('is pinned', async () => {
    expect(await sha256Hex(lockedReferenceEnvelopeV1())).toBe(LOCKED_REFERENCE_SHA256);
  });
});
