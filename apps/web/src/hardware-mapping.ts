import { decodeFcp, applyFcpPatches } from '@chocolate-studio/chocolate-layout';
import type { DecodedBank, FcpPatch, PcCcMessage } from '@chocolate-studio/chocolate-layout';
import { SWITCH_IDS, studioConfigurationSchema } from '@chocolate-studio/midi';
import type { MidiMessage, StudioConfiguration, SwitchBehavior } from '@chocolate-studio/midi';
import type { ControllerReadMetadata } from './hardware.js';

const behaviors: SwitchBehavior[] = ['single', 'alternate', 'momentary', 'long', 'shortLong'];
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
function expand(messages: MidiMessage[]): PcCcMessage[] {
  return messages.flatMap((message): PcCcMessage[] => {
    if (message.type === 'cc') return [{ type: 'cc', channel: message.channel, controller: message.controller, value: message.value }];
    return [
      ...(message.bank?.msb === undefined ? [] : [{ type: 'cc' as const, channel: message.channel, controller: 0, value: message.bank.msb }]),
      ...(message.bank?.lsb === undefined ? [] : [{ type: 'cc' as const, channel: message.channel, controller: 32, value: message.bank.lsb }]),
      { type: 'pc', channel: message.channel, program: message.program },
    ];
  });
}
const known = (bank: DecodedBank) => bank.records.flatMap(record => record.message ? [record.message] : []);

/** Decode supported advanced banks without treating hidden/unknown bytes as empty data. */
export function configurationFromBytes(bytes: Uint8Array, metadata?: StudioConfiguration) {
  const decoded = decodeFcp(bytes);
  const warnings: string[] = [];
  if (decoded.mode !== 3) warnings.push('hardware.advancedInactive');
  if (decoded.issues.length) warnings.push('hardware.unrecognizedFields');
  const count = Math.min(8, Math.max(1, decoded.globals.advancedMaxGroupIndex + 1));
  const configuration: StudioConfiguration = {
    formatVersion: metadata?.formatVersion ?? 1, id: metadata?.id ?? 'chocolate-configuration', name: metadata?.name ?? 'Chocolate Plus',
    destinations: structuredClone(metadata?.destinations ?? []), presets: structuredClone(metadata?.presets ?? []),
    groups: decoded.advancedGroups.slice(0, count).map((group, index) => {
      const previous = metadata?.groups[index];
      const switches = {} as StudioConfiguration['groups'][number]['switches'];
      for (const id of SWITCH_IDS) {
        const sw = group.switches[id];
        const primary = known(sw.bankA); const secondary = known(sw.bankB);
        if ([...sw.bankA.records, ...sw.bankB.records].some(record => record.enabled && !record.message)) warnings.push('hardware.unknownMessages');
        const previousSwitch = previous?.switches[id];
        const primaryMatches = previousSwitch?.actions.length === 1 &&
          !sw.bankA.records.some(record => record.enabled && !record.message) &&
          same(expand(previousSwitch.actions[0]!.messages), primary);
        const secondaryMatches = !!previousSwitch &&
          !sw.bankB.records.some(record => record.enabled && !record.message) &&
          same(expand(previousSwitch.secondaryMessages ?? []), secondary);
        const primaryMessages: MidiMessage[] = primaryMatches ? structuredClone(previousSwitch.actions[0]!.messages) : primary;
        const secondaryMessages: MidiMessage[] = secondaryMatches ? structuredClone(previousSwitch.secondaryMessages ?? []) : secondary;
        const retained = previousSwitch ? structuredClone(previousSwitch) : { label: id, actions: [] };
        if (retained.actionBindings) {
          if (!primaryMatches) delete retained.actionBindings.primary;
          if (!secondaryMatches) delete retained.actionBindings.secondary;
          if (!retained.actionBindings.primary && !retained.actionBindings.secondary) delete retained.actionBindings;
        }
        switches[id] = { ...retained, label: previousSwitch?.label ?? id,
          behavior: behaviors[sw.modeCode] ?? 'single',
          actions: primaryMessages.length ? [{ gesture: 'press', messages: primaryMessages }] : [], secondaryMessages };
      }
      return { id: previous?.id ?? `device-group-${index + 1}`, name: previous?.name ?? `Group ${index + 1}`, switches };
    }),
  };
  return { configuration: studioConfigurationSchema.parse(configuration), warnings: [...new Set(warnings)],
    controller: readControllerMetadata(bytes) };
}

