import {
  createDefaultConfiguration, exportConfiguration, studioConfigurationSchema, SWITCH_IDS,
  presetToProgramChange,
} from '@chocolate-studio/midi';
import type { Gesture, Group, MidiMessage, Preset, StudioConfiguration, SwitchId } from '@chocolate-studio/midi';

export type Locale = 'pt-BR' | 'en';
export const gestures: Gesture[] = ['press', 'release', 'longPress', 'doublePress'];
export type Sequence = 'primary' | 'secondary' | Gesture;

export function initialConfiguration(locale: Locale): StudioConfiguration {
  const configuration = createDefaultConfiguration({
    id: crypto.randomUUID(), name: locale === 'pt-BR' ? 'Meu pedalboard' : 'My pedalboard',
    destinationName: locale === 'pt-BR' ? 'Meu equipamento MIDI' : 'My MIDI gear',
  });
  const first = configuration.groups[0]!;
  first.name = locale === 'pt-BR' ? 'Grupo 1' : 'Group 1';
  for (const id of SWITCH_IDS) first.switches[id].label = `Preset ${SWITCH_IDS.indexOf(id) + 1}`;
  return configuration;
}

export function editGroup(configuration: StudioConfiguration, groupId: string, change: (group: Group) => void): StudioConfiguration {
  const next = structuredClone(configuration);
  const group = next.groups.find((entry) => entry.id === groupId);
  if (!group) throw new Error('Missing group');
  change(group);
  return next;
}

export function setMessages(configuration: StudioConfiguration, groupId: string, switchId: SwitchId, sequence: Sequence, messages: MidiMessage[]): StudioConfiguration {
  return editGroup(configuration, groupId, (group) => {
    const pedal = group.switches[switchId];
    // Raw edits deliberately remove only the label binding for the edited sequence.
    // Keeping a prior musical label would misrepresent the newly entered bytes.
    if (pedal.actionBindings) {
      if (sequence === 'secondary') delete pedal.actionBindings.secondary;
      else if (sequence === 'primary' || pedal.actions[0]?.gesture === sequence) delete pedal.actionBindings.primary;
      if (!pedal.actionBindings.primary && !pedal.actionBindings.secondary) delete pedal.actionBindings;
    }
    if (sequence === 'secondary') {
      pedal.secondaryMessages = structuredClone(messages);
      return;
    }
    const index = sequence === 'primary' ? 0 : pedal.actions.findIndex((action) => action.gesture === sequence);
    if (!messages.length) {
      if (index !== -1) pedal.actions.splice(index, 1);
    } else if (index === -1 || !pedal.actions[index]) {
      pedal.actions.push({ gesture: sequence === 'primary' ? 'press' : sequence, messages: structuredClone(messages) });
    } else {
      pedal.actions[index]!.messages = structuredClone(messages);
    }
  });
}

export function applyPreset(configuration: StudioConfiguration, groupId: string, switchId: SwitchId, sequence: Sequence, preset: Preset): StudioConfiguration {
  return setMessages(configuration, groupId, switchId, sequence, [presetToProgramChange(preset)]);
}

export function destinationIsUsed(configuration: StudioConfiguration, destinationId: string): boolean {
  return configuration.presets.some((preset) => preset.destinationId === destinationId) || configuration.groups.some((group) =>
    SWITCH_IDS.some((id) => group.switches[id].actions.some((action) => action.messages.some((message) => message.destinationId === destinationId)) ||
      group.switches[id].secondaryMessages?.some((message) => message.destinationId === destinationId)));
}

export function validConfiguration(configuration: StudioConfiguration): StudioConfiguration {
  // Full export also enforces the package's UTF-8 file-size ceiling.
  exportConfiguration(configuration);
  return studioConfigurationSchema.parse(configuration);
}

export function sameConfiguration(left: StudioConfiguration, right: StudioConfiguration): boolean {
  function equal(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
    if (Array.isArray(a)) {
      if (!Array.isArray(b) || a.length !== b.length) return false;
      for (let index = 0; index < a.length; index++) if (!equal(a[index], b[index])) return false;
      return true;
    }
    if (Array.isArray(b)) return false;
    const first = a as Record<string, unknown>;
    const second = b as Record<string, unknown>;
    const keys = Object.keys(first);
    if (keys.length !== Object.keys(second).length) return false;
    for (const key of keys) if (!Object.hasOwn(second, key) || !equal(first[key], second[key])) return false;
    return true;
  }
  return equal(left, right);
}

export interface Difference { path: string[]; before: string; after: string }
const display = (value: unknown) => value === undefined ? '—' : typeof value === 'string' ? value : JSON.stringify(value);

/** Full field-level comparison, including less-visible gestures/bank bytes and removed fields. */
export function differences(before: StudioConfiguration, after: StudioConfiguration): Difference[] {
  const result: Difference[] = [];
  const visit = (left: unknown, right: unknown, path: string[]) => {
    if (left === right) return;
    if (left !== null && right !== null && typeof left === 'object' && typeof right === 'object') {
      const a = left as Record<string, unknown>;
      const b = right as Record<string, unknown>;
      for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) visit(a[key], b[key], [...path, key]);
    } else {
      result.push({ path, before: display(left), after: display(right) });
    }
  };
  visit(before, after, []);
  return result;
}
