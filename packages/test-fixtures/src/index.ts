/** @diet/test-fixtures: Generic fixtures for tests. Never real personal data: the repository is public. */
export const PACKAGE_NAME = '@diet/test-fixtures' as const;

// Storage (checklist item 12): the released schema-version-1 fixture, its fixed reference backup
// files, and a deterministic test environment.
export * from './storage/env';
export * from './storage/fuzzMutations';
export * from './storage/referenceEnvelopesV1';
export * from './storage/snapshotV1';
export * from './storage/testChains';

// Grocery (checklist item 29): the 300-item list for TR-05a, shared with items 24 and 31.
export * from './grocery/list300';
// Weight (checklist item 14): synthetic weigh-in and Kickstart scenarios, and plain gate objects.
export * from './weight/scenarios';
// Foods (checklist item 18): the synthetic food data and a small subset of the shipped catalogue.
export * from './foods/foodFixtures';
// Garden and pantry (checklist item 19): JPEG bytes built in code, and the GL-02 and NN-06 stock rows.
export * from './garden/jpeg';
export * from './garden/stockFixtures';
// Transfer (checklist item 30): fixed pairing and sealing vectors, and QR images drawn at test time.
export * from './transfer/qrImage';
export * from './transfer/vectors';
