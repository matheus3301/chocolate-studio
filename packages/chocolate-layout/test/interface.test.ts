import { describe, expect, it } from 'vitest';
import { FCP_SIZE, applyFcpPatches, decodeFcp, interfaceAssignmentOffset } from '../src/index.js';
import type { FcpPatch } from '../src/index.js';

describe('interface pedal endpoint records, not PC/CC records', () => {
  it('writes every endpoint field at first/last boundaries and preserves all other bytes', () => {
    const image = Uint8Array.from({ length: FCP_SIZE }, (_, index) => (index * 31 + 7) & 255);
    const before = image.slice();
    const expected = image.slice();
    expected.set([1, 0, 127, 5, 96], 0x0d);
    expected.set([1, 15, 0, 127, 0], 0x58);
    const result = applyFcpPatches(image, [
      { kind: 'interfaceAssignment', slot: 0, assignment: { channel: 1, data: 127, releaseValue: 5, pressValue: 96 } },
      { kind: 'interfaceAssignment', slot: 15, assignment: { channel: 16, data: 0, releaseValue: 127, pressValue: 0 } },
    ]);
    expect(result.bytes).toEqual(expected);
    expect(image).toEqual(before);
    const records = decodeFcp(result.bytes).interfaceBank.records;
    expect(records[0]!.assignment).toEqual({ channel: 1, data: 127, releaseValue: 5, pressValue: 96 });
    expect(records[15]!.assignment).toEqual({ channel: 16, data: 0, releaseValue: 127, pressValue: 0 });
    expect(records[0]).not.toHaveProperty('message');
    expect(interfaceAssignmentOffset(15)).toBe(0x58);
    expect(result.footprints[1]).toMatchObject({ fieldRange: { offset: 0x58, length: 5 }, cubeSuiteRange: { offset: 0x0d, length: 80 } });
  });

  it('retains malformed enabled records and uninterpreted disabled bytes', () => {
    const image = new Uint8Array(FCP_SIZE);
    image.set([1, 16, 128, 254, 255], 0x0d);
    image.set([0, 255, 255, 255, 255], 0x12);
    const view = decodeFcp(image);
    expect(view.interfaceBank.records[0]).toEqual({ offset: 0x0d, enabled: 1, channelIndex: 16, data: 128,
      releaseValue: 254, pressValue: 255, assignment: null });
    expect(view.interfaceBank.records[1]!.assignment).toBeNull();
    expect(applyFcpPatches(image, []).bytes).toEqual(image);
    const cleared = applyFcpPatches(image, [{ kind: 'clearInterfaceAssignment', slot: 0 }]);
    expect(Array.from(cleared.bytes.slice(0x0d, 0x12))).toEqual([0, 16, 128, 254, 255]);
  });

  it('rejects the obsolete typed-message interface path instead of reinterpreting pedal data', () => {
    const image = new Uint8Array(FCP_SIZE);
    const obsolete = { kind: 'message', location: { scope: 'interface', slot: 0 },
      message: { type: 'pc', channel: 1, program: 127 } } as unknown as FcpPatch;
    expect(() => applyFcpPatches(image, [obsolete])).toThrow(/scope/);
    expect(image).toEqual(new Uint8Array(FCP_SIZE));
  });
});
