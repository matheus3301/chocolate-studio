import { describe, expect, it } from 'vitest';
import {
  applyEquipmentAction, clearEquipmentActionBinding, compileEquipmentAction,
  createDefaultConfiguration, equipmentProfileSchema, exportConfiguration,
  getEquipmentProfile, importConfiguration, studioConfigurationSchema,
} from '../src/index.js';
import type { EquipmentActionInvocation, EquipmentProfile, StudioConfiguration } from '../src/index.js';

const m5 = getEquipmentProfile('line6.m5', '0.1.0')!;
const destination = { id: 'destination-1', name: 'Meu equipamento 🎸', channel: 1 };
const invoke = (preset: number): EquipmentActionInvocation => ({
  modelId: 'line6.m5', profileVersion: '0.1.0', actionId: 'select-preset',
  parameters: { 'preset-number': preset }, destinationId: destination.id,
});
const apply = (configuration: StudioConfiguration, preset = 1) =>
  applyEquipmentAction(configuration, 'group-1', 'A', 'primary', invoke(preset));

/** Entirely synthetic: a different slot range, offset, and ordered bank messages. */
function syntheticProfile(): EquipmentProfile {
  const profile = structuredClone(m5);
  profile.modelId = 'test.synthetic';
  profile.manufacturer = 'Synthetic fixture';
  profile.model = 'Non-hardware test device';
  profile.label = { en: 'Synthetic fixture', 'pt-BR': 'Dispositivo sintético' };
  profile.sources = [{ id: 'synthetic-source', publisher: 'Unit test author', title: 'Synthetic, not manufacturer evidence',
    revision: '1', url: 'https://example.invalid/synthetic' }];
  profile.setup = [{ id: 'channel', label: { en: 'Channel', 'pt-BR': 'Canal' }, instructions: profile.label,
    citations: [{ sourceId: 'synthetic-source', pdfPages: [1], section: 'Synthetic fixture' }] }];
  profile.connection.citations = profile.setup[0]!.citations.map((citation) => ({ ...citation, pdfPages: [...citation.pdfPages] }));
  profile.unavailable = [];
  profile.actions = [{ id: 'select-slot', label: { en: 'Select slot', 'pt-BR': 'Selecionar posição' },
    description: profile.label, parameters: { slot: { type: 'integer', label: profile.label, minimum: 10, maximum: 12, initial: 10 } },
    messages: [
      { type: 'cc', channel: 'destination', controller: 0, value: { constant: 7 } },
      { type: 'cc', channel: 'destination', controller: 32, value: { constant: 2 } },
      { type: 'pc', channel: 'destination', program: { parameter: 'slot', offset: -10 } },
    ], requirements: { capabilities: ['midi.cc', 'midi.pc'], setupIds: ['channel'] },
    citations: [{ sourceId: 'synthetic-source', pdfPages: [1], section: 'Synthetic fixture' }],
    hardwareVerification: { status: 'not-tested' } }];
  // Model imported JSON rather than aliasing label objects across the fixture.
  return equipmentProfileSchema.parse(JSON.parse(JSON.stringify(profile)));
}


