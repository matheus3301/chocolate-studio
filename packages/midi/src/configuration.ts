import { z } from 'zod';
import { bankSelectSchema, identifierSchema, midiChannelSchema, midiDataByteSchema, midiMessageSchema } from './messages.js';
import type { ProgramChange } from './messages.js';
import { equipmentActionInvocationSchema, equipmentProfileReferenceSchema } from './equipment-schema.js';
import { compileEquipmentAction, getEquipmentProfile, sameMidiMessages } from './equipment.js';
import { safeJsonTreeSchema } from './safe-json.js';
import { controllerSettingsSchema } from './controller.js';

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
  profile: equipmentProfileReferenceSchema.optional(),
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
  actionBindings: z.strictObject({
    primary: equipmentActionInvocationSchema.optional(),
    secondary: equipmentActionInvocationSchema.optional(),
  }).optional(),
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
  formatVersion: z.union([z.literal(1), z.literal(2)]),
  id: identifierSchema,
  name: nameSchema,
  destinations: z.array(destinationSchema).max(CONFIGURATION_LIMITS.destinations),
  groups: z.array(groupSchema).min(1).max(CONFIGURATION_LIMITS.groups),
  presets: z.array(presetSchema).max(CONFIGURATION_LIMITS.presets),
  controller: controllerSettingsSchema.optional(),
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
  value.destinations.forEach((destination, i) => {
    register(destination.id, ['destinations', i, 'id']);
    if (value.formatVersion === 1 && destination.profile !== undefined) {
      ctx.addIssue({ code: 'custom', path: ['destinations', i, 'profile'], message: 'Equipment metadata requires formatVersion 2' });
    }
  });
  value.presets.forEach((preset, i) => {
    register(preset.id, ['presets', i, 'id']);
    reference(preset.destinationId, ['presets', i, 'destinationId']);
  });
  let totalMessages = 0;
  value.groups.forEach((group, i) => {
    register(group.id, ['groups', i, 'id']);
    for (const key of SWITCH_IDS) {
      const footswitch = group.switches[key];
      if (value.formatVersion === 1 && footswitch.actionBindings !== undefined) {
        ctx.addIssue({ code: 'custom', path: ['groups', i, 'switches', key, 'actionBindings'], message: 'Equipment metadata requires formatVersion 2' });
      }
      for (const sequence of ['primary', 'secondary'] as const) {
        const binding = footswitch.actionBindings?.[sequence];
        if (!binding) continue;
        const path = ['groups', i, 'switches', key, 'actionBindings', sequence];
        const destination = value.destinations.find((entry) => entry.id === binding.destinationId);
        const raw = sequence === 'primary' ? footswitch.actions[0]?.messages ?? [] : footswitch.secondaryMessages ?? [];
        if (!destination || destination.profile?.modelId !== binding.modelId ||
          destination.profile.profileVersion !== binding.profileVersion) {
          ctx.addIssue({ code: 'custom', path, message: 'Action binding must match its destination profile' });
          continue;
        }
        if (raw.length === 0 || raw.some((message) =>
          message.destinationId !== destination.id || message.channel !== destination.channel)) {
          ctx.addIssue({ code: 'custom', path, message: 'Action binding routing does not match raw messages' });
          continue;
        }
        const profile = getEquipmentProfile(binding.modelId, binding.profileVersion);
        // A missing pinned version retains its raw fallback, never uses latest.
        if (profile) {
          try {
            const compiled = compileEquipmentAction(profile, binding.actionId, binding.parameters, destination);
            if (!sameMidiMessages(raw, compiled)) throw new Error('Stale action binding');
          } catch {
            ctx.addIssue({ code: 'custom', path, message: 'Action binding does not reproduce raw messages' });
          }
        }
      }
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
    formatVersion: 2,
    id: options.id ?? 'configuration-1',
    name: options.name ?? 'MIDI configuration',
    destinations: [{ id: 'destination-1', name: options.destinationName ?? 'MIDI destination', channel: 1 }],
    groups: [{ id: 'group-1', name: 'Group 1', switches }],
    presets: [],
  });
}
