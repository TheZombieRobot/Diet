import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyUpdate,
  markUpdateWaiting,
  reloadWhenNewVersionTakesOver,
  setUpdateActivator,
  updateStore,
} from './update';

afterEach(() => {
  updateStore.set({ waiting: false, applying: false });
});

describe('reloading into the new version (PWA-05)', () => {
  it('reloads once when the new version takes control, however often it is armed', () => {
    const container = new EventTarget();
    const reload = vi.fn();
    reloadWhenNewVersionTakesOver(container, reload);
    reloadWhenNewVersionTakesOver(container, reload);
    expect(reload).not.toHaveBeenCalled();
    container.dispatchEvent(new Event('controllerchange'));
    container.dispatchEvent(new Event('controllerchange'));
    expect(reload).toHaveBeenCalledOnce();
  });

  it('Reload marks the update as applying and sends the activation', async () => {
    const activate = vi.fn(() => Promise.resolve());
    setUpdateActivator(activate);
    markUpdateWaiting();
    expect(updateStore.get()).toEqual({ waiting: true, applying: false });
    await applyUpdate();
    expect(activate).toHaveBeenCalledOnce();
    expect(updateStore.get()).toEqual({ waiting: true, applying: true });
  });

  it('a later check finding the same waiting version does not undo "Reloading"', async () => {
    setUpdateActivator(() => Promise.resolve());
    markUpdateWaiting();
    await applyUpdate();
    markUpdateWaiting();
    expect(updateStore.get()).toEqual({ waiting: true, applying: true });
  });
});
