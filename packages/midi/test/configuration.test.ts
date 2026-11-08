import { describe, expect, it } from 'vitest';
import {
  CONFIGURATION_LIMITS, SWITCH_IDS, createDefaultConfiguration,
  exportConfiguration, importConfiguration, studioConfigurationSchema,
} from '../src/index.js';
import type { StudioConfiguration } from '../src/index.js';

function message(configuration: StudioConfiguration) {
  return configuration.groups[0]!.switches.A.actions[0]!.messages[0]!;
}

describe('versioned configuration', () => {
  it('roundtrips custom Unicode names, gestures, explicit channels, CC and named presets', () => {
    const configuration = createDefaultConfiguration({ name: 'Minha música — 日本語 🎸', destinationName: 'Destino próprio' });
    configuration.groups[0]!.name = 'Canção ção';
    configuration.groups[0]!.switches.A.label = '清音';
    configuration.groups[0]!.switches.A.actions.push({ gesture: 'longPress', messages: [
      { type: 'cc', channel: 16, controller: 127, value: 0, destinationId: 'destination-1' },
      { type: 'pc', channel: 1, program: 127, bank: { msb: 0, lsb: 127 } },
    ] });
    configuration.presets.push({ id: 'preset-1', name: 'Som limpo', channel: 1, program: 0,
      destinationId: 'destination-1', bank: { msb: 0 } });
    const json = exportConfiguration(configuration);
    expect(json).toContain('Minha música — 日本語 🎸');
    expect(importConfiguration(json)).toEqual({ success: true, data: configuration });
    const reordered = Object.fromEntries(Object.entries(configuration).reverse()) as StudioConfiguration;
    expect(exportConfiguration(reordered)).toBe(json);
    const imported = importConfiguration(json);
    if (!imported.success) throw new Error('Expected successful import');
    imported.data.destinations[0]!.name = 'Edited draft';
    expect(configuration.destinations[0]!.name).toBe('Destino próprio');
  });

  it('rejects unknown versions, unknown keys, and malformed JSON', () => {
    const configuration = createDefaultConfiguration();
    expect(importConfiguration('{ broken')).toMatchObject({ success: false, error: { code: 'syntax' } });
    for (const input of [null, [], { ...configuration, formatVersion: 2 },
      { ...configuration, unexpected: true }, { ...configuration, presets: undefined }]) {
      expect(importConfiguration(JSON.stringify(input)).success).toBe(false);
    }
  });

  it('rejects dangling message and preset references and duplicate entity IDs', () => {
    const dangling = createDefaultConfiguration();
    message(dangling).destinationId = 'missing';
    expect(studioConfigurationSchema.safeParse(dangling).success).toBe(false);
    const preset = createDefaultConfiguration();
    preset.presets.push({ id: 'preset-1', name: 'Name', channel: 1, program: 0, destinationId: 'missing' });
    expect(studioConfigurationSchema.safeParse(preset).success).toBe(false);
    const duplicates = createDefaultConfiguration();
    duplicates.destinations.push({ ...duplicates.destinations[0]! });
    expect(studioConfigurationSchema.safeParse(duplicates).success).toBe(false);
    const crossKind = createDefaultConfiguration();
    crossKind.groups[0]!.id = crossKind.destinations[0]!.id;
    expect(studioConfigurationSchema.safeParse(crossKind).success).toBe(false);
  });

  it('requires all four switches and at most one action per gesture', () => {
    const configuration = createDefaultConfiguration();
    const group = configuration.groups[0]!;
    const { D: _removed, ...incomplete } = group.switches;
    expect(studioConfigurationSchema.safeParse({ ...configuration,
      groups: [{ ...group, switches: incomplete }] }).success).toBe(false);
    group.switches.A.actions.push(structuredClone(group.switches.A.actions[0]!));
    expect(studioConfigurationSchema.safeParse(configuration).success).toBe(false);
  });

  it.each([
    { type: 'pc', channel: 0, program: 0 }, { type: 'pc', channel: 17, program: 0 },
    { type: 'pc', channel: 1, program: 128 }, { type: 'pc', channel: 1, program: -1 },
    { type: 'pc', channel: 1, program: 0, bank: {} },
    { type: 'pc', channel: 1, program: 0, bank: { msb: 128 } },
    { type: 'cc', channel: 1, controller: 128, value: 0 },
    { type: 'cc', channel: 1, controller: 0, value: -1 },
  ])('rejects corrupt message %#', (invalid) => {
    const configuration = createDefaultConfiguration();
    const action = configuration.groups[0]!.switches.A.actions[0]!;
    expect(studioConfigurationSchema.safeParse({ ...configuration, groups: [{ ...configuration.groups[0]!,
      switches: { ...configuration.groups[0]!.switches, A: { label: 'A', actions: [{ ...action, messages: [invalid] }] } },
    }] }).success).toBe(false);
  });

  it('keeps explicit message channels independent from destination defaults', () => {
    const configuration = createDefaultConfiguration();
    configuration.destinations[0]!.channel = 16;
    const parsed = studioConfigurationSchema.parse(configuration);
    expect(message(parsed).channel).toBe(1);
  });
});

