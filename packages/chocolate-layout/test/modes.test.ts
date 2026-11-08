import { describe, expect, it } from 'vitest';
import {
  FCP_SIZE, applyFcpPatches, decodeFcp, keyboardSwitchOffset, mixedSwitchOffset, messageOffset,
} from '../src/index.js';
import type { FcpPatch } from '../src/index.js';

const syntheticImage = () => Uint8Array.from({ length: FCP_SIZE }, (_, index) => (index * 37 + 19) & 255);

describe('observed keyboard and mixed storage', () => {
  it.each([0, 3])('changes mode %i to Mix without reinterpreting any inactive region', (mode) => {
    const image = syntheticImage();
    image[0] = mode;
    image.set([1, 0, 0, 17, 201], 0x5e);
    image.set([1, 15, 1, 69, 127], 0x34cb);
    const expected = image.slice();
    expected[0] = 11;
    const result = applyFcpPatches(image, [{ kind: 'field', field: 'mode', value: 11 }]);
    expect(result.bytes).toEqual(expected);
    expect(result.changes).toEqual([{ offset: 0, before: mode, after: 11 }]);
  });

  it('edits first and last keyboard combinations without changing adjacent mixed or Advanced bytes', () => {
    const image = syntheticImage();
    const expected = image.slice();
    expected.set([63, 66, 1], 0x347d);
    expected.set([0, 64, 62], 0x34c2);
    const result = applyFcpPatches(image, [
      { kind: 'keyboard', scope: 'keyboard', groupIndex: 0, switchId: 'A', combination: { modifier1: 1, modifier2: 4, key: 1 } },
      { kind: 'keyboard', scope: 'keyboard', groupIndex: 5, switchId: 'D', combination: { modifier1: 0, modifier2: 2, key: 62 } },
    ]);
    expect(result.bytes).toEqual(expected);
    expect(image).toEqual(syntheticImage());
    expect(keyboardSwitchOffset(5, 'D')).toBe(0x34c2);
    expect(decodeFcp(result.bytes).keyboardGroups[5]!.switches.D.combination).toEqual({ modifier1: 0, modifier2: 2, key: 62 });
    expect(result.footprints.map((entry) => entry.cubeSuiteRange)).toEqual([
      { offset: 0x347d, length: 1 }, { offset: 0x347e, length: 1 }, { offset: 0x347f, length: 1 },
      { offset: 0x34c2, length: 1 }, { offset: 0x34c3, length: 1 }, { offset: 0x34c4, length: 1 },
    ]);
  });

  it('edits mixed type, keyboard, Turner and both MIDI banks independently, preserving custom payloads', () => {
    const image = syntheticImage();
    const expected = image.slice();
    expected.set([1, 9, 65, 0, 35, 4], 0x5aaf);
    expected.set([1, 15, 2, 60, 127], 0x5ab5);
    expected.set([1, 0, 1, 64, 0], 0x5b50);
    const result = applyFcpPatches(image, [
      { kind: 'mixedType', groupIndex: 5, switchId: 'D', typeCode: 1 },
      { kind: 'turnerKey', groupIndex: 5, switchId: 'D', keyIndex: 9 },
      { kind: 'keyboard', scope: 'mixed', groupIndex: 5, switchId: 'D', combination: { modifier1: 3, modifier2: 0, key: 35 } },
      { kind: 'switchMode', scope: 'mixed', groupIndex: 5, switchId: 'D', modeCode: 4 },
      { kind: 'message', location: { scope: 'mixed', groupIndex: 5, switchId: 'D', bank: 'A', slot: 0 },
        message: { type: 'noteOn', channel: 16, note: 60, velocity: 127 } },
      { kind: 'message', location: { scope: 'mixed', groupIndex: 5, switchId: 'D', bank: 'B', slot: 15 },
        message: { type: 'cc', channel: 1, controller: 64, value: 0 } },
    ]);
    expect(result.bytes).toEqual(expected);
    expect(mixedSwitchOffset(5, 'D')).toBe(0x5aaf);
    expect(messageOffset({ scope: 'mixed', groupIndex: 5, switchId: 'D', bank: 'B', slot: 15 })).toBe(0x5b50);
    const last = decodeFcp(result.bytes).mixedGroups[5]!.switches.D;
    expect(last).toMatchObject({ typeCode: 1, turnerKeyIndex: 9, modeCode: 4,
      keyboard: { combination: { modifier1: 3, modifier2: 0, key: 35 } } });
    expect(last.bankA.records[0]!.message).toEqual({ type: 'noteOn', channel: 16, note: 60, velocity: 127 });
    expect(last.bankB.customRange).toEqual({ offset: 0x5bd5, length: 128 });
    expect(result.footprints.at(-1)!.cubeSuiteRange).toEqual({ offset: 0x34c5, length: 0x2790 });
  });

  it('retains unknown keyboard bytes and invalid note records without normalization', () => {
    const image = new Uint8Array(FCP_SIZE);
    image[0] = 254;
    image.set([62, 255, 240], 0x347d);
    image.set([1, 0, 3, 60, 128], 0x5e);
    const view = decodeFcp(image);
    expect(view.mode).toBe(254);
    expect(view.keyboardGroups[0]!.switches.A).toMatchObject({ raw: [62, 255, 240], combination: null });
    expect(view.advancedGroups[0]!.switches.A.bankA.records[0]).toMatchObject({ interpretation: 'invalid', message: null, data2: 128 });
    expect(applyFcpPatches(image, []).bytes).toEqual(image);
  });

  it('writes note-off boundaries and preserves a neighboring opaque record and custom payload', () => {
    const image = syntheticImage();
    const expected = image.slice();
    expected.set([1, 0, 3, 0, 0], 0x5e);
    const result = applyFcpPatches(image, [{ kind: 'message',
      location: { scope: 'advanced', groupIndex: 0, switchId: 'A', bank: 'A', slot: 0 },
      message: { type: 'noteOff', channel: 1, note: 0, velocity: 0 } }]);
    expect(result.bytes).toEqual(expected);
    expect(decodeFcp(result.bytes).advancedGroups[0]!.switches.A.bankA.records[0]!.message)
      .toEqual({ type: 'noteOff', channel: 1, note: 0, velocity: 0 });
  });

  it.each([
    { kind: 'keyboard', scope: 'keyboard', groupIndex: 6, switchId: 'A', combination: { modifier1: 0, modifier2: 0, key: 1 } },
    { kind: 'keyboard', scope: 'mixed', groupIndex: 0, switchId: 'A', combination: { modifier1: 1, modifier2: 1, key: 1 } },
    { kind: 'keyboard', scope: 'keyboard', groupIndex: 0, switchId: 'A', combination: { modifier1: 0, modifier2: 0, key: 63 } },
    { kind: 'mixedType', groupIndex: 0, switchId: 'A', typeCode: 3 },
    { kind: 'turnerKey', groupIndex: 0, switchId: 'A', keyIndex: 10 },
    { kind: 'switchMode', scope: 'invalid', groupIndex: 0, switchId: 'A', modeCode: 1 },
    { kind: 'message', location: { scope: 'mixed', groupIndex: 6, switchId: 'A', bank: 'A', slot: 0 }, message: { type: 'cc', channel: 1, controller: 0, value: 0 } },
    { kind: 'message', location: { scope: 'advanced', groupIndex: 0, switchId: 'A', bank: 'A', slot: 0 }, message: { type: 'noteOn', channel: 1, note: 128, velocity: 127 } },
  ])('rejects invalid extended edit %# atomically', (patch) => {
    const image = syntheticImage();
    expect(() => applyFcpPatches(image, [{ kind: 'field', field: 'mode', value: 3 }, patch as FcpPatch])).toThrow();
    expect(image).toEqual(syntheticImage());
  });
});
