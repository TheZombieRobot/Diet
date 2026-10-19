/**
 * The write gate and the cross-tab channel (storage spec section 7.5; D16).
 *
 * The gate is one in-memory flag per tab. While it is closed, every repository write throws
 * StorageClosedError before touching Dexie, and live queries unsubscribe. Only a page reload opens
 * it again. The import and delete-all writers do not go through repositories, so they still run
 * after this tab has closed its own gate.
 *
 * Before an import write and before delete-all, the acting tab posts { type: 'gate', reason } on
 * the BroadcastChannel 'diet-db'. Every other tab closes its database for good with
 * 'reload-needed', so a stale tab's autosave can never write old form state over restored records.
 */
import { StorageClosedError } from './errors';

export interface WriteGate {
  readonly isOpen: () => boolean;
  /** Closes the gate for good (idempotent) and tells every listener once. */
  readonly close: () => void;
  /** Throws StorageClosedError when the gate is closed. */
  readonly assertOpen: () => void;
  /** Called once when the gate closes (at once if it is already closed). Returns an unsubscribe. */
  readonly onClose: (listener: () => void) => () => void;
}

export function createWriteGate(): WriteGate {
  let open = true;
  const listeners = new Set<() => void>();
  return {
    isOpen: () => open,
    close: () => {
      if (!open) return;
      open = false;
      for (const listener of [...listeners]) listener();
      listeners.clear();
    },
    assertOpen: () => {
      if (!open) throw new StorageClosedError();
    },
    onClose: (listener) => {
      if (!open) {
        listener();
        return () => undefined;
      }
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** This tab's gate. */
export const writeGate: WriteGate = createWriteGate();

export const DB_CHANNEL = 'diet-db';
export type GateReason = 'import' | 'delete-all';
export interface GateMessage {
  readonly type: 'gate';
  readonly reason: GateReason;
}

/** The parts of a BroadcastChannel the gate uses (injectable for tests). */
export interface GateChannel {
  readonly postMessage: (message: unknown) => void;
  readonly addEventListener: (type: 'message', listener: (event: MessageEvent) => void) => void;
  readonly removeEventListener: (type: 'message', listener: (event: MessageEvent) => void) => void;
  readonly close: () => void;
}

export type ChannelFactory = (name: string) => GateChannel | null;

/** A real BroadcastChannel, or null in a browser without one (a single tab then has nobody to tell). */
export const browserChannel: ChannelFactory = (name) =>
  typeof BroadcastChannel === 'function' ? new BroadcastChannel(name) : null;

const isGateMessage = (data: unknown): data is GateMessage =>
  typeof data === 'object' &&
  data !== null &&
  (data as { type?: unknown }).type === 'gate' &&
  ((data as { reason?: unknown }).reason === 'import' ||
    (data as { reason?: unknown }).reason === 'delete-all');

/** This tab's end of the 'diet-db' channel. */
export interface TabChannel {
  /** Tells every other tab to close its database for good, before this tab imports or deletes. */
  readonly post: (reason: GateReason) => void;
  /** Stops listening and closes the channel. */
  readonly stop: () => void;
}

/**
 * Opens this tab's end of the channel: `onGate` runs when ANOTHER tab posts a gate message. One
 * channel object both listens and posts, because a BroadcastChannel never delivers a message to
 * the object that sent it: the acting tab must not close its own database in the middle of the
 * import it is writing.
 */
export function openTabChannel(
  onGate: (reason: GateReason) => void,
  channels: ChannelFactory = browserChannel,
): TabChannel {
  const channel = channels(DB_CHANNEL);
  if (channel === null) return { post: () => undefined, stop: () => undefined };
  const onMessage = (event: MessageEvent): void => {
    const data: unknown = event.data;
    if (isGateMessage(data)) onGate(data.reason);
  };
  channel.addEventListener('message', onMessage);
  let open = true;
  return {
    post: (reason) => {
      if (!open) return;
      const message: GateMessage = { type: 'gate', reason };
      channel.postMessage(message);
    },
    stop: () => {
      if (!open) return;
      open = false;
      channel.removeEventListener('message', onMessage);
      channel.close();
    },
  };
}
