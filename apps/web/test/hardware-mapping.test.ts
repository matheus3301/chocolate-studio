import { describe, expect, it } from 'vitest';
import { applyEquipmentAction, createDefaultConfiguration, exportConfiguration } from '@chocolate-studio/midi';
import { applyFcpPatches, FCP_SIZE } from '@chocolate-studio/chocolate-layout';
import { configurationFromBytes, configurationToBytes } from '../src/hardware-mapping';

function image() { const bytes = new Uint8Array(FCP_SIZE); bytes[0] = 3; bytes[11] = 231; bytes[0x34c5] = 201; return bytes; }
describe('intent to device mapping', () => {
  it.each(Array.from({ length: 13 }, (_, mode) => mode))('retains raw mode %i and inactive banks on an unchanged read/write', mode => {
    const baseline = image(); baseline[0] = mode;
    const read = configurationFromBytes(baseline);
    const result = configurationToBytes(baseline, read.configuration);
    expect(result.unsupported).toEqual([]);
    expect(result.bytes).toEqual(baseline);
  });
  it.each([0, 1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12])('does not write stale Advanced groups when selecting raw mode %i', mode => {
    const baseline = image();
    const config = configurationFromBytes(baseline).configuration;
    config.controller!.mode = mode;
    config.groups[0]!.switches.A.actions = [{ gesture: 'press', messages: [{ type: 'pc', channel: 1, program: 57 }] }];
    const result = configurationToBytes(baseline, config);
    const expected = baseline.slice(); expected[0] = mode;
    expect(result.unsupported).toEqual([]);
    expect(result.bytes).toEqual(expected);
  });

  it('changes only mode when activating retained Advanced banks and preserves their opaque bytes', () => {
    const baseline = image(); baseline[0] = 0;
    baseline[0x5d] = 9; baseline.set([1, 0, 4, 99, 88], 94);
    const config = configurationFromBytes(baseline).configuration;
    config.controller!.mode = 3;
    const result = configurationToBytes(baseline, config);
    const expected = baseline.slice(); expected[0] = 3;
    expect(result.unsupported).toEqual([]);
    expect(result.bytes).toEqual(expected);
  });

  it('reverts mode selection without resetting stored globals or inactive data', () => {
    const baseline = image(); baseline[0] = 0; baseline[0x5c58] = 6;
    const config = configurationFromBytes(baseline).configuration;
    config.controller!.mode = 3;
    config.controller!.mode = 0;
    expect(configurationToBytes(baseline, config).bytes).toEqual(baseline);
  });

  it('does not infer Advanced for a legacy draft against a fixed-mode baseline', () => {
    const baseline = image(); baseline[0] = 1;
    const config = createDefaultConfiguration(); delete config.controller;
    expect(configurationToBytes(baseline, config).bytes).toEqual(baseline);
  });


  it('preserves an unknown mode and its opaque image without migrating to Advanced', () => {
    const baseline = image(); baseline[0] = 250;
    const read = configurationFromBytes(baseline);
    const result = configurationToBytes(baseline, read.configuration);
    expect(result.unsupported).toContain('hardware.unrecognizedFields');
    expect(result.bytes).toEqual(baseline);
    expect(read.controller.rawMode).toBe(250);
  });

  it('preserves unknown switch modes unchanged and rejects attempts to overwrite them', () => {
    const baseline = image(); baseline[0x5d] = 9;
    const decoded = configurationFromBytes(baseline);
    expect(configurationToBytes(baseline, decoded.configuration).bytes).toEqual(baseline);
    expect(decoded.configuration.groups[0]!.switches.A.behavior).toBeUndefined();
    decoded.configuration.groups[0]!.switches.A.behavior = 'single';
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

describe('local equipment metadata across device reads', () => {
  it('preserves an unused selected destination profile and keeps a raw v1 project at v1', () => {
    const config = createDefaultConfiguration();
    config.destinations.push({ id: 'unused', name: 'Selected equipment', channel: 4, profile: { modelId: 'line6.m5', profileVersion: '0.1.0' } });
    const bytes = configurationToBytes(image(), config).bytes;
    const decoded = configurationFromBytes(bytes, config).configuration;
    expect(decoded.formatVersion).toBe(2);
    expect(decoded.destinations.find(destination => destination.id === 'unused')?.profile).toEqual({ modelId: 'line6.m5', profileVersion: '0.1.0' });
    const rawV1 = { ...createDefaultConfiguration(), formatVersion: 1 as const };
    const rawRead = configurationFromBytes(configurationToBytes(image(), rawV1).bytes, rawV1).configuration;
    expect(rawRead.formatVersion).toBe(1);
    expect(JSON.parse(exportConfiguration(rawRead)).formatVersion).toBe(1);
  });

  it('retains matching action bindings but clears only the externally changed sequence', () => {
    let config = createDefaultConfiguration();
    const reference = { modelId: 'line6.m5', profileVersion: '0.1.0', destinationId: 'destination-1' };
    config = applyEquipmentAction(config, 'group-1', 'A', 'primary', { ...reference, actionId: 'select-preset', parameters: { 'preset-number': 1 } }, { behavior: 'shortLong' });
    config = applyEquipmentAction(config, 'group-1', 'A', 'secondary', { ...reference, actionId: 'tuner-enter', parameters: {} });
    const bytes = configurationToBytes(image(), config).bytes;
    expect(configurationFromBytes(bytes, config).configuration.groups[0]!.switches.A.actionBindings).toEqual(config.groups[0]!.switches.A.actionBindings);
    bytes[97] = 8; // External device edit: primary PC8, no longer the saved preset1 action.
    const read = configurationFromBytes(bytes, config).configuration;
    expect(read.formatVersion).toBe(2);
    expect(read.groups[0]!.switches.A.actionBindings?.primary).toBeUndefined();
    expect(read.groups[0]!.switches.A.actionBindings?.secondary).toEqual(config.groups[0]!.switches.A.actionBindings?.secondary);
    expect(read.groups[0]!.switches.A.actions[0]!.messages).toEqual([{ type: 'pc', channel: 1, program: 8 }]);
    expect(read.destinations[0]!.profile).toEqual({ modelId: 'line6.m5', profileVersion: '0.1.0' });
    expect(JSON.parse(exportConfiguration(read)).formatVersion).toBe(2);
  });
});

describe('mode globals and opaque input', () => {
  it('retains invalid untouched fields while applying an explicit known global change', () => {
    const baseline = image(); baseline[4] = 255;
    const read = configurationFromBytes(baseline);
    expect(read.configuration.controller).toMatchObject({ mode: 3, channelIndex: 0 });
    expect(read.configuration.controller!.customCommandA).toBeUndefined();
    read.configuration.controller!.channelIndex = 15;
    const result = configurationToBytes(baseline, read.configuration);
    const expected = baseline.slice(); expected[2] = 15;
    expect(result.unsupported).toEqual([]);
    expect(result.bytes).toEqual(expected);
  });

  it('retains the unknown incoming mode in project JSON and requires an explicit supported target', () => {
    const baseline = image(); baseline[0] = 250;
    const read = configurationFromBytes(baseline);
    expect(JSON.parse(exportConfiguration(read.configuration)).controller.mode).toBe(250);
    read.configuration.controller!.mode = 0;
    const result = configurationToBytes(baseline, read.configuration);
    const expected = baseline.slice(); expected[0] = 0;
    expect(result.unsupported).toEqual([]);
    expect(result.bytes).toEqual(expected);
  });
});

describe('independent Advanced, keyboard and Mixed storage', () => {
  it.each([0, 3])('selects Mixed from raw %i without reinterpreting Advanced groups or replacing retained Mixed data', mode => {
    const baseline = applyFcpPatches(image(), [
      { kind: 'message', location: { scope: 'advanced', groupIndex: 0, switchId: 'A', bank: 'A', slot: 0 }, message: { type: 'pc', channel: 1, program: 17 } },
      { kind: 'mixedType', groupIndex: 0, switchId: 'A', typeCode: 0 },
      { kind: 'message', location: { scope: 'mixed', groupIndex: 0, switchId: 'A', bank: 'A', slot: 0 }, message: { type: 'cc', channel: 2, controller: 69, value: 127 } },
    ]).bytes;
    baseline[0] = mode;
    const config = configurationFromBytes(baseline).configuration;
    expect(config.groups[0]!.switches.A.actions[0]!.messages).toEqual([{ type: 'pc', channel: 1, program: 17 }]);
    expect(config.mixedGroups![0]!.switches.A.actions[0]!.messages).toEqual([{ type: 'cc', channel: 2, controller: 69, value: 127 }]);
    config.controller!.mode = 11;
    if (mode === 0) config.groups[0]!.switches.A.actions[0]!.messages = [{ type: 'pc', channel: 16, program: 99 }];
    const result = configurationToBytes(baseline, config);
    const expected = baseline.slice(); expected[0] = 11;
    expect(result.unsupported).toEqual([]);
    expect(result.bytes).toEqual(expected);
    const project = JSON.parse(exportConfiguration(config));
    expect(project.groups[0].switches.A.actions[0].messages[0].program).toBe(mode === 0 ? 99 : 17);
    expect(project.mixedGroups[0].switches.A.actions[0].messages[0].controller).toBe(69);
  });

  it('changes only Mixed MIDI storage while retaining Advanced, shortcuts and opaque custom data', () => {
    const baseline = image(); baseline[0] = 11; baseline[0x34c5] = 0;
    baseline[0x34c5 + 0xa6] = 219;
    const config = configurationFromBytes(baseline).configuration;
    config.mixedGroups![0]!.switches.A.actions = [{ gesture: 'press', messages: [{ type: 'cc', channel: 3, controller: 64, value: 127 }] }];
    const result = configurationToBytes(baseline, config);
    expect(result.unsupported).toEqual([]);
    expect(Array.from(result.bytes.slice(0x34c5 + 6, 0x34c5 + 11))).toEqual([1, 2, 1, 64, 127]);
    expect(result.bytes.slice(0x5d, 0x34c5)).toEqual(baseline.slice(0x5d, 0x34c5));
    expect(result.bytes[0x34c5 + 0xa6]).toBe(219);
    const read = configurationFromBytes(result.bytes, config).configuration;
    expect(read.mixedGroups![0]!.switches.A).toEqual(config.mixedGroups![0]!.switches.A);
    expect(read.groups).toEqual(config.groups);
  });

  it('does not copy Advanced into Mixed when a legacy project omits mixedGroups', () => {
    const baseline = image(); baseline[0] = 0;
    const config = createDefaultConfiguration(); config.controller = { mode: 11 }; delete config.mixedGroups;
    const result = configurationToBytes(baseline, config);
    const expected = baseline.slice(); expected[0] = 11;
    expect(result.unsupported).toEqual([]);
    expect(result.bytes).toEqual(expected);
  });

  it('stores the last keyboard group using menu indexes and preserves invalid untouched combinations', () => {
    const baseline = image(); baseline[0] = 10; baseline[0x347d] = 255;
    const config = configurationFromBytes(baseline).configuration;
    expect(config.controller!.keyboardAssignments!.some(assignment => assignment.groupIndex === 0 && assignment.switchId === 'A')).toBe(false);
    const assignment = config.controller!.keyboardAssignments!.find(assignment => assignment.groupIndex === 5 && assignment.switchId === 'D')!;
    assignment.combination = { modifier1: 1, modifier2: 2, key: 62 };
    const result = configurationToBytes(baseline, config);
    const expected = baseline.slice(); expected.set([63, 64, 62], 0x34c2);
    expect(result.unsupported).toEqual([]);
    expect(result.bytes).toEqual(expected);
    expect(configurationFromBytes(result.bytes).configuration.controller!.keyboardAssignments).toContainEqual(assignment);
  });

  it('keeps inactive Mixed MIDI/keyboard bytes when changing only a button to page control', () => {
    const baseline = image(); baseline[0] = 11; baseline[0x34c5] = 0;
    const config = configurationFromBytes(baseline).configuration;
    const assignment = config.controller!.mixedAssignments!.find(value => value.groupIndex === 0 && value.switchId === 'A')!;
    assignment.typeCode = 2; assignment.turnerKeyIndex = 9;
    assignment.combination = { modifier1: 1, modifier2: 2, key: 62 };
    config.mixedGroups![0]!.switches.A.actions = [{ gesture: 'press', messages: [{ type: 'pc', channel: 1, program: 99 }] }];
    const result = configurationToBytes(baseline, config);
    const expected = baseline.slice(); expected.set([2, 9], 0x34c5);
    expect(result.unsupported).toEqual([]);
    expect(result.bytes).toEqual(expected);
  });

  it('preserves a standard note record as opaque to the PC/CC project editor', () => {
    const baseline = image(); baseline.set([1, 3, 2, 60, 127], 94);
    const read = configurationFromBytes(baseline);
    expect(read.warnings).toContain('hardware.unknownMessages');
    expect(configurationToBytes(baseline, read.configuration).bytes).toEqual(baseline);
    read.configuration.groups[0]!.switches.A.actions = [{ gesture: 'press', messages: [{ type: 'pc', channel: 1, program: 12 }] }];
    expect(configurationToBytes(baseline, read.configuration).unsupported).toContain('hardware.preserveUnknownBank');
  });
});

describe('Advanced group limit intent', () => {
  it('updates the active limit for an explicit group-list resize without treating the read controller limit as a new override', () => {
    const baseline = image();
    const config = configurationFromBytes(baseline).configuration;
    config.groups.push({ ...structuredClone(config.groups[0]!), id: 'added-group' });
    const result = configurationToBytes(baseline, config);
    const expected = baseline.slice(); expected[0x5c57] = 1;
    expect(result.unsupported).toEqual([]);
    expect(result.bytes).toEqual(expected);
  });
});

describe('dedicated external-pedal interface', () => {
  it('decodes endpoint values without treating Data as a PC/CC message type', () => {
    const baseline = image(); baseline.set([1, 15, 127, 31, 95], 0x0d);
    const config = configurationFromBytes(baseline).configuration;
    expect(config.controller!.interfaceAssignments).toEqual([{ slot: 0, channel: 16, data: 127, releaseValue: 31, pressValue: 95 }]);
    expect(configurationToBytes(baseline, config).bytes).toEqual(baseline);
    config.controller!.interfaceAssignments![0]!.releaseValue = 42;
    const result = configurationToBytes(baseline, config);
    const expected = baseline.slice(); expected[0x10] = 42;
    expect(result.unsupported).toEqual([]);
    expect(result.bytes).toEqual(expected);
  });

  it('clears only the enable byte and does not enable empty slots during mode selection', () => {
    const baseline = image(); baseline.set([1, 15, 127, 31, 95], 0x0d);
    const config = configurationFromBytes(baseline).configuration;
    config.controller!.interfaceAssignments = [];
    config.controller!.clearedInterfaceSlots = [0];
    const result = configurationToBytes(baseline, config);
    const expected = baseline.slice(); expected[0x0d] = 0;
    expect(result.unsupported).toEqual([]);
    expect(result.bytes).toEqual(expected);
    const empty = configurationFromBytes(expected).configuration;
    expect(empty.controller!.interfaceAssignments).toEqual([]);
    empty.controller!.mode = 10;
    const selected = configurationToBytes(expected, empty);
    expected[0] = 10;
    expect(selected.bytes).toEqual(expected);
  });

  it('preserves invalid enabled interface records and rejects replacing them through a known assignment', () => {
    const baseline = image(); baseline.set([1, 255, 127, 31, 95], 0x0d);
    const config = configurationFromBytes(baseline).configuration;
    expect(config.controller!.interfaceAssignments).toEqual([]);
    expect(configurationToBytes(baseline, config).bytes).toEqual(baseline);
    config.controller!.interfaceAssignments = [{ slot: 0, channel: 1, data: 64, releaseValue: 0, pressValue: 127 }];
    const result = configurationToBytes(baseline, config);
    expect(result.unsupported).toContain('hardware.preserveUnknownBank');
    expect(result.bytes).toEqual(baseline);
  });
});
