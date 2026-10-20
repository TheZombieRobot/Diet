// @vitest-environment node
// Live queries and the write gate (storage spec sections 1 and 7.5; section 16 test 31's "no
// resurrection"): once this tab's gate closes, a live query never runs again, even when another
// connection changes the records it read. Real Dexie over fake-indexeddb.
import { describe, expect, it, vi } from 'vitest';
import { createWriteGate } from './gate';
import { liveStateStore, liveStore } from './liveQuery';
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

describe('liveStateStore (item 16; T24, TD-02)', () => {
  it('is pending until the first result, ready with it, and an error when a read fails while the gate is open', async () => {
    const test = await openTestDb();
    const ok = liveStateStore(() => test.db.weights.count(), createWriteGate());
    const failing = liveStateStore(async () => {
      await test.db.weights.count();
      throw new Error('synthetic read failure');
    }, createWriteGate());
    expect(ok.get()).toEqual({ status: 'pending' });
    const stops = [ok.subscribe(() => undefined), failing.subscribe(() => undefined)];
    await vi.waitFor(() => {
      expect(ok.get()).toEqual({ status: 'ready', value: 0 });
      expect(failing.get()).toEqual({ status: 'error' });
    });
    for (const stop of stops) stop();
  });

  it('after a failure, a later successful read is ready again', async () => {
    const test = await openTestDb();
    let fail = false;
    const store = liveStateStore(async () => {
      const count = await test.db.weights.count();
      if (fail) throw new Error('synthetic read failure');
      return count;
    }, createWriteGate());
    const stop = store.subscribe(() => undefined);
    await vi.waitFor(() => {
      expect(store.get()).toEqual({ status: 'ready', value: 0 });
    });
    fail = true;
    await test.repos.weights.create({ kg: 80, source: 'manual', note: null });
    await vi.waitFor(() => {
      expect(store.get()).toEqual({ status: 'error' });
    });
    fail = false;
    await test.repos.weights.create({ kg: 81, source: 'manual', note: null });
    await vi.waitFor(() => {
      expect(store.get()).toEqual({ status: 'ready', value: 2 });
    });
    stop();
  });

  it('a failure reported once the gate reads as closed keeps the last value', async () => {
    // A gate that reads as closed before its close listeners run, so the subscription is still
    // there when the read fails: only the check at the failure keeps the value.
    const test = await openTestDb();
    let open = true;
    const gate = { ...createWriteGate(), isOpen: () => open };
    let fail = false;
    let failures = 0;
    const store = liveStateStore(async () => {
      const count = await test.db.weights.count();
      if (!fail) return count;
      failures += 1;
      throw new Error('synthetic read failure');
    }, gate);
    const stop = store.subscribe(() => undefined);
    await vi.waitFor(() => {
      expect(store.get()).toEqual({ status: 'ready', value: 0 });
    });
    open = false;
    fail = true;
    await test.repos.weights.create({ kg: 80, source: 'manual', note: null });
    await vi.waitFor(() => {
      expect(failures).toBeGreaterThan(0);
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(store.get()).toEqual({ status: 'ready', value: 0 });
    stop();
  });

  it('a failure after the gate closed keeps the last value', async () => {
    const test = await openTestDb();
    const gate = createWriteGate();
    const store = liveStateStore(() => test.db.weights.count(), gate);
    const stop = store.subscribe(() => undefined);
    await vi.waitFor(() => {
      expect(store.get()).toEqual({ status: 'ready', value: 0 });
    });
    gate.close();
    test.db.close();
    await test.repos.weights
      .create({ kg: 80, source: 'manual', note: null })
      .catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(store.get()).toEqual({ status: 'ready', value: 0 });
    stop();
  });
});
