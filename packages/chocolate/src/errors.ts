export type ChocolateErrorCode =
  | 'INVALID_BYTE' | 'INVALID_HEX' | 'OUT_OF_BOUNDS' | 'TRUNCATED_INPUT'
  | 'INVALID_ARGUMENT' | 'CANCELLED' | 'TIMEOUT' | 'DISCONNECTED'
  | 'SESSION_CLOSED' | 'BUSY' | 'TRANSPORT_FAILURE' | 'MATCHER_FAILURE'
  | 'UNSUPPORTED_CAPABILITY' | 'INVALID_PACKET' | 'CHECKSUM_MISMATCH'
  | 'DEVICE_REJECTED' | 'VERIFICATION_MISMATCH' | 'SESSION_DESYNCHRONIZED';

/** Stable code/data contract. Render user-facing text at the application boundary. */
export class ChocolateError extends Error {
  readonly code: ChocolateErrorCode;
  readonly data: Readonly<Record<string, unknown>>;

  constructor(code: ChocolateErrorCode, data: Record<string, unknown> = {}) {
    super(code);
    this.name = 'ChocolateError';
    this.code = code;
    this.data = Object.freeze({ ...data });
  }
}

export function integerInRange(value: number, min: number, max: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new ChocolateError('INVALID_ARGUMENT', { field, value, min, max });
  }
}
