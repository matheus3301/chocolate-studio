import { z } from 'zod';
import { bankSelectSchema, identifierSchema, midiChannelSchema, midiDataByteSchema, midiMessageSchema } from './messages.js';
import type { ProgramChange } from './messages.js';

/** Application resource limits, not claims about controller capabilities. */
export const CONFIGURATION_LIMITS = Object.freeze({
  jsonBytes: 1_048_576,
  destinations: 32,
  groups: 64,
  presets: 256,
  actionsPerSwitch: 4,
  messagesPerAction: 32,
  totalMessages: 4096,
  nameLength: 128,
  labelLength: 64,
  idLength: 64,
});
export const SWITCH_IDS = ['A', 'B', 'C', 'D'] as const;
export type SwitchId = typeof SWITCH_IDS[number];
export const gestureSchema = z.enum(['press', 'release', 'longPress', 'doublePress']);
export type Gesture = z.infer<typeof gestureSchema>;
export const switchBehaviorSchema = z.enum(['single', 'alternate', 'momentary', 'long', 'shortLong']);
export type SwitchBehavior = z.infer<typeof switchBehaviorSchema>;
const nameSchema = z.string().min(1).max(CONFIGURATION_LIMITS.nameLength);

export const destinationSchema = z.strictObject({
  id: identifierSchema,
  name: nameSchema,
  channel: midiChannelSchema,
});
export type Destination = z.infer<typeof destinationSchema>;

/** A label and an actual MIDI program/bank reference, not an audio patch. */
export const presetSchema = z.strictObject({
  id: identifierSchema,
  name: nameSchema,
  channel: midiChannelSchema,
  program: midiDataByteSchema,
  bank: bankSelectSchema.optional(),
  destinationId: identifierSchema.optional(),
});
export type Preset = z.infer<typeof presetSchema>;

export const gestureActionSchema = z.strictObject({
  gesture: gestureSchema,
  messages: z.array(midiMessageSchema).min(1).max(CONFIGURATION_LIMITS.messagesPerAction),
});
export type GestureAction = z.infer<typeof gestureActionSchema>;

export const switchConfigurationSchema = z.strictObject({
  label: z.string().max(CONFIGURATION_LIMITS.labelLength),
  actions: z.array(gestureActionSchema).max(CONFIGURATION_LIMITS.actionsPerSwitch),
  behavior: switchBehaviorSchema.optional(),
  secondaryMessages: z.array(midiMessageSchema).max(CONFIGURATION_LIMITS.messagesPerAction).optional(),
}).superRefine((value, ctx) => {
  const seen = new Set<Gesture>();
  value.actions.forEach((action, index) => {
    if (seen.has(action.gesture)) {
      ctx.addIssue({ code: 'custom', path: ['actions', index, 'gesture'], message: 'Duplicate gesture' });
    }
    seen.add(action.gesture);
  });
});
export type SwitchConfiguration = z.infer<typeof switchConfigurationSchema>;

export const groupSchema = z.strictObject({
  id: identifierSchema,
  name: nameSchema,
  switches: z.strictObject({
    A: switchConfigurationSchema,
    B: switchConfigurationSchema,
    C: switchConfigurationSchema,
    D: switchConfigurationSchema,
  }),
});
export type Group = z.infer<typeof groupSchema>;

