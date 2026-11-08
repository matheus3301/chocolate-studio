import { describe, expect, it } from 'vitest';
import { BinarySnapshot, ByteReader, copyBytes, createTraceFrame, diffSnapshots, formatHex, parseHex } from '../src/index.js';

describe('strict byte input', () => {
  it.each([-1, 256, 1.5, NaN, Infinity, undefined])('rejects malformed byte %s without coercion', (value) => {
    expect(() => copyBytes([value as number])).toThrow(expect.objectContaining({ code: 'INVALID_BYTE' }));
  });
  it.each(['0', 'abc', '0x01', 'gg', '0 1', '01,02', '01 2'])('rejects malformed hex %s', (text) => {
    expect(() => parseHex(text)).toThrow(expect.objectContaining({ code: 'INVALID_HEX' }));
  });
  it('accepts octets, whitespace and empty input without normalizing opaque data', () => {
    expect([...parseHex('00ff 7F\n80')]).toEqual([0, 255, 127, 128]);
    expect([...parseHex(' \n ')]).toEqual([]);
    expect(formatHex([0, 255, 127, 128])).toBe('00 ff 7f 80');
  });
  it('does not advance a truncated cursor or alias read buffers', () => {
    const input = new Uint8Array([1, 2, 3]);
    const reader = new ByteReader(input);
    input.fill(0);
    expect(reader.readUint16('little')).toBe(513);
    expect(() => reader.readUint16('big')).toThrow(expect.objectContaining({ code: 'TRUNCATED_INPUT' }));
    expect(reader.offset).toBe(2);
    expect(reader.remaining).toBe(1);
    expect([...reader.readBytes(1)]).toEqual([3]);
    expect(reader.readBytes(0)).toEqual(new Uint8Array());
    expect(() => reader.readBytes(-1)).toThrow(expect.objectContaining({ code: 'INVALID_ARGUMENT' }));
  });
});

describe('opaque snapshots and positional differences', () => {
  it('isolates original buffer, subarray boundaries, exported buffers and immutable trace', () => {
    const input = new Uint8Array([9, 0, 255, 8]);
    const snapshot = new BinarySnapshot(input.subarray(1, 3));
    const trace = createTraceFrame('incoming', 12.5, input);
    input.fill(4);
    snapshot.toUint8Array().fill(5);
    expect([...snapshot.toUint8Array()]).toEqual([0, 255]);
    expect([...trace.bytes.toUint8Array()]).toEqual([9, 0, 255, 8]);
    expect(Object.isFrozen(trace)).toBe(true);
    expect(() => snapshot.at(-1)).toThrow(expect.objectContaining({ code: 'OUT_OF_BOUNDS' }));
    expect(() => snapshot.at(2)).toThrow(expect.objectContaining({ code: 'OUT_OF_BOUNDS' }));
    expect(() => snapshot.slice(1, 0)).toThrow(expect.objectContaining({ code: 'INVALID_ARGUMENT' }));
  });
  it('groups maximal adjacent ranges, separates unchanged bytes and represents additions', () => {
    const before = new BinarySnapshot([1, 2, 3, 4, 5]);
    const after = new BinarySnapshot([1, 9, 8, 4, 7, 6]);
    const ranges = diffSnapshots(before, after);
    expect(ranges.map(({ start, end, before: old, after: next }) => [start, end, [...old.toUint8Array()], [...next.toUint8Array()]])).toEqual([
      [1, 3, [2, 3], [9, 8]], [4, 6, [5], [7, 6]],
    ]);
    expect(diffSnapshots(before, before)).toEqual([]);
    expect(Object.isFrozen(ranges)).toBe(true);
  });
  it('represents removed tails and empty sides without inventing bytes', () => {
    const removed = diffSnapshots(new BinarySnapshot([1, 2, 3]), new BinarySnapshot([1]));
    expect(removed.map(({ start, end, before, after }) => [start, end, [...before.toUint8Array()], [...after.toUint8Array()]])).toEqual([[1, 3, [2, 3], []]]);
    expect(diffSnapshots(new BinarySnapshot([]), new BinarySnapshot([]))).toEqual([]);
  });
});