/** Own observed raw0 = Program change A; raw3 = the mapped eight-group Advanced mode. */
export function readControllerMetadata(bytes: Uint8Array): ControllerReadMetadata {
  const decoded = decodeFcp(bytes);
  const bounded = (value: number, maximum: number): number | null => Number.isInteger(value) && value >= 0 && value <= maximum ? value : null;
  return {
    rawMode: decoded.mode,
    modeKind: decoded.mode === 0 ? 'program-change' : decoded.mode === 3 ? 'advanced' : 'unclassified',
    displayStyle: decoded.mode === 0 ? 'pc-number' : 'unobserved',
    storedAdvancedGroupIndex: bounded(decoded.globals.advancedGroupIndex, 7),
    storedAdvancedMaxGroupIndex: bounded(decoded.globals.advancedMaxGroupIndex, 7),
    pcDisplayEnabled: bounded(decoded.globals.pcDisplay, 1) === null ? null : decoded.globals.pcDisplay === 1,
    pcMaxGroupIndex: bounded(decoded.globals.pcMaxGroupIndex, 31),
    ccMaxGroupIndex: bounded(decoded.globals.ccMaxGroupIndex, 31),
  };
}

/** Patch the original image. Unsupported intent rejects the complete plan. */
export function configurationToBytes(baseline: Uint8Array, input: StudioConfiguration) {
  const config = studioConfigurationSchema.parse(input);
  const decoded = decodeFcp(baseline);
  const unsupported: string[] = [];
  const warnings = ['hardware.labelsLocal'];
  if (decoded.mode !== 3) warnings.push('hardware.enableAdvanced');
  if (config.groups.length > 8) unsupported.push('hardware.maxEightGroups');
  if (decoded.issues.length) unsupported.push('hardware.unrecognizedFields');
  const patches: FcpPatch[] = [];
  for (const [index, group] of config.groups.slice(0, 8).entries()) {
    const observedGroup = decoded.advancedGroups[index]!;
    for (const id of SWITCH_IDS) {
      const sw = group.switches[id];
      const observed = observedGroup.switches[id];
      if (sw.actions.length > 1 || sw.actions.some(action => action.gesture !== 'press')) {
        unsupported.push('hardware.useTwoSequences'); continue;
      }
      const modeCode = behaviors.indexOf(sw.behavior ?? 'single');
      if (modeCode !== observed.modeCode) patches.push({ kind: 'switchMode', groupIndex: index, switchId: id, modeCode });
      for (const [bank, messages, observedBank] of [
        ['A', expand(sw.actions[0]?.messages ?? []), observed.bankA],
        ['B', expand(sw.secondaryMessages ?? []), observed.bankB],
      ] as const) {
        if (messages.length > 16) { unsupported.push('hardware.maxSixteenMessages'); continue; }
        if (same(messages, known(observedBank))) continue;
        if (observedBank.records.some(record => record.enabled && !record.message)) {
          unsupported.push('hardware.preserveUnknownBank'); continue;
        }
        for (let slot = 0; slot < 16; slot++) {
          const location = { scope: 'advanced' as const, groupIndex: index, switchId: id, bank, slot };
          const message = messages[slot];
          if (message) patches.push({ kind: 'message', location, message });
          else if (observedBank.records[slot]!.enabled) patches.push({ kind: 'clearMessage', location });
        }
      }
    }
  }
  if (!unsupported.length) {
    patches.push({ kind: 'field', field: 'mode', value: 3 });
    patches.push({ kind: 'field', field: 'advancedMaxGroupIndex', value: config.groups.length - 1 });
    if (decoded.globals.advancedGroupIndex >= config.groups.length) patches.push({ kind: 'field', field: 'advancedGroupIndex', value: 0 });
  }
  return { bytes: unsupported.length ? baseline.slice() : applyFcpPatches(baseline, patches).bytes,
    warnings, unsupported: [...new Set(unsupported)] };
}
