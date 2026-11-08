import { copyBytes } from './bytes.js';
import type { ByteInput } from './bytes.js';
import { ChocolateError, integerInRange } from './errors.js';

/** No interpretation, normalization or exposed mutable backing storage. */
export class BinarySnapshot {
  readonly #bytes: Uint8Array;
  constructor(input: ByteInput) {
    this.#bytes = copyBytes(input);
    Object.freeze(this);
  }
  get length(): number { return this.#bytes.length; }
  at(offset: number): number {
    if (!Number.isSafeInteger(offset) || offset < 0 || offset >= this.length) {
      throw new ChocolateError('OUT_OF_BOUNDS', { offset, length: this.length });
    }
    return this.#bytes[offset]!;
  }
  toUint8Array(): Uint8Array { return this.#bytes.slice(); }
  slice(start: number, end: number = this.length): BinarySnapshot {
    integerInRange(start, 0, this.length, 'start');
    integerInRange(end, start, this.length, 'end');
    return new BinarySnapshot(this.#bytes.subarray(start, end));
  }
}

export interface DiffRange {
  /** Half-open offsets in the shared positional coordinate space, not an edit script. */
  readonly start: number;
  readonly end: number;
  readonly before: BinarySnapshot;
  readonly after: BinarySnapshot;
}

/** Maximal adjacent changed ranges. Added/removed tails have an empty opposite side. */
export function diffSnapshots(before: BinarySnapshot, after: BinarySnapshot): readonly DiffRange[] {
  const ranges: DiffRange[] = [];
  const length = Math.max(before.length, after.length);
  let offset = 0;
  const differs = (index: number): boolean => index >= before.length || index >= after.length || before.at(index) !== after.at(index);
  while (offset < length) {
    if (!differs(offset)) { offset++; continue; }
    const start = offset++;
    while (offset < length && differs(offset)) offset++;
    ranges.push(Object.freeze({
      start, end: offset,
      before: before.slice(Math.min(start, before.length), Math.min(offset, before.length)),
      after: after.slice(Math.min(start, after.length), Math.min(offset, after.length)),
    }));
  }
  return Object.freeze(ranges);
}
