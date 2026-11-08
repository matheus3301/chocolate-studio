import { describe, expect, it } from 'vitest';
import {
  FCP_SIZE, SWITCH_IDS, advancedSwitchOffset, applyFcpPatches, decodeFcp, messageOffset,
} from '../src/index.js';
import type { FcpPatch, MessageLocation } from '../src/index.js';

function patternedImage(): Uint8Array {
  return Uint8Array.from({ length: FCP_SIZE }, (_, index) => (index * 37 + 19) & 255);
}

describe('own statically derived FCP layout', () => {
  it.each([0, 23645, 23647])('rejects wrong image size %i', (length) => {
    expect(() => decodeFcp(new Uint8Array(length))).toThrow(RangeError);
    expect(() => applyFcpPatches(new Uint8Array(length), [])).toThrow(RangeError);
  });

  it('decodes literal first/last switch bank boundaries and zero-based stored channels', () => {
    const image = new Uint8Array(FCP_SIZE);
    image[0] = 3;
    image[2] = 15;
    image[0x5c57] = 7;
    image[0x5c58] = 6;
    image[0x5c5a] = 1;
    image[0x5c5c] = 1;
    image[0x5d] = 2;
    image.set([1, 0, 0, 127, 255], 0x5e);
    image.set([1, 15, 1, 80, 0], 0xae);
    image[0x32dc] = 4;
    image.set([1, 15, 0, 0, 199], 0x32dd);
    image.set([1, 0, 1, 127, 127], 0x3378);
    const decoded = decodeFcp(image);
    expect(decoded.mode).toBe(3);
    expect(decoded.globals).toMatchObject({ channelIndex: 15, advancedMaxGroupIndex: 7,
      advancedGroupIndex: 6, polarity: 1, pcDisplay: 1 });
    expect(decoded.advancedGroups).toHaveLength(8);
    const first = decoded.advancedGroups[0]!.switches.A;
    expect(first.modeCode).toBe(2);
    expect(first.bankA.records[0]!.message).toEqual({ type: 'pc', channel: 1, program: 127 });
    expect(first.bankA.records[0]!.data2).toBe(255);
    expect(first.bankB.records[0]!.message).toEqual({ type: 'cc', channel: 16, controller: 80, value: 0 });
    const last = decoded.advancedGroups[7]!.switches.D;
    expect(last.offset).toBe(0x32dc);
    expect(last.modeCode).toBe(4);
    expect(last.bankA.records[0]!.message).toEqual({ type: 'pc', channel: 16, program: 0 });
    expect(last.bankB.records[15]!.message).toEqual({ type: 'cc', channel: 1, controller: 127, value: 127 });
    expect(last.bankA.customRange).toEqual({ offset: 0x337d, length: 128 });
    expect(last.bankB.customRange).toEqual({ offset: 0x33fd, length: 128 });
    expect(decoded.issues).toEqual([]);
  });

  it('retains opaque/invalid records and reports raw values without clamping', () => {
    const image = new Uint8Array(FCP_SIZE);
    image[0] = 255;
    image.set([1, 0, 2, 60, 127], 0x5e); // Observed Note ON type, not interpreted by this API.
    image.set([1, 200, 4, 250, 249], 0x63); // Custom record; not a PC or CC.
    image.set([1, 16, 1, 200, 128], 0xae);
    const before = new Uint8Array(image);
    const decoded = decodeFcp(image);
    expect(decoded.mode).toBe(255);
    expect(decoded.advancedGroups[0]!.switches.A.bankA.records[0]).toMatchObject({ interpretation: 'opaque', typeCode: 2, message: null });
    expect(decoded.advancedGroups[0]!.switches.A.bankA.records[1]).toMatchObject({ interpretation: 'opaque', typeCode: 4, data1: 250, message: null });
    expect(decoded.advancedGroups[0]!.switches.A.bankB.records[0]).toMatchObject({ interpretation: 'invalid', channelIndex: 16, message: null });
    expect(decoded.issues).toContainEqual({ offset: 0xaf, field: 'channelIndex', value: 16, min: 0, max: 15 });
    expect(image).toEqual(before);
    const noEdits = applyFcpPatches(image, []);
    expect(noEdits.bytes).toEqual(image);
    expect(noEdits.changes).toEqual([]);
    noEdits.bytes[11] = 99;
    expect(image[11]).toBe(0);
  });

  it('exposes coordinate bounds without wrapping or crossing regions', () => {
    expect(advancedSwitchOffset(0, 'A')).toBe(0x5d);
    expect(advancedSwitchOffset(7, 'D')).toBe(0x32dc);
    expect(messageOffset({ scope: 'advanced', groupIndex: 7, switchId: 'D', bank: 'B', slot: 15 })).toBe(0x3378);
    expect(messageOffset({ scope: 'interface', slot: 15 })).toBe(0x58);
    for (const groupIndex of [-1, 8, 0.5, NaN]) expect(() => advancedSwitchOffset(groupIndex, 'A')).toThrow();
    for (const slot of [-1, 16, 0.5, NaN]) expect(() => messageOffset({ scope: 'interface', slot })).toThrow();
  });
});