const configurationShapeSchema = z.strictObject({
  formatVersion: z.literal(1),
  id: identifierSchema,
  name: nameSchema,
  destinations: z.array(destinationSchema).max(CONFIGURATION_LIMITS.destinations),
  groups: z.array(groupSchema).min(1).max(CONFIGURATION_LIMITS.groups),
  presets: z.array(presetSchema).max(CONFIGURATION_LIMITS.presets),
}).superRefine((value, ctx) => {
  const ids = new Set<string>([value.id]);
  const destinations = new Set(value.destinations.map((destination) => destination.id));
  const register = (id: string, path: (string | number)[]) => {
    if (ids.has(id)) ctx.addIssue({ code: 'custom', path, message: 'Duplicate identifier' });
    ids.add(id);
  };
  const reference = (id: string | undefined, path: (string | number)[]) => {
    if (id !== undefined && !destinations.has(id)) {
      ctx.addIssue({ code: 'custom', path, message: 'Unresolved destination' });
    }
  };
  value.destinations.forEach((destination, i) => register(destination.id, ['destinations', i, 'id']));
  value.presets.forEach((preset, i) => {
    register(preset.id, ['presets', i, 'id']);
    reference(preset.destinationId, ['presets', i, 'destinationId']);
  });
  let totalMessages = 0;
  value.groups.forEach((group, i) => {
    register(group.id, ['groups', i, 'id']);
    for (const key of SWITCH_IDS) {
      group.switches[key].actions.forEach((action, j) => {
        totalMessages += action.messages.length;
        action.messages.forEach((message, k) => {
          reference(message.destinationId, ['groups', i, 'switches', key, 'actions', j, 'messages', k, 'destinationId']);
        });
      });
      const secondary = group.switches[key].secondaryMessages ?? [];
      totalMessages += secondary.length;
      secondary.forEach((message, k) => {
        reference(message.destinationId, ['groups', i, 'switches', key, 'secondaryMessages', k, 'destinationId']);
      });
    }
  });
  if (totalMessages > CONFIGURATION_LIMITS.totalMessages) {
    ctx.addIssue({ code: 'custom', path: ['groups'], message: 'Total message limit exceeded' });
  }
});

// Validate the JSON tree before Zod reads properties: no accessors, cycles,
// custom prototypes, symbols, or prototype-sensitive property keys.
const safeJsonTreeSchema = z.unknown().superRefine((input, ctx) => {
  const pending = [{ value: input, depth: 0 }];
  const seen = new Set<object>();
  let nodes = 0;
  while (pending.length) {
    const entry = pending.pop()!;
    const { value, depth } = entry;
    if (++nodes > 100_000 || depth > 16) {
      ctx.addIssue({ code: 'custom', message: 'Configuration tree exceeds resource limits' });
      return;
    }
    if (value === null || typeof value !== 'object') continue;
    const prototype: unknown = Object.getPrototypeOf(value);
    if (seen.has(value) || Object.getOwnPropertySymbols(value).length !== 0 ||
      (prototype !== null && prototype !== (Array.isArray(value) ? Array.prototype : Object.prototype))) {
      ctx.addIssue({ code: 'custom', message: 'Expected a plain, non-cyclic JSON tree' });
      return;
    }
    seen.add(value);
    for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
      if (['__proto__', 'constructor', 'prototype'].includes(key) || !('value' in descriptor)) {
        ctx.addIssue({ code: 'custom', message: 'Unsafe property in configuration' });
        return;
      }
      if (Array.isArray(value) && key === 'length') continue;
      pending.push({ value: descriptor.value as unknown, depth: depth + 1 });
    }
  }
});

/** Structural intent validation only. Success never establishes hardware support. */
export const studioConfigurationSchema = safeJsonTreeSchema.pipe(configurationShapeSchema);
export type StudioConfiguration = z.infer<typeof studioConfigurationSchema>;

export function presetToProgramChange(input: Preset): ProgramChange {
  const { id: _id, name: _name, ...reference } = presetSchema.parse(input);
  return { type: 'pc', ...reference };
}

export interface DefaultConfigurationOptions {
  id?: string;
  name?: string;
  destinationName?: string;
}

export function createDefaultConfiguration(options: DefaultConfigurationOptions = {}): StudioConfiguration {
  const switches = Object.fromEntries(SWITCH_IDS.map((key, program) => [key, {
    label: `Preset ${program + 1}`,
    actions: [{ gesture: 'press', messages: [{ type: 'pc', channel: 1, program, destinationId: 'destination-1' }] }],
  }]));
  return studioConfigurationSchema.parse({
    formatVersion: 1,
    id: options.id ?? 'configuration-1',
    name: options.name ?? 'MIDI configuration',
    destinations: [{ id: 'destination-1', name: options.destinationName ?? 'MIDI destination', channel: 1 }],
    groups: [{ id: 'group-1', name: 'Group 1', switches }],
    presets: [],
  });
}
