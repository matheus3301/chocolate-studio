import type { ByteInput } from './bytes.js';

export type Unsubscribe = () => void;
/** Structurally compatible with AbortSignal; no DOM dependency. */
export interface CancellationSignal {
  readonly aborted: boolean;
  addEventListener(type: 'abort', listener: () => void, options?: { once?: boolean }): void;
  removeEventListener(type: 'abort', listener: () => void): void;
}

export interface Transport {
  readonly connected: boolean;
  /** Resolving means accepted by the transport, never verified hardware state. */
  send(bytes: Uint8Array): Promise<void>;
  /** Timestamp milliseconds; the transport chooses and documents its clock domain. */
  onData(listener: (bytes: ByteInput, timestamp: number) => void): Unsubscribe;
  onDisconnect(listener: () => void): Unsubscribe;
}

export interface SessionClock {
  now(): number;
  /** Asynchronous callback; cancellation must be idempotent. */
  schedule(callback: () => void, delayMs: number): Unsubscribe;
}

interface RuntimeTimers {
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}
const timers = globalThis as unknown as RuntimeTimers;
export const systemClock: SessionClock = {
  now: () => Date.now(),
  schedule(callback, delayMs) {
    const handle = timers.setTimeout(callback, delayMs);
    return () => timers.clearTimeout(handle);
  },
};
