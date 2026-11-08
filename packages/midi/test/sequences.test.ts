import { expect, it } from 'vitest';
import {
  SWITCH_IDS, createDefaultConfiguration, exportConfiguration,
  importConfiguration, studioConfigurationSchema,
} from '../src/index.js';
import type { SwitchBehavior } from '../src/index.js';

it.each(['single', 'alternate', 'momentary', 'long', 'shortLong'] satisfies SwitchBehavior[])
('roundtrips %s behavior with both ordered sequences', (behavior) => {
  const configuration = createDefaultConfiguration();
  const footswitch = configuration.groups[0]!.switches.A;
  footswitch.behavior = behavior;
  footswitch.secondaryMessages = [
    { type: 'cc', channel: 16, controller: 80, value: 0, destinationId: 'destination-1' },
    { type: 'pc', channel: 1, program: 127, bank: { msb: 0, lsb: 127 } },
  ];
  expect(importConfiguration(exportConfiguration(configuration))).toEqual({ success: true, data: configuration });
});

it('preserves the version 1 contract for files without sequence fields', () => {
  const legacy = createDefaultConfiguration();
  legacy.formatVersion = 1;
  const imported = importConfiguration(JSON.stringify(legacy));
  expect(imported).toEqual({ success: true, data: legacy });
  if (!imported.success) throw new Error('Expected legacy configuration');
  expect(exportConfiguration(imported.data)).toBe(exportConfiguration(legacy));
});

it('rejects unsupported behavior names, bad secondary data and unresolved references', () => {
  const configuration = createDefaultConfiguration();
  const footswitch = configuration.groups[0]!.switches.A;
  const badSwitches = [
    { ...footswitch, behavior: 'unknown' },
    { ...footswitch, secondaryMessages: [{ type: 'cc', channel: 1, controller: 80, value: 128 }] },
    { ...footswitch, secondaryMessages: [{ type: 'pc', channel: 1, program: 0, destinationId: 'missing' }] },
    { ...footswitch, secondaryMessages: Array.from({ length: 33 }, () => ({ type: 'pc', channel: 1, program: 0 })) },
  ];
  for (const invalid of badSwitches) {
    expect(studioConfigurationSchema.safeParse({ ...configuration, groups: [{ ...configuration.groups[0]!,
      switches: { ...configuration.groups[0]!.switches, A: invalid },
    }] }).success).toBe(false);
  }
});

it('counts secondary sequences toward the aggregate message limit', () => {
  const configuration = createDefaultConfiguration();
  configuration.groups = Array.from({ length: 64 }, (_, index) => {
    const group = structuredClone(configuration.groups[0]!);
    group.id = `group-${index}`;
    for (const key of SWITCH_IDS) group.switches[key].actions[0]!.messages =
      Array.from({ length: 16 }, () => ({ type: 'pc' as const, channel: 1, program: 0 }));
    return group;
  });
  expect(studioConfigurationSchema.safeParse(configuration).success).toBe(true);
  configuration.groups[0]!.switches.A.secondaryMessages = [{ type: 'pc', channel: 1, program: 0 }];
  const result = studioConfigurationSchema.safeParse(configuration);
  expect(result.success).toBe(false);
  if (result.success) throw new Error('Expected aggregate message limit');
  expect(result.error.issues).toContainEqual(expect.objectContaining({ message: 'Total message limit exceeded' }));
});
