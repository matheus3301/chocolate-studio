import { decodeFcp, applyFcpPatches, FCP_FIELDS } from '@chocolate-studio/chocolate-layout';
import type { DecodedBank, DecodedGroup, FcpField, FcpPatch, MessageLocation, PcCcMessage } from '@chocolate-studio/chocolate-layout';
import { SWITCH_IDS, getControllerMode, studioConfigurationSchema } from '@chocolate-studio/midi';
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
const known = (bank: DecodedBank): PcCcMessage[] => bank.records.flatMap(record =>
  record.message?.type === 'pc' || record.message?.type === 'cc' ? [record.message] : []);
const hasOpaque = (bank: DecodedBank) => bank.records.some(record =>
  record.enabled && record.message?.type !== 'pc' && record.message?.type !== 'cc');

function readGroups(groups: readonly Pick<DecodedGroup, 'switches'>[], previousGroups: StudioConfiguration['groups'] | undefined,
  warnings: string[], prefix: string, usedIds: Set<string>): StudioConfiguration['groups'] {
  return groups.map((group, index) => {
    const previous = previousGroups?.[index];
    const switches = {} as StudioConfiguration['groups'][number]['switches'];
    for (const id of SWITCH_IDS) {
      const sw = group.switches[id];
      const primary = known(sw.bankA); const secondary = known(sw.bankB);
      if (hasOpaque(sw.bankA) || hasOpaque(sw.bankB)) warnings.push('hardware.unknownMessages');
      const previousSwitch = previous?.switches[id];
      const primaryMatches = previousSwitch?.actions.length === 1 &&
        !hasOpaque(sw.bankA) &&
        same(expand(previousSwitch.actions[0]!.messages), primary);
      const secondaryMatches = !!previousSwitch &&
        !hasOpaque(sw.bankB) &&
        same(expand(previousSwitch.secondaryMessages ?? []), secondary);
      const primaryMessages: MidiMessage[] = primaryMatches ? structuredClone(previousSwitch.actions[0]!.messages) : primary;
      const secondaryMessages: MidiMessage[] = secondaryMatches ? structuredClone(previousSwitch.secondaryMessages ?? []) : secondary;
      const retained = previousSwitch ? structuredClone(previousSwitch) : { label: id, actions: [] };
      if (retained.actionBindings) {
        if (!primaryMatches) delete retained.actionBindings.primary;
        if (!secondaryMatches) delete retained.actionBindings.secondary;
        if (!retained.actionBindings.primary && !retained.actionBindings.secondary) delete retained.actionBindings;
      }
      switches[id] = { ...retained, label: previousSwitch?.label ?? id, behavior: behaviors[sw.modeCode],
        actions: primaryMessages.length ? [{ gesture: 'press', messages: primaryMessages }] : [], secondaryMessages };
    }
    let id = previous?.id;
    if (id === undefined) {
      const base = `${prefix}-${index + 1}`;
      id = base;
      let suffix = 2;
      while (usedIds.has(id)) id = `${base}-${suffix++}`;
      usedIds.add(id);
    }
    return { id, name: previous?.name ?? `Group ${index + 1}`, switches };
  });
}

