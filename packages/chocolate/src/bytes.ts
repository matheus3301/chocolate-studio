import { ChocolateError, integerInRange } from './errors.js';

export type ByteInput = Uint8Array | readonly number[];

/** Validate before conversion: never silently wrap or truncate number-array input. */
export function copyBytes(input: ByteInput): Uint8Array {
  const result = new Uint8Array(input.length);
  for (let index = 0; index < input.length; index++) {
    const value = input[index];
    if (value === undefined || !Number.isInteger(value) || value < 0 || value > 255) {
      throw new ChocolateError('INVALID_BYTE', { index, value });
    }
    result[index] = value;
  }
  return result;
}

/** Accept contiguous hexadecimal octets, with optional whitespace only between octets. */
export function parseHex(text: string): Uint8Array {
  if (!/^(?:\s*[\da-fA-F]{2})*\s*$/.test(text)) {
    throw new ChocolateError('INVALID_HEX');
  }
  const compact = text.replace(/\s/g, '');
  const result = new Uint8Array(compact.length / 2);
  for (let index = 0; index < result.length; index++) {
    result[index] = Number.parseInt(compact.slice(index * 2, index * 2 + 2), 16);
  }
  return result;
}

export function formatHex(input: ByteInput): string {
  return Array.from(copyBytes(input), (value) => value.toString(16).padStart(2, '0')).join(' ');
}

/** Transactional cursor: a failed read never advances the offset. */
export class ByteReader {
  readonly #bytes: Uint8Array;
  #offset = 0;

  constructor(input: ByteInput) { this.#bytes = copyBytes(input); }
  get offset(): number { return this.#offset; }
  get remaining(): number { return this.#bytes.length - this.#offset; }

  #require(length: number): void {
    integerInRange(length, 0, Number.MAX_SAFE_INTEGER, 'length');
    if (length > this.remaining) {
      throw new ChocolateError('TRUNCATED_INPUT', { offset: this.#offset, requested: length, remaining: this.remaining });
    }
  }

  readBytes(length: number): Uint8Array {
    this.#require(length);
    const bytes = this.#bytes.slice(this.#offset, this.#offset + length);
    this.#offset += length;
    return bytes;
  }

  readUint8(): number {
    this.#require(1);
    return this.#bytes[this.#offset++]!;
  }
  readUint16(endian: 'little' | 'big'): number {
    if (endian !== 'little' && endian !== 'big') throw new ChocolateError('INVALID_ARGUMENT', { field: 'endian' });
    this.#require(2);
    const first = this.#bytes[this.#offset]!;
    const second = this.#bytes[this.#offset + 1]!;
    this.#offset += 2;
    return endian === 'little' ? first | (second << 8) : (first << 8) | second;
  }
}
