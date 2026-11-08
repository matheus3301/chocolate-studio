import { SWITCH_IDS, compileEquipmentAction } from '@chocolate-studio/midi';
import type { Destination, EquipmentProfile, EquipmentSequence, MidiMessage, StudioConfiguration, SwitchConfiguration } from '@chocolate-studio/midi';

export function destinationHasBindings(configuration: StudioConfiguration, destinationId: string): boolean {
  return configuration.groups.some((group) => SWITCH_IDS.some((id) =>
    Object.values(group.switches[id].actionBindings ?? {}).some((binding) => binding?.destinationId === destinationId)));
}

export function destinationProfile(destination: Destination | undefined, profiles: readonly EquipmentProfile[]): EquipmentProfile | undefined {
  const reference = destination?.profile;
  if (!reference) return undefined;
  return profiles.find((profile) => profile.modelId === reference.modelId && profile.profileVersion === reference.profileVersion);
}

export function sequenceMessages(pedal: SwitchConfiguration, sequence: EquipmentSequence): MidiMessage[] {
  return sequence === 'primary' ? pedal.actions[0]?.messages ?? [] : pedal.secondaryMessages ?? [];
}

function messageValue(message: MidiMessage): unknown[] {
  return message.type === 'pc'
    ? [message.type, message.channel, message.destinationId, message.program, message.bank?.msb, message.bank?.lsb]
    : [message.type, message.channel, message.destinationId, message.controller, message.value];
}

/** Explicit, reproducible bindings only. Never infer musical intent from raw MIDI. */
export function boundEquipmentAction(configuration: StudioConfiguration, pedal: SwitchConfiguration, sequence: EquipmentSequence, profiles: readonly EquipmentProfile[]) {
  const binding = pedal.actionBindings?.[sequence];
  if (!binding) return undefined;
  const destination = configuration.destinations.find((entry) => entry.id === binding.destinationId);
  const profile = destinationProfile(destination, profiles);
  if (!destination || !profile || profile.modelId !== binding.modelId || profile.profileVersion !== binding.profileVersion) return undefined;
  const action = profile.actions.find((entry) => entry.id === binding.actionId);
  if (!action) return undefined;
  try {
    const compiled = compileEquipmentAction(profile, action.id, binding.parameters, destination);
    if (JSON.stringify(compiled.map(messageValue)) !== JSON.stringify(sequenceMessages(pedal, sequence).map(messageValue))) return undefined;
    return { binding, destination, profile, action };
  } catch {
    return undefined;
  }
}

/** Compare the physical command sequence; local destination metadata is not a MIDI byte. */
export function sameMidiCommands(left: readonly MidiMessage[], right: readonly MidiMessage[]): boolean {
  return left.length === right.length && left.every((message, index) => {
    const other = right[index]!;
    if (message.type !== other.type || message.channel !== other.channel) return false;
    return message.type === 'pc' && other.type === 'pc'
      ? message.program === other.program && message.bank?.msb === other.bank?.msb && message.bank?.lsb === other.bank?.lsb
      : message.type === 'cc' && other.type === 'cc' && message.controller === other.controller && message.value === other.value;
  });
}