describe('generic equipment compilation', () => {
  it.each([[1, 0, 1], [24, 23, 16]])('maps M5 preset %i to PC%i on channel %i', (preset, program, channel) => {
    expect(compileEquipmentAction(m5, 'select-preset', { 'preset-number': preset }, { ...destination, channel }))
      .toEqual([{ type: 'pc', channel, program, destinationId: destination.id }]);
  });

  it.each([0, 25, 1.5, NaN, Infinity])('rejects unsupported M5 preset %s without clamping', (preset) => {
    expect(() => compileEquipmentAction(m5, 'select-preset', { 'preset-number': preset }, destination)).toThrow();
  });

  it.each([0, 17, 1.5])('rejects channel %s', (channel) => {
    expect(() => compileEquipmentAction(m5, 'effect-on', {}, { ...destination, channel })).toThrow();
  });

  it.each([
    ['tap-tempo', {}, 64, 127], ['effect-off', {}, 11, 0], ['effect-on', {}, 11, 127],
    ['tuner-exit', {}, 69, 0], ['tuner-enter', {}, 69, 127],
    ['expression-position', { position: 0 }, 1, 0], ['expression-position', { position: 127 }, 1, 127],
  ] as const)('compiles %s with explicit state and no hidden messages', (action, parameters, controller, value) => {
    expect(compileEquipmentAction(m5, action, parameters, { ...destination, channel: 16 }))
      .toEqual([{ type: 'cc', channel: 16, controller, value, destinationId: destination.id }]);
  });

  it('uses a second profile range and ordered bank mapping without model conditionals', () => {
    const profile = syntheticProfile();
    expect(compileEquipmentAction(profile, 'select-slot', { slot: 12 }, destination)).toEqual([
      { type: 'cc', channel: 1, controller: 0, value: 7, destinationId: destination.id },
      { type: 'cc', channel: 1, controller: 32, value: 2, destinationId: destination.id },
      { type: 'pc', channel: 1, program: 2, destinationId: destination.id },
    ]);
    expect(() => compileEquipmentAction(profile, 'select-slot', { slot: 1 }, destination)).toThrow();
    const config = applyEquipmentAction(createDefaultConfiguration(), 'group-1', 'B', 'secondary', {
      modelId: profile.modelId, profileVersion: profile.profileVersion, actionId: 'select-slot',
      parameters: { slot: 10 }, destinationId: destination.id,
    }, { profiles: [profile] });
    expect(config.groups[0]!.switches.B.secondaryMessages?.map((message) => message.type)).toEqual(['cc', 'cc', 'pc']);
    expect(importConfiguration(exportConfiguration(config))).toEqual({ success: true, data: config });
  });

  it('rejects missing/extra parameters, unavailable actions and mismatched model versions', () => {
    expect(() => compileEquipmentAction(m5, 'select-preset', {}, destination)).toThrow();
    expect(() => compileEquipmentAction(m5, 'effect-on', { position: 1 }, destination)).toThrow();
    expect(() => compileEquipmentAction(m5, 'midi-clock-sync', {}, destination)).toThrow();
    expect(() => compileEquipmentAction(m5, 'effect-on', {}, {
      ...destination, profile: { modelId: 'line6.m5', profileVersion: '9.0.0' },
    })).toThrow();
    expect(getEquipmentProfile('line6.m5', '9.0.0')).toBeUndefined();
  });

  it('rejects corrupt ranges, unresolved bindings/evidence, duplicate IDs, and executable transforms', () => {
    for (const mutate of [
      (p: EquipmentProfile) => { p.actions[0]!.messages = [{ type: 'pc', channel: 'destination', program: { parameter: 'preset-number', offset: 127 } }]; },
      (p: EquipmentProfile) => { p.actions[0]!.parameters['preset-number']!.initial = 25; },
      (p: EquipmentProfile) => { p.actions[0]!.messages = [{ type: 'pc', channel: 'destination', program: { parameter: 'missing', offset: 0 } }]; },
      (p: EquipmentProfile) => { p.actions[0]!.citations[0]!.sourceId = 'missing'; },
      (p: EquipmentProfile) => { p.actions.push(structuredClone(p.actions[0]!)); },
      (p: EquipmentProfile) => { p.actions[0]!.requirements.capabilities = []; },
    ]) {
      const profile = structuredClone(m5);
      mutate(profile);
      expect(equipmentProfileSchema.safeParse(profile).success).toBe(false);
    }
    const executable = JSON.parse(JSON.stringify(m5));
    executable.actions[0].messages[0].program = { eval: 'preset - 1' };
    expect(equipmentProfileSchema.safeParse(executable).success).toBe(false);
    const untranslated = JSON.parse(JSON.stringify(m5));
    delete untranslated.actions[0].label['pt-BR'];
    expect(equipmentProfileSchema.safeParse(untranslated).success).toBe(false);
  });

  it('rejects accessors and prototype-sensitive parameter keys before reading them', () => {
    let reads = 0;
    const profile = structuredClone(m5);
    Object.defineProperty(profile, 'modelId', { get() { reads++; return 'test.unsafe'; } });
    expect(equipmentProfileSchema.safeParse(profile).success).toBe(false);
    expect(reads).toBe(0);
    expect(() => compileEquipmentAction(m5, 'effect-on', JSON.parse('{"__proto__":1}'), destination)).toThrow();
  });
});