describe('validated byte preserving field patches', () => {
  it('patches only the channel byte, even in an otherwise unrecognized image', () => {
    const image = patternedImage();
    const expected = new Uint8Array(image);
    expected[2] = 1;
    const result = applyFcpPatches(image, [{ kind: 'field', field: 'channelIndex', value: 1 }]);
    expect(result.bytes).toEqual(expected);
    expect(image[2]).toBe(93);
    expect(result.changes).toEqual([{ offset: 2, before: 93, after: 1 }]);
    expect(result.footprints[0]).toMatchObject({ fieldRange: { offset: 2, length: 1 }, cubeSuiteRange: { offset: 2, length: 1 } });
  });

  it('patches both banks of one switch without rewriting unknown bytes or the PC spare byte', () => {
    const image = patternedImage();
    const expected = new Uint8Array(image);
    expected[0x32dc] = 1;
    expected.set([1, 15, 0, 127], 0x32dd);
    expected.set([1, 0, 1, 0, 127], 0x3378);
    const result = applyFcpPatches(image, [
      { kind: 'switchMode', groupIndex: 7, switchId: 'D', modeCode: 1 },
      { kind: 'message', location: { scope: 'advanced', groupIndex: 7, switchId: 'D', bank: 'A', slot: 0 },
        message: { type: 'pc', channel: 16, program: 127 } },
      { kind: 'message', location: { scope: 'advanced', groupIndex: 7, switchId: 'D', bank: 'B', slot: 15 },
        message: { type: 'cc', channel: 1, controller: 0, value: 127 } },
    ]);
    expect(result.bytes).toEqual(expected);
    expect(result.bytes[0x32e1]).toBe(image[0x32e1]);
    expect(result.footprints[1]).toMatchObject({ fieldRange: { offset: 0x32dd, length: 4 }, cubeSuiteRange: { offset: 0x5d, length: 0x3420 } });
    expect(result.footprints[2]).toMatchObject({ fieldRange: { offset: 0x3378, length: 5 }, cubeSuiteRange: { offset: 0x5d, length: 0x3420 } });
  });

  it('clears only the enabled flag and does not compact neighboring records', () => {
    const image = patternedImage();
    const expected = new Uint8Array(image);
    expected[0x58] = 0;
    const result = applyFcpPatches(image, [{ kind: 'clearMessage', location: { scope: 'interface', slot: 15 } }]);
    expect(result.bytes).toEqual(expected);
    expect(result.footprints[0]).toMatchObject({ fieldRange: { offset: 0x58, length: 1 }, cubeSuiteRange: { offset: 0x0d, length: 80 } });
  });

  it('keeps every switch and bank independent across all 1024 advanced slots', () => {
    const patches: FcpPatch[] = [];
    const expected = new Uint8Array(FCP_SIZE);
    for (let groupIndex = 0; groupIndex < 8; groupIndex++) for (const [switchIndex, switchId] of SWITCH_IDS.entries()) {
      for (const bank of ['A', 'B'] as const) for (let slot = 0; slot < 16; slot++) {
        const location: MessageLocation = { scope: 'advanced', groupIndex, switchId, bank, slot };
        patches.push({ kind: 'message', location, message: { type: 'cc', channel: groupIndex + 1, controller: slot, value: switchIndex } });
        const offset = 93 + groupIndex * 1668 + switchIndex * 417 + (bank === 'A' ? 1 : 81) + slot * 5;
        expected.set([1, groupIndex, 1, slot, switchIndex], offset);
      }
    }
    expect(applyFcpPatches(new Uint8Array(FCP_SIZE), patches).bytes).toEqual(expected);
  });

  it.each([
    { kind: 'field', field: 'channelIndex', value: 16 },
    { kind: 'field', field: 'advancedGroupIndex', value: 8 },
    { kind: 'field', field: 'customCommandA', value: 134 },
    { kind: 'field', field: 'interfaceCommand', value: 130 },
    { kind: 'field', field: '__proto__', value: 1 },
    { kind: 'field', field: 'mode', value: 13 },
    { kind: 'field', field: 'polarity', value: 2 },
    { kind: 'switchMode', groupIndex: 0, switchId: 'A', modeCode: 5 },
    { kind: 'message', location: { scope: 'interface', slot: 0 }, message: { type: 'pc', channel: 0, program: 0 } },
    { kind: 'message', location: { scope: 'interface', slot: 0 }, message: { type: 'pc', channel: 1, program: 128 } },
    { kind: 'message', location: { scope: 'interface', slot: 0 }, message: { type: 'cc', channel: 1, controller: -1, value: 0 } },
    { kind: 'message', location: { scope: 'interface', slot: 0 }, message: { type: 'cc', channel: 1, controller: 0, value: 128 } },
    { kind: 'message', location: { scope: 'advanced', groupIndex: 0, switchId: 'A', bank: 'C', slot: 0 }, message: { type: 'pc', channel: 1, program: 0 } },
    { kind: 'message', location: { scope: 'interface', slot: 0 }, message: { type: 'pc', channel: 1, program: 0, extra: true } },
  ])('rejects invalid patch %# atomically', (invalid) => {
    const image = patternedImage();
    const before = new Uint8Array(image);
    expect(() => applyFcpPatches(image, [
      { kind: 'field', field: 'channelIndex', value: 1 }, invalid as FcpPatch,
    ])).toThrow();
    expect(image).toEqual(before);
  });

  it('rejects overlapping writes, unknown keys, and property accessors without executing them', () => {
    const image = new Uint8Array(FCP_SIZE);
    expect(() => applyFcpPatches(image, [
      { kind: 'field', field: 'channelIndex', value: 1 },
      { kind: 'field', field: 'channelIndex', value: 2 },
    ])).toThrow(/Overlapping/);
    const unsafe = { kind: 'field', field: 'channelIndex', value: 1 };
    let reads = 0;
    Object.defineProperty(unsafe, 'value', { get() { reads++; return 1; } });
    expect(() => applyFcpPatches(image, [unsafe as FcpPatch])).toThrow();
    expect(reads).toBe(0);
    const prototypeKey = JSON.parse('{"kind":"field","field":"channelIndex","value":1,"__proto__":{}}') as FcpPatch;
    expect(() => applyFcpPatches(image, [prototypeKey])).toThrow();
    expect(image[2]).toBe(0);
  });
});