/** Decode each mode's independent storage; mode selection never aliases its banks. */
export function configurationFromBytes(bytes: Uint8Array, metadata?: StudioConfiguration) {
  const decoded = decodeFcp(bytes);
  const warnings: string[] = [];
  if (decoded.issues.length) warnings.push('hardware.unrecognizedFields');
  const count = Math.min(8, Math.max(1, decoded.globals.advancedMaxGroupIndex + 1));
  const configurationId = metadata?.id ?? 'chocolate-configuration';
  // Reserve every existing ID before either mode allocates newly discovered groups.
  const usedIds = new Set([configurationId]);
  for (const resources of [metadata?.destinations, metadata?.presets, metadata?.groups, metadata?.mixedGroups]) {
    for (const resource of resources ?? []) usedIds.add(resource.id);
  }
  const configuration: StudioConfiguration = {
    formatVersion: metadata?.formatVersion ?? 1, id: configurationId, name: metadata?.name ?? 'Chocolate Plus',
    destinations: structuredClone(metadata?.destinations ?? []), presets: structuredClone(metadata?.presets ?? []),
    controller: {
      ...Object.fromEntries((Object.keys(FCP_FIELDS) as FcpField[]).flatMap(field => {
        const value = field === 'mode' ? decoded.mode : decoded.globals[field];
        const definition = FCP_FIELDS[field];
        return field === 'mode' || value >= definition.min && value <= definition.max ? [[field, value]] : [];
      })),
      keyboardAssignments: decoded.keyboardGroups.flatMap((group, groupIndex) => SWITCH_IDS.flatMap(switchId => {
        const combination = group.switches[switchId].combination;
        return combination ? [{ groupIndex, switchId, combination }] : [];
      })),
      mixedAssignments: decoded.mixedGroups.flatMap((group, groupIndex) => SWITCH_IDS.flatMap(switchId => {
        const sw = group.switches[switchId];
        if (sw.typeCode < 0 || sw.typeCode > 2) return [];
        return [{ groupIndex, switchId, typeCode: sw.typeCode,
          ...(sw.turnerKeyIndex <= 9 ? { turnerKeyIndex: sw.turnerKeyIndex } : {}),
          ...(sw.keyboard.combination ? { combination: sw.keyboard.combination } : {}) }];
      })),
      interfaceAssignments: decoded.interfaceBank.records.flatMap((record, slot) =>
        record.assignment ? [{ slot, ...record.assignment }] : []),
    },
    groups: readGroups(decoded.advancedGroups.slice(0, count), metadata?.groups, warnings, 'device-group', usedIds),
    mixedGroups: readGroups(decoded.mixedGroups, metadata?.mixedGroups, warnings, 'device-mixed-group', usedIds),
  };
  return { configuration: studioConfigurationSchema.parse(configuration), warnings: [...new Set(warnings)],
    controller: readControllerMetadata(bytes) };
}

