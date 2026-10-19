// @vitest-environment node
// Live queries and the write gate (storage spec sections 1 and 7.5; section 16 test 31's "no
// resurrection"): once this tab's gate closes, a live query never runs again, even when another
// connection changes the records it read. Real Dexie over fake-indexeddb.
import { describe, expect, it, vi } from 'vitest';
import { createWriteGate } from './gate';
import { liveStore } from './liveQuery';
import { openTestDb } from './testKit';

describe('liveStore and the write gate', () => {
  it('stops for good when the gate closes: a write through another connection re-runs an open subscription, never a gated one', async () => {
    const test = await openTestDb();
    const other = await openTestDb({ deps: test.deps, env: test.env });
    const gatedQuery = vi.fn(() => test.db.weights.count());
    const openQuery = vi.fn(() => test.db.weights.count());
    const gate = createWriteGate();
    const gated = liveStore(gatedQuery, gate);
    const control = liveStore(openQuery, createWriteGate());
    const stops = [gated.subscribe(() => undefined), control.subscribe(() => undefined)];
    await vi.waitFor(() => {
      expect(gated.get()).toBe(0);
      expect(control.get()).toBe(0);
    });
    gate.close();
    const gatedCalls = gatedQuery.mock.calls.length;
    const openCalls = openQuery.mock.calls.length;

    await other.repos.weights.create({ kg: 80, source: 'manual', note: null });
    // The open subscription sees the change, so the gated one would have by now.
    await vi.waitFor(() => {
      expect(control.get()).toBe(1);
    });
    expect(openQuery.mock.calls.length).toBeGreaterThan(openCalls);
    expect(gatedQuery.mock.calls.length).toBe(gatedCalls);
    expect(gated.get()).toBe(0);
    for (const stop of stops) stop();
  });

  it('a subscription made after the gate closed never runs its query', async () => {
    const test = await openTestDb();
    const other = await openTestDb({ deps: test.deps, env: test.env });
    const gate = createWriteGate();
    gate.close();
    const query = vi.fn(() => test.db.weights.count());
    const control = liveStore(() => test.db.weights.count(), createWriteGate());
    const stops = [
      liveStore(query, gate).subscribe(() => undefined),
      control.subscribe(() => undefined),
    ];
    await other.repos.weights.create({ kg: 80, source: 'manual', note: null });
    await vi.waitFor(() => {
      expect(control.get()).toBe(1);
    });
    expect(query).not.toHaveBeenCalled();
    for (const stop of stops) stop();
  });
});