describe('untrusted input limits', () => {
  it.each(['__proto__', 'constructor', 'prototype'])('rejects dangerous key %s and reserved IDs', (key) => {
    const json = exportConfiguration(createDefaultConfiguration());
    const injected = json.replace('"formatVersion": 1', `"${key}": {"polluted": true}, "formatVersion": 1`);
    expect(importConfiguration(injected).success).toBe(false);
    const configuration = createDefaultConfiguration();
    configuration.destinations[0]!.id = key;
    expect(studioConfigurationSchema.safeParse(configuration).success).toBe(false);
    expect(Object.hasOwn(Object.prototype, 'polluted')).toBe(false);
  });

  it('rejects accessors without executing them and rejects cyclic input', () => {
    const configuration = createDefaultConfiguration();
    let reads = 0;
    Object.defineProperty(configuration, 'name', { get() { reads++; return 'Unsafe'; } });
    expect(studioConfigurationSchema.safeParse(configuration).success).toBe(false);
    expect(reads).toBe(0);
    const cycle: Record<string, unknown> = {};
    cycle['self'] = cycle;
    expect(studioConfigurationSchema.safeParse(cycle).success).toBe(false);
  });

  it('enforces UTF-8 byte size and bounds deeply nested input', () => {
    expect(importConfiguration(' '.repeat(CONFIGURATION_LIMITS.jsonBytes + 1)))
      .toMatchObject({ success: false, error: { code: 'size' } });
    expect(importConfiguration(JSON.stringify({ value: 'é'.repeat(600_000) })))
      .toMatchObject({ success: false, error: { code: 'size' } });
    expect(importConfiguration('['.repeat(100) + '0' + ']'.repeat(100)).success).toBe(false);
  });

  it('enforces names, group counts and per-action message limits', () => {
    const configuration = createDefaultConfiguration();
    expect(studioConfigurationSchema.safeParse({ ...configuration, name: 'x'.repeat(129) }).success).toBe(false);
    expect(studioConfigurationSchema.safeParse({ ...configuration, groups: [] }).success).toBe(false);
    configuration.groups = Array.from({ length: 65 }, (_, i) => ({
      ...structuredClone(configuration.groups[0]!), id: `group-${i}`,
    }));
    expect(studioConfigurationSchema.safeParse(configuration).success).toBe(false);
    const tooMany = createDefaultConfiguration();
    tooMany.groups[0]!.switches.A.actions[0]!.messages = Array.from({ length: 33 }, () => ({
      type: 'pc', channel: 1, program: 0,
    }));
    expect(studioConfigurationSchema.safeParse(tooMany).success).toBe(false);
  });

  it('enforces aggregate messages even when each group and action is within bounds', () => {
    const configuration = createDefaultConfiguration();
    configuration.groups = Array.from({ length: 9 }, (_, i) => {
      const group = structuredClone(configuration.groups[0]!);
      group.id = `group-${i}`;
      for (const key of SWITCH_IDS) group.switches[key].actions =
        (['press', 'release', 'longPress', 'doublePress'] as const).map((gesture) => ({ gesture,
          messages: Array.from({ length: 32 }, () => ({ type: 'pc' as const, channel: 1, program: 0 })),
        }));
      return group;
    });
    const result = studioConfigurationSchema.safeParse(configuration);
    expect(result.success).toBe(false);
    if (result.success) throw new Error('Expected total message limit');
    expect(result.error.issues).toContainEqual(expect.objectContaining({ message: 'Total message limit exceeded' }));
    expect(() => exportConfiguration(configuration)).toThrow();
  });
});