/** Stored indexes only. Neither the mode nor Pcdisplay is physical display telemetry. */
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
  const targetMode = config.controller?.mode ?? decoded.mode;
  const patches: FcpPatch[] = [];
  const finish = () => {
    const result = unsupported.length ? null : applyFcpPatches(baseline, patches);
    return {
      bytes: result?.bytes ?? baseline.slice(), warnings, unsupported: [...new Set(unsupported)],
      writeRanges: result?.footprints.map(footprint => footprint.cubeSuiteRange) ?? [],
    };
  };
  if (!getControllerMode(targetMode)) unsupported.push('hardware.unrecognizedFields');
  for (const field of Object.keys(FCP_FIELDS) as FcpField[]) {
    const value = config.controller?.[field];
    const observed = field === 'mode' ? decoded.mode : decoded.globals[field];
    if (value !== undefined && value !== observed) patches.push({ kind: 'field', field, value });
  }
  // The external interface bank is independent of the selected operating mode.
  for (const { slot, ...assignment } of config.controller?.interfaceAssignments ?? []) {
    const observed = decoded.interfaceBank.records[slot]!;
    if (same(assignment, observed.assignment)) continue;
    if (observed.enabled && observed.assignment === null) {
      unsupported.push('hardware.preserveUnknownBank'); continue;
    }
    patches.push({ kind: 'interfaceAssignment', slot, assignment });
  }
  for (const slot of config.controller?.clearedInterfaceSlots ?? []) {
    const observed = decoded.interfaceBank.records[slot]!;
    if (observed.enabled && observed.assignment === null) {
      unsupported.push('hardware.preserveUnknownBank'); continue;
    }
    if (observed.enabled) patches.push({ kind: 'clearInterfaceAssignment', slot });
  }
  if (targetMode === 10) {
    for (const assignment of config.controller?.keyboardAssignments ?? []) {
      const observed = decoded.keyboardGroups[assignment.groupIndex]!.switches[assignment.switchId];
      if (!same(assignment.combination, observed.combination)) {
        patches.push({ kind: 'keyboard', scope: 'keyboard', groupIndex: assignment.groupIndex,
          switchId: assignment.switchId, combination: assignment.combination });
      }
    }
  }
  if (targetMode === 11) {
    for (const assignment of config.controller?.mixedAssignments ?? []) {
      const { groupIndex, switchId } = assignment;
      const observed = decoded.mixedGroups[groupIndex]!.switches[switchId];
      if (assignment.typeCode !== observed.typeCode) patches.push({ kind: 'mixedType', groupIndex, switchId, typeCode: assignment.typeCode });
      if (assignment.typeCode === 1 && assignment.combination && !same(assignment.combination, observed.keyboard.combination)) {
        patches.push({ kind: 'keyboard', scope: 'mixed', groupIndex, switchId, combination: assignment.combination });
      }
      if (assignment.typeCode === 2 && assignment.turnerKeyIndex !== undefined && assignment.turnerKeyIndex !== observed.turnerKeyIndex) {
        patches.push({ kind: 'turnerKey', groupIndex, switchId, keyIndex: assignment.turnerKeyIndex });
      }
    }
  }
  const scope = targetMode === 3 ? 'advanced' : targetMode === 11 ? 'mixed' : null;
  const groups = scope === 'advanced' ? config.groups : scope === 'mixed' ? config.mixedGroups : undefined;
  if (!scope || !groups) return finish();
  const observedGroups = scope === 'advanced' ? decoded.advancedGroups : decoded.mixedGroups;
  if (scope === 'advanced' && groups.length > 8) unsupported.push('hardware.maxEightGroups');
  for (const [index, group] of groups.slice(0, observedGroups.length).entries()) {
    const observedGroup = observedGroups[index]!;
    for (const id of SWITCH_IDS) {
      if (scope === 'mixed') {
        const typeCode = config.controller?.mixedAssignments?.find(assignment => assignment.groupIndex === index && assignment.switchId === id)?.typeCode
          ?? decoded.mixedGroups[index]!.switches[id].typeCode;
        if (typeCode !== 0) continue;
      }
      const sw = group.switches[id];
      const observed = observedGroup.switches[id];
      if (sw.actions.length > 1 || sw.actions.some(action => action.gesture !== 'press')) {
        unsupported.push('hardware.useTwoSequences'); continue;
      }
      if (observed.modeCode >= behaviors.length) {
        if (sw.behavior !== undefined) unsupported.push('hardware.unrecognizedFields');
      } else {
        const modeCode = behaviors.indexOf(sw.behavior ?? 'single');
        if (modeCode !== observed.modeCode) patches.push({ kind: 'switchMode', scope, groupIndex: index, switchId: id, modeCode });
      }
      for (const [bank, messages, observedBank] of [
        ['A', expand(sw.actions[0]?.messages ?? []), observed.bankA],
        ['B', expand(sw.secondaryMessages ?? []), observed.bankB],
      ] as const) {
        if (messages.length > 16) { unsupported.push('hardware.maxSixteenMessages'); continue; }
        if (same(messages, known(observedBank))) continue;
        if (hasOpaque(observedBank)) {
          unsupported.push('hardware.preserveUnknownBank'); continue;
        }
        for (let slot = 0; slot < 16; slot++) {
          const location: MessageLocation = { scope, groupIndex: index, switchId: id, bank, slot };
          const message = messages[slot];
          if (message) patches.push({ kind: 'message', location, message });
          else if (observedBank.records[slot]!.enabled) patches.push({ kind: 'clearMessage', location });
        }
      }
    }
  }
  const observedCount = Math.min(8, Math.max(1, decoded.globals.advancedMaxGroupIndex + 1));
  const requestedLimit = config.controller?.advancedMaxGroupIndex;
  // Explicit scalar presence wins, even when unchanged from the stored baseline.
  if (scope === 'advanced' && config.groups.length !== observedCount && requestedLimit === undefined) {
    patches.push({ kind: 'field', field: 'advancedMaxGroupIndex', value: config.groups.length - 1 });
    const requestedIndex = config.controller?.advancedGroupIndex;
    if (decoded.globals.advancedGroupIndex >= config.groups.length && requestedIndex === undefined) {
      patches.push({ kind: 'field', field: 'advancedGroupIndex', value: 0 });
    }
  }
  return finish();
}