describe('versioned action bindings and preservation', () => {
  it('applies tap/hold to one switch while preserving other gestures, names and raw sequences', () => {
    const initial = createDefaultConfiguration({ name: 'Canção 日本語 🎸' });
    initial.groups[0]!.switches.A.actions.push({ gesture: 'release', messages: [{ type: 'cc', channel: 16, controller: 80, value: 2 }] });
    const snapshot = structuredClone(initial);
    const primary = apply(initial);
    const both = applyEquipmentAction(primary, 'group-1', 'A', 'secondary', invoke(2), { behavior: 'shortLong' });
    expect(initial).toEqual(snapshot);
    expect(both.formatVersion).toBe(2);
    expect(both.groups[0]!.switches.A).toMatchObject({ behavior: 'shortLong', secondaryMessages: [{ type: 'pc', program: 1 }],
      actionBindings: { primary: invoke(1), secondary: invoke(2) } });
    expect(both.groups[0]!.switches.B).toEqual(initial.groups[0]!.switches.B);
    expect(both.groups[0]!.switches.A.actions[1]).toEqual(initial.groups[0]!.switches.A.actions[1]);
    expect(both.name).toBe(initial.name);
    expect(importConfiguration(exportConfiguration(both))).toEqual({ success: true, data: both });
  });

  it('imports/exports v1 losslessly without guessing bindings from matching raw PC', () => {
    const legacy = createDefaultConfiguration({ name: 'Legado 清音' });
    legacy.formatVersion = 1;
    legacy.groups[0]!.switches.A.behavior = 'alternate';
    legacy.groups[0]!.switches.A.secondaryMessages = [{ type: 'cc', channel: 16, controller: 69, value: 127 }];
    const parsed = importConfiguration(JSON.stringify(legacy));
    expect(parsed).toEqual({ success: true, data: legacy });
    expect(parsed.success && parsed.data.groups[0]!.switches.A.actionBindings).toBeUndefined();
    expect(parsed.success && importConfiguration(exportConfiguration(parsed.data))).toEqual(parsed);
    const upgraded = apply(legacy);
    expect(upgraded.formatVersion).toBe(2);
    expect(upgraded.groups[0]!.switches.A.secondaryMessages).toEqual(legacy.groups[0]!.switches.A.secondaryMessages);
    expect(upgraded.groups[0]!.switches.A.behavior).toBe('alternate');
  });

  it('rejects equipment metadata disguised as version 1', () => {
    const configuration = apply(createDefaultConfiguration());
    expect(studioConfigurationSchema.safeParse({ ...configuration, formatVersion: 1 }).success).toBe(false);
  });

  it('rejects stale raw messages, parameter edits, channel edits and destination/profile mismatches', () => {
    const original = apply(createDefaultConfiguration());
    const mutations = [
      (c: StudioConfiguration) => { c.groups[0]!.switches.A.actions[0]!.messages[0] = { type: 'pc', channel: 1, program: 5, destinationId: destination.id }; },
      (c: StudioConfiguration) => { c.groups[0]!.switches.A.actionBindings!.primary!.parameters['preset-number'] = 2; },
      (c: StudioConfiguration) => { c.destinations[0]!.channel = 16; },
      (c: StudioConfiguration) => { c.groups[0]!.switches.A.actionBindings!.primary!.destinationId = 'missing'; },
      (c: StudioConfiguration) => { c.destinations[0]!.profile!.modelId = 'test.other'; },
    ];
    for (const mutate of mutations) {
      const configuration = structuredClone(original);
      mutate(configuration);
      expect(importConfiguration(JSON.stringify(configuration)).success).toBe(false);
      expect(() => exportConfiguration(configuration)).toThrow();
    }
  });

  it('requires explicit detach for raw edits and only clears the chosen binding', () => {
    const primary = apply(createDefaultConfiguration());
    const both = applyEquipmentAction(primary, 'group-1', 'A', 'secondary', invoke(2));
    const detached = clearEquipmentActionBinding(both, 'group-1', 'A', 'primary');
    expect(detached.groups[0]!.switches.A.actions).toEqual(both.groups[0]!.switches.A.actions);
    detached.groups[0]!.switches.A.actions[0]!.messages = [{ type: 'pc', channel: 16, program: 127 }];
    expect(detached.groups[0]!.switches.A.actionBindings).toEqual({ secondary: invoke(2) });
    expect(both.groups[0]!.switches.A.actionBindings!.primary).toEqual(invoke(1));
    expect(importConfiguration(exportConfiguration(detached))).toEqual({ success: true, data: detached });
  });

  it('preserves unknown pinned versions with raw fallback and never interprets as latest', () => {
    const configuration = apply(createDefaultConfiguration());
    configuration.destinations[0]!.profile!.profileVersion = '9.0.0';
    configuration.groups[0]!.switches.A.actionBindings!.primary!.profileVersion = '9.0.0';
    configuration.groups[0]!.switches.A.actions[0]!.messages[0] = { type: 'pc', channel: 1, program: 99, destinationId: destination.id };
    expect(importConfiguration(exportConfiguration(configuration))).toEqual({ success: true, data: configuration });
    expect(() => applyEquipmentAction(configuration, 'group-1', 'A', 'primary', { ...invoke(1), profileVersion: '9.0.0' })).toThrow();
  });

  it('rejects invalid targets/actions atomically rather than changing a different location', () => {
    const original = apply(createDefaultConfiguration());
    const snapshot = structuredClone(original);
    expect(() => applyEquipmentAction(original, 'missing', 'A', 'primary', invoke(2))).toThrow();
    expect(() => applyEquipmentAction(original, 'group-1', 'A', 'primary', { ...invoke(2), destinationId: 'missing' })).toThrow();
    expect(() => applyEquipmentAction(original, 'group-1', 'A', 'secondary', invoke(25))).toThrow();
    expect(original).toEqual(snapshot);
  });
});
