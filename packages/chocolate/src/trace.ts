import type { ByteInput } from './bytes.js';
import { ChocolateError } from './errors.js';
import { BinarySnapshot } from './snapshot.js';

export type TraceDirection = 'incoming' | 'outgoing';
export interface TraceFrame {
  readonly direction: TraceDirection;
  /** Milliseconds in the clock domain selected by the transport/capture producer. */
  readonly timestamp: number;
  readonly bytes: BinarySnapshot;
}

export function createTraceFrame(direction: TraceDirection, timestamp: number, bytes: ByteInput): TraceFrame {
  if ((direction !== 'incoming' && direction !== 'outgoing') || !Number.isFinite(timestamp) || timestamp < 0) {
    throw new ChocolateError('INVALID_ARGUMENT', { direction, timestamp });
  }
  return Object.freeze({ direction, timestamp, bytes: new BinarySnapshot(bytes) });
}
