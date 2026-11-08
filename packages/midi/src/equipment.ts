import { z } from 'zod';
import profileData from './equipment-profiles.json' with { type: 'json' };
import { equipmentActionParametersSchema, equipmentProfileReferenceSchema, equipmentProfileSchema } from './equipment-schema.js';
import type { EquipmentActionParameters, EquipmentLocale, EquipmentProfile, EquipmentText } from './equipment-schema.js';
import { identifierSchema, midiChannelSchema } from './messages.js';
import type { MidiMessage } from './messages.js';
import type { Destination } from './configuration.js';
import { safeJsonTreeSchema } from './safe-json.js';

function freezeTree<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freezeTree(child);
    Object.freeze(value);
  }
  return value;
}

/** Bundled data only. Adding a profile in this vocabulary does not change code. */
export const equipmentProfiles: readonly EquipmentProfile[] = freezeTree(z.array(equipmentProfileSchema).max(128)
  .superRefine((profiles, ctx) => {
    const ids = new Set<string>();
    profiles.forEach((profile, index) => {
      const key = `${profile.modelId}@${profile.profileVersion}`;
      if (ids.has(key)) ctx.addIssue({ code: 'custom', path: [index], message: 'Duplicate model/version' });
      ids.add(key);
    });
  }).parse(profileData));
const bundledProfiles = new WeakSet(equipmentProfiles);

function newerVersion(left: string, right: string): boolean {
  const a = left.split('.');
  const b = right.split('.');
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i]!.length !== b[i]!.length ? a[i]!.length > b[i]!.length : a[i]! > b[i]!;
  }
  return false;
}

/** Omitted version selects newest bundled semver; persisted references always pin it. */
export function getEquipmentProfile(modelId: string, profileVersion?: string): EquipmentProfile | undefined {
  let result: EquipmentProfile | undefined;
  for (const profile of equipmentProfiles) {
    if (profile.modelId !== modelId) continue;
    if (profileVersion !== undefined) {
      if (profile.profileVersion === profileVersion) return profile;
    } else if (result === undefined || newerVersion(profile.profileVersion, result.profileVersion)) result = profile;
  }
  return result;
}

export function localizeEquipmentText(text: EquipmentText, locale: EquipmentLocale): string {
  return text[locale];
}

export class EquipmentActionError extends Error {
  constructor(public readonly code: 'action' | 'parameters' | 'profile' | 'destination' | 'group' | 'switch' | 'sequence', message: string) {
    super(message);
    this.name = 'EquipmentActionError';
  }
}
const parametersSchema = safeJsonTreeSchema.pipe(equipmentActionParametersSchema);
const compileDestinationSchema = safeJsonTreeSchema.pipe(z.object({
  id: identifierSchema, channel: midiChannelSchema, profile: equipmentProfileReferenceSchema.optional(),
}));

/** Pure PC/CC intent compilation. No timing, hardware state, capability grant, or I/O. */
export function compileEquipmentAction(
  profile: EquipmentProfile,
  actionId: string,
  parameters: EquipmentActionParameters,
  destination: Destination,
): MidiMessage[] {
  const checked = bundledProfiles.has(profile) ? profile : equipmentProfileSchema.parse(profile);
  const target = compileDestinationSchema.parse(destination);
  if (target.profile && (target.profile.modelId !== checked.modelId || target.profile.profileVersion !== checked.profileVersion)) {
    throw new EquipmentActionError('profile', 'Destination references a different equipment model/version');
  }
  const action = checked.actions.find((candidate) => candidate.id === actionId);
  if (!action) throw new EquipmentActionError('action', 'Unknown or unavailable equipment action');
  const args = parametersSchema.parse(parameters);
  if (Object.keys(args).length !== Object.keys(action.parameters).length) {
    throw new EquipmentActionError('parameters', 'Expected exactly the declared action parameters');
  }
  for (const [id, spec] of Object.entries(action.parameters)) {
    const value = args[id];
    if (value === undefined || value < spec.minimum || value > spec.maximum) {
      throw new EquipmentActionError('parameters', `Action parameter outside declared range: ${id}`);
    }
  }
  return action.messages.map((message): MidiMessage => {
    const binding = message.type === 'pc' ? message.program : message.value;
    const value = 'constant' in binding ? binding.constant : args[binding.parameter]! + binding.offset;
    if (message.type === 'pc') return { type: 'pc', channel: target.channel, program: value, destinationId: target.id };
    return { type: 'cc', channel: target.channel, controller: message.controller, value, destinationId: target.id };
  });
}

/** Semantic equality ignores JSON key order, not MIDI ordering or omitted bank bytes. */
export function sameMidiMessages(left: readonly MidiMessage[], right: readonly MidiMessage[]): boolean {
  return left.length === right.length && left.every((a, i) => {
    const b = right[i]!;
    if (a.type !== b.type || a.channel !== b.channel || a.destinationId !== b.destinationId) return false;
    if (a.type === 'cc' && b.type === 'cc') return a.controller === b.controller && a.value === b.value;
    return a.type === 'pc' && b.type === 'pc' && a.program === b.program &&
      a.bank?.msb === b.bank?.msb && a.bank?.lsb === b.bank?.lsb;
  });
}
