import { describe, expect, it } from 'vitest';
import { createDefaultConfiguration } from '@chocolate-studio/midi';
import { applyFcpPatches, FCP_SIZE } from '@chocolate-studio/chocolate-layout';
import { configurationFromBytes, configurationToBytes } from '../src/hardware-mapping';

function image() { const bytes = new Uint8Array(FCP_SIZE); bytes[0] = 3; bytes[11] = 231; bytes[0x34c5] = 201; return bytes; }
describe('intent to device mapping', () => {
  it('rejects unknown switch modes instead of silently converting an unchanged draft to single', () => {
    const baseline = image(); baseline[0x5d] = 9;
    const decoded = configurationFromBytes(baseline);
    const result = configurationToBytes(baseline, decoded.configuration);
    expect(result.unsupported).toContain('hardware.unrecognizedFields'); expect(result.bytes).toEqual(baseline);
  });
  it('expands bank select in order and preserves unrelated bytes', () => {
    const baseline = image(); const config = createDefaultConfiguration();
    config.groups[0]!.switches.A.actions[0]!.messages = [{ type: 'pc', channel: 16, program: 127, bank: { msb: 4, lsb: 2 } }];
    const result = configurationToBytes(baseline, config);
    expect(result.unsupported).toEqual([]);
    expect(Array.from(result.bytes.slice(94, 109))).toEqual([1, 15, 1, 0, 4, 1, 15, 1, 32, 2, 1, 15, 0, 127, 0]);
    expect(result.bytes[11]).toBe(231); expect(result.bytes[0x34c5]).toBe(201);
    expect(baseline[94]).toBe(0);
  });
  it('rejects an entire plan when expanded messages exceed the physical bank', () => {
    const baseline = image(); const config = createDefaultConfiguration();
    config.groups[0]!.switches.A.actions[0]!.messages = Array.from({ length: 6 }, () => ({ type: 'pc', channel: 1, program: 2, bank: { msb: 0, lsb: 1 } }));
    const result = configurationToBytes(baseline, config);
    expect(result.unsupported).toContain('hardware.maxSixteenMessages'); expect(result.bytes).toEqual(baseline);
  });
  it('preserves unrecognized active records on unchanged read/write, rejects overwriting them', () => {
    const baseline = image(); baseline.set([1, 0, 4, 99, 88], 94);
    const decoded = configurationFromBytes(baseline);
    expect(decoded.warnings).toContain('hardware.unknownMessages');
    expect(configurationToBytes(baseline, decoded.configuration).bytes).toEqual(baseline);
    decoded.configuration.groups[0]!.switches.A.actions = [{ gesture: 'press', messages: [{ type: 'cc', channel: 1, controller: 64, value: 127 }] }];
    const result = configurationToBytes(baseline, decoded.configuration);
    expect(result.unsupported).toContain('hardware.preserveUnknownBank'); expect(result.bytes).toEqual(baseline);
  });
  it('keeps both sequences, behavior, labels and preset metadata through reread', () => {
    const config = createDefaultConfiguration(); const sw = config.groups[0]!.switches.A;
    sw.behavior = 'alternate'; sw.label = 'Ambiência'; sw.secondaryMessages = [{ type: 'cc', channel: 2, controller: 69, value: 0 }];
    const result = configurationToBytes(image(), config);
    const decoded = configurationFromBytes(result.bytes, config).configuration;
    expect(decoded.groups[0]!.switches.A).toEqual(sw);
  });
  it('disables removed entries without overwriting their opaque trailing data', () => {
    const baseline = applyFcpPatches(image(), [{ kind: 'message', location: { scope: 'advanced', groupIndex: 0, switchId: 'A', bank: 'B', slot: 5 }, message: { type: 'cc', channel: 4, controller: 70, value: 99 } }]).bytes;
    const config = configurationFromBytes(baseline).configuration;
    config.groups[0]!.switches.A.secondaryMessages = [];
    const result = configurationToBytes(baseline, config);
    expect(Array.from(result.bytes.slice(199, 204))).toEqual([0, 3, 1, 70, 99]);
  });
});
