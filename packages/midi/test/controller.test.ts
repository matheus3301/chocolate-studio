import { describe, expect, it } from 'vitest';
import {
  createDefaultConfiguration, controllerModeSchema, effectiveControllerMode,
  exportConfiguration, importConfiguration, getControllerMode, studioConfigurationSchema,
} from '../src/index.js';

describe('controller settings persistence and draft compatibility', () => {
  it('round-trips known settings without inventing absent edit intent', () => {
    const configuration = createDefaultConfiguration();
    configuration.controller = { mode: 11, channelIndex: 15, interfaceType: 1, customCommandA: 133,
      interfaceCommand: 129, polarity: 1, bankMidi: 0, pcDisplay: 1, pcMaxGroupIndex: 31,
      ccMaxGroupIndex: 30, advancedMaxGroupIndex: 7, advancedGroupIndex: 6,
      keyboardGroupIndex: 5, mixGroupIndex: 4, visualA: 1 };
    const result = importConfiguration(exportConfiguration(configuration));
    expect(result).toEqual({ success: true, data: configuration });
    expect(configuration.controller).not.toHaveProperty('customCommandD');
    expect(effectiveControllerMode(configuration)).toBe(11);
  });

  it('retains unknown read mode through subsequent save, never becoming Advanced', () => {
    const configuration = createDefaultConfiguration();
    configuration.controller = { mode: 255, channelIndex: 3 };
    const result = importConfiguration(exportConfiguration(configuration));
    if (!result.success) throw new Error('Import failed');
    expect(effectiveControllerMode(result.data)).toBe(255);
    expect(getControllerMode(result.data.controller!.mode!)).toBeUndefined();
    expect(controllerModeSchema.safeParse(255).success).toBe(false);
  });

  it.each([1, 2])('keeps legacy format %i absent fields absent while interpreting its draft as Advanced', (formatVersion) => {
    const configuration = { ...createDefaultConfiguration(), formatVersion };
    const parsed = studioConfigurationSchema.parse(configuration);
    expect(parsed).not.toHaveProperty('controller');
    expect(effectiveControllerMode(parsed)).toBe(3);
    expect(importConfiguration(exportConfiguration(parsed))).toEqual({ success: true, data: parsed });
  });

  it.each([0, 3])('preserves unequal Advanced/Mix assignments when selecting Mix from mode %i', (mode) => {
    const configuration = createDefaultConfiguration();
    configuration.controller = { mode };
    const mixed = structuredClone(configuration.groups[0]!);
    mixed.id = 'mix-group-1';
    mixed.switches.A.actions[0]!.messages = [{ type: 'cc', channel: 16, controller: 64, value: 127 }];
    configuration.mixedGroups = [mixed];
    const advancedBefore = structuredClone(configuration.groups);
    configuration.controller.mode = 11;
    const result = importConfiguration(exportConfiguration(configuration));
    if (!result.success) throw new Error('Import failed');
    expect(result.data.groups).toEqual(advancedBefore);
    expect(result.data.mixedGroups![0]!.switches.A.actions[0]!.messages)
      .toEqual([{ type: 'cc', channel: 16, controller: 64, value: 127 }]);
    result.data.mixedGroups![0]!.switches.A.label = 'Independent Mix edit';
    expect(result.data.groups).toEqual(advancedBefore);
  });

  it('never creates a Mix draft from stale Advanced data on a legacy import', () => {
    const configuration = createDefaultConfiguration();
    configuration.controller = { mode: 11 };
    const result = importConfiguration(exportConfiguration(configuration));
    if (!result.success) throw new Error('Import failed');
    expect(result.data).not.toHaveProperty('mixedGroups');
    expect(result.data.groups).toEqual(configuration.groups);
  });

  it('validates Mix references and limits independently of Advanced', () => {
    const configuration = createDefaultConfiguration();
    const mixed = structuredClone(configuration.groups[0]!);
    mixed.id = 'mix-group-1';
    mixed.switches.A.actions[0]!.messages[0]!.destinationId = 'missing';
    expect(studioConfigurationSchema.safeParse({ ...configuration, mixedGroups: [mixed] }).success).toBe(false);
    mixed.switches.A.actions[0]!.messages[0]!.destinationId = 'destination-1';
    const duplicate = studioConfigurationSchema.safeParse({ ...configuration, mixedGroups: [configuration.groups[0]] });
    expect(duplicate.success).toBe(false);
    expect(studioConfigurationSchema.safeParse({ ...configuration, mixedGroups: Array.from({ length: 7 }, (_, index) => ({
      ...mixed, id: `mix-group-${index}`,
    })) }).success).toBe(false);
  });

  it('round-trips separate keyboard, mixed-prefix and interface slot edit intent', () => {
    const configuration = createDefaultConfiguration();
    configuration.controller = {
      mode: 10,
      keyboardAssignments: [{ groupIndex: 5, switchId: 'D', combination: { modifier1: 1, modifier2: 4, key: 62 } }],
      mixedAssignments: [{ groupIndex: 0, switchId: 'A', typeCode: 2, turnerKeyIndex: 9 }],
      interfaceAssignments: [{ slot: 15, channel: 16, data: 127, releaseValue: 0, pressValue: 127 }],
      clearedInterfaceSlots: [0],
    };
    expect(importConfiguration(exportConfiguration(configuration))).toEqual({ success: true, data: configuration });
    const duplicate = structuredClone(configuration);
    duplicate.controller!.keyboardAssignments!.push(structuredClone(duplicate.controller!.keyboardAssignments![0]!));
    expect(studioConfigurationSchema.safeParse(duplicate).success).toBe(false);
    const modifiers = structuredClone(configuration);
    modifiers.controller!.keyboardAssignments![0]!.combination.modifier2 = 1;
    expect(studioConfigurationSchema.safeParse(modifiers).success).toBe(false);
    const slot = structuredClone(configuration);
    slot.controller!.clearedInterfaceSlots!.push(15);
    expect(studioConfigurationSchema.safeParse(slot).success).toBe(false);
  });

  it.each([
    { slot: 0, message: { type: 'pc', channel: 1, program: 1 } },
    { slot: 0, channel: 1, data: 128, releaseValue: 0, pressValue: 127 },
    { slot: 0, channel: 1, data: 127, releaseValue: -1, pressValue: 127 },
    { slot: 16, channel: 1, data: 0, releaseValue: 0, pressValue: 127 },
    { slot: 0, channel: 17, data: 0, releaseValue: 0, pressValue: 127 },
  ])('rejects invalid or obsolete interface intent %#', (assignment) => {
    expect(studioConfigurationSchema.safeParse({ ...createDefaultConfiguration(),
      controller: { interfaceAssignments: [assignment] } }).success).toBe(false);
  });

  it.each([
    { mode: 256 }, { mode: -1 }, { mode: 0.5 }, { interfaceType: 2 }, { channelIndex: 16 },
    { visualA: 2 }, { customCommandD: 134 }, { interfaceCommand: 130 }, { pcMaxGroupIndex: 32 },
    { ccMaxGroupIndex: 32 }, { advancedMaxGroupIndex: 8 }, { advancedGroupIndex: 8 },
    { keyboardGroupIndex: 6 }, { mixGroupIndex: 6 }, { polarity: 2 }, { bankMidi: 2 }, { pcDisplay: 2 },
    { unknown: 0 },
  ])('rejects invalid scalar intent %#', (controller) => {
    expect(studioConfigurationSchema.safeParse({ ...createDefaultConfiguration(), controller }).success).toBe(false);
  });
});
