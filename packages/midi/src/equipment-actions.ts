import { z } from 'zod';
import { SWITCH_IDS, studioConfigurationSchema, switchBehaviorSchema } from './configuration.js';
import type { StudioConfiguration, SwitchBehavior, SwitchId } from './configuration.js';
import { equipmentActionInvocationSchema } from './equipment-schema.js';
import type { EquipmentActionInvocation, EquipmentProfile } from './equipment-schema.js';
import { EquipmentActionError, compileEquipmentAction, equipmentProfiles } from './equipment.js';
import { exportConfiguration } from './json.js';

export type EquipmentSequence = 'primary' | 'secondary';
export interface ApplyEquipmentActionOptions {
  behavior?: SwitchBehavior;
  /** Optional complete registry, useful for validated custom profiles. */
  profiles?: readonly EquipmentProfile[];
}

function locate(configuration: StudioConfiguration, groupId: string, switchId: SwitchId, sequence: EquipmentSequence) {
  z.enum(SWITCH_IDS).parse(switchId);
  z.enum(['primary', 'secondary']).parse(sequence);
  const group = configuration.groups.find((entry) => entry.id === groupId);
  if (!group) throw new EquipmentActionError('group', 'Unknown group');
  return group.switches[switchId];
}

/** Changes one sequence and its intent metadata; does not infer bindings or gestures. */
export function applyEquipmentAction(
  configuration: StudioConfiguration,
  groupId: string,
  switchId: SwitchId,
  sequence: EquipmentSequence,
  invocation: EquipmentActionInvocation,
  options: ApplyEquipmentActionOptions = {},
): StudioConfiguration {
  const next = studioConfigurationSchema.parse(configuration);
  const footswitch = locate(next, groupId, switchId, sequence);
  const binding = equipmentActionInvocationSchema.parse(invocation);
  const profiles = options.profiles ?? equipmentProfiles;
  const matches = profiles.filter((profile) => profile.modelId === binding.modelId && profile.profileVersion === binding.profileVersion);
  if (matches.length !== 1) throw new EquipmentActionError('profile', 'Missing or ambiguous pinned equipment profile');
  const destination = next.destinations.find((entry) => entry.id === binding.destinationId);
  if (!destination) throw new EquipmentActionError('destination', 'Unknown destination');
  const messages = compileEquipmentAction(matches[0]!, binding.actionId, binding.parameters, destination);
  destination.profile = { modelId: binding.modelId, profileVersion: binding.profileVersion };
  if (sequence === 'primary') {
    if (footswitch.actions[0]) footswitch.actions[0].messages = messages;
    else footswitch.actions.push({ gesture: 'press', messages });
  } else footswitch.secondaryMessages = messages;
  footswitch.actionBindings ??= {};
  footswitch.actionBindings[sequence] = binding;
  if (options.behavior !== undefined) footswitch.behavior = switchBehaviorSchema.parse(options.behavior);
  next.formatVersion = 2;
  // Revalidate all bindings, aggregate limits and the serialized UTF-8 boundary.
  exportConfiguration(next);
  return next;
}

/** Explicitly detach only this sequence's label/intent before raw MIDI edits. */
export function clearEquipmentActionBinding(
  configuration: StudioConfiguration,
  groupId: string,
  switchId: SwitchId,
  sequence: EquipmentSequence,
): StudioConfiguration {
  const next = studioConfigurationSchema.parse(configuration);
  const footswitch = locate(next, groupId, switchId, sequence);
  if (footswitch.actionBindings) {
    delete footswitch.actionBindings[sequence];
    if (!footswitch.actionBindings.primary && !footswitch.actionBindings.secondary) delete footswitch.actionBindings;
  }
  return next;
}
