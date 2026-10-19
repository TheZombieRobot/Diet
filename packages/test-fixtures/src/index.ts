/** @diet/test-fixtures: Generic fixtures for tests. Never real personal data: the repository is public. */
export const PACKAGE_NAME = '@diet/test-fixtures' as const;

// Storage (checklist item 12): the released schema-version-1 fixture, its fixed reference backup
// files, and a deterministic test environment.
export * from './storage/env';
export * from './storage/fuzzMutations';
export * from './storage/referenceEnvelopesV1';
export * from './storage/snapshotV1';
export * from './storage/testChains';
