import {
  FCP_FIELDS, FCP_LAYOUT, advancedSwitchOffset, assertFcpImage, assertInteger, messageOffset, keyboardSwitchOffset, mixedSwitchOffset, interfaceAssignmentOffset,
} from './layout.js';
import type { ByteRange, FcpField, MessageLocation, SwitchId, InterfaceAssignment } from './layout.js';
import type { FcpMessage } from './decode.js';
import { encodeKeyboardCombination } from './keyboard.js';
import type { KeyboardCombination } from './keyboard.js';

export type FcpPatch =
  | { kind: 'field'; field: FcpField; value: number }
  | { kind: 'switchMode'; scope?: 'advanced' | 'mixed'; groupIndex: number; switchId: SwitchId; modeCode: number }
  | { kind: 'keyboard'; scope: 'keyboard' | 'mixed'; groupIndex: number; switchId: SwitchId; combination: KeyboardCombination }
  | { kind: 'mixedType'; groupIndex: number; switchId: SwitchId; typeCode: number }
  | { kind: 'turnerKey'; groupIndex: number; switchId: SwitchId; keyIndex: number }
  | { kind: 'interfaceAssignment'; slot: number; assignment: InterfaceAssignment }
  | { kind: 'clearInterfaceAssignment'; slot: number }
  | { kind: 'message'; location: MessageLocation; message: FcpMessage }
  | { kind: 'clearMessage'; location: MessageLocation };
export interface PatchFootprint {
  /** Exact bytes this patch is allowed to modify, not all necessarily changed. */
  fieldRange: ByteRange;
  /** Range passed to sendDataToDevice by the corresponding CubeSuite handler. */
  cubeSuiteRange: ByteRange;
  provenance: string;
}
export interface ByteChange { offset: number; before: number; after: number }
export interface FcpPatchResult {
  bytes: Uint8Array;
  changes: ByteChange[];
  footprints: PatchFootprint[];
}

function assertKeys(value: unknown, keys: readonly string[]): void {
  if (value === null || typeof value !== 'object' || Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) ||
    Object.getOwnPropertySymbols(value).length !== 0) throw new TypeError('Expected a plain patch object');
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
    if (!keys.includes(key) || !('value' in descriptor)) throw new TypeError(`Unexpected patch property: ${key}`);
  }
}

function validateLocation(location: MessageLocation): void {
  assertKeys(location, ['scope', 'slot', 'groupIndex', 'switchId', 'bank']);
  // messageOffset validates the discriminant, all indexes, switch ID and bank ID.
  messageOffset(location);
}

/** Atomic, immutable edits. Never rebuilds an image from its partially decoded view. */
export function applyFcpPatches(image: Uint8Array, patches: readonly FcpPatch[]): FcpPatchResult {
  assertFcpImage(image);
  if (!Array.isArray(patches) || patches.length > 2048) throw new RangeError('Expected at most 2048 patches');
  const writes = new Map<number, number>();
  const footprints: PatchFootprint[] = [];
  const plan = (offset: number, values: readonly number[]) => {
    for (let index = 0; index < values.length; index++) {
      const at = offset + index;
      if (writes.has(at)) throw new RangeError(`Overlapping patches at offset ${at}`);
      writes.set(at, values[index]!);
    }
  };
  for (const patch of patches as readonly FcpPatch[]) {
    assertKeys(patch, ['kind', 'field', 'value', 'scope', 'groupIndex', 'switchId', 'modeCode', 'location', 'message', 'combination', 'typeCode', 'keyIndex', 'slot', 'assignment']);
    switch (patch.kind) {
      case 'field': {
        assertKeys(patch, ['kind', 'field', 'value']);
        if (!Object.hasOwn(FCP_FIELDS, patch.field)) throw new RangeError('Unknown FCP field');
        const definition = FCP_FIELDS[patch.field];
        assertInteger(patch.value, definition.min, definition.max, patch.field);
        plan(definition.offset, [patch.value]);
        footprints.push({ fieldRange: { offset: definition.offset, length: 1 },
          cubeSuiteRange: { offset: definition.offset, length: 1 }, provenance: definition.provenance });
        break;
      }
      case 'interfaceAssignment':
      case 'clearInterfaceAssignment': {
        assertKeys(patch, patch.kind === 'interfaceAssignment' ? ['kind', 'slot', 'assignment'] : ['kind', 'slot']);
        const offset = interfaceAssignmentOffset(patch.slot);
        if (patch.kind === 'interfaceAssignment') {
          const assignment = patch.assignment;
          assertKeys(assignment, ['channel', 'data', 'releaseValue', 'pressValue']);
          assertInteger(assignment.channel, 1, 16, 'channel');
          assertInteger(assignment.data, 0, 127, 'data');
          assertInteger(assignment.releaseValue, 0, 127, 'releaseValue');
          assertInteger(assignment.pressValue, 0, 127, 'pressValue');
          plan(offset, [1, assignment.channel - 1, assignment.data, assignment.releaseValue, assignment.pressValue]);
        } else {
          plan(offset, [0]);
        }
        footprints.push({ fieldRange: { offset, length: patch.kind === 'interfaceAssignment' ? 5 : 1 },
          cubeSuiteRange: { offset: FCP_LAYOUT.interfaceBankOffset, length: 80 },
          provenance: 'editInterface 0x10008cd9c..0x10008ce13; updateInterfaceList 0x10008c5de..0x10008c60d' });
        break;
      }
      case 'switchMode': {
        assertKeys(patch, ['kind', 'scope', 'groupIndex', 'switchId', 'modeCode']);
        if (patch.scope !== undefined && patch.scope !== 'advanced' && patch.scope !== 'mixed') throw new RangeError('Unknown switch scope');
        const offset = patch.scope === 'mixed' ? mixedSwitchOffset(patch.groupIndex, patch.switchId) + 5
          : advancedSwitchOffset(patch.groupIndex, patch.switchId);
        assertInteger(patch.modeCode, 0, 4, 'modeCode');
        plan(offset, [patch.modeCode]);
        footprints.push({ fieldRange: { offset, length: 1 }, cubeSuiteRange: { offset, length: 1 },
          provenance: patch.scope === 'mixed' ? 'checkedFootSwitchMode 0x100089b0b..0x100089ce2'
            : 'checkedFootSwitchMode 0x1000898a9, 0x100089ad7..0x100089adf' });
        break;
      }
      case 'keyboard': {
        assertKeys(patch, ['kind', 'scope', 'groupIndex', 'switchId', 'combination']);
        if (patch.scope !== 'keyboard' && patch.scope !== 'mixed') throw new RangeError('Unknown keyboard scope');
        assertKeys(patch.combination, ['modifier1', 'modifier2', 'key']);
        const offset = patch.scope === 'keyboard' ? keyboardSwitchOffset(patch.groupIndex, patch.switchId)
          : mixedSwitchOffset(patch.groupIndex, patch.switchId) + 2;
        plan(offset, encodeKeyboardCombination(patch.combination));
        for (let index = 0; index < 3; index++) {
          footprints.push({ fieldRange: { offset: offset + index, length: 1 },
            cubeSuiteRange: { offset: offset + index, length: 1 },
            provenance: 'comBoxChange 0x10008a058..0x10008a384; mixed 0x10008a3b6..0x10008a78d' });
        }
        break;
      }
      case 'mixedType':
      case 'turnerKey': {
        const isType = patch.kind === 'mixedType';
        assertKeys(patch, isType ? ['kind', 'groupIndex', 'switchId', 'typeCode'] : ['kind', 'groupIndex', 'switchId', 'keyIndex']);
        const offset = mixedSwitchOffset(patch.groupIndex, patch.switchId) + (isType ? 0 : 1);
        const value = patch.kind === 'mixedType' ? patch.typeCode : patch.keyIndex;
        assertInteger(value, 0, isType ? 2 : 9, isType ? 'typeCode' : 'keyIndex');
        plan(offset, [value]);
        footprints.push({ fieldRange: { offset, length: 1 }, cubeSuiteRange: { offset, length: 1 },
          provenance: isType ? 'checkedMixKeyType 0x10008688f..0x10008693f' : 'comBoxChange 0x10008ab43..0x10008abf4' });
        break;
      }
      case 'message':
      case 'clearMessage': {
        assertKeys(patch, patch.kind === 'message' ? ['kind', 'location', 'message'] : ['kind', 'location']);
        validateLocation(patch.location);
        const offset = messageOffset(patch.location);
        let length = 1;
        if (patch.kind === 'clearMessage') {
          plan(offset, [0]);
        } else {
          const message = patch.message;
          assertKeys(message, ['type', 'channel', 'program', 'controller', 'value', 'note', 'velocity']);
          assertInteger(message.channel, 1, 16, 'channel');
          if (message.type === 'pc') {
            assertKeys(message, ['type', 'channel', 'program']);
            assertInteger(message.program, 0, 127, 'program');
            // The fifth PC record byte is unused here; preserve it even if nonzero.
            plan(offset, [1, message.channel - 1, 0, message.program]);
            length = 4;
          } else if (message.type === 'cc') {
            assertKeys(message, ['type', 'channel', 'controller', 'value']);
            assertInteger(message.controller, 0, 127, 'controller');
            assertInteger(message.value, 0, 127, 'value');
            plan(offset, [1, message.channel - 1, 1, message.controller, message.value]);
            length = 5;
          } else if (message.type === 'noteOn' || message.type === 'noteOff') {
            assertKeys(message, ['type', 'channel', 'note', 'velocity']);
            assertInteger(message.note, 0, 127, 'note');
            assertInteger(message.velocity, 0, 127, 'velocity');
            plan(offset, [1, message.channel - 1, message.type === 'noteOn' ? 2 : 3, message.note, message.velocity]);
            length = 5;
          } else {
            throw new RangeError('Unknown MIDI record type');
          }
        }
        footprints.push({ fieldRange: { offset, length },
          cubeSuiteRange: patch.location.scope === 'mixed' ? { offset: FCP_LAYOUT.mixOffset, length: FCP_LAYOUT.mixLength }
            : { offset: FCP_LAYOUT.advancedOffset, length: FCP_LAYOUT.advancedLength },
          provenance: patch.location.scope === 'mixed'
            ? 'editBankA 0x10008dec3..0x10008e90d; updateAList 0x100088a0e..0x100088a3c; updateBList 0x10008959e..0x1000895cc'
            : 'editBankA 0x10008daa5..0x10008db1c; updateAList 0x1000884d5..0x100088504; updateBList 0x100089065..0x100089094',
        });
        break;
      }
      default: throw new RangeError('Unknown patch kind');
    }
  }
  const changes: ByteChange[] = [];
  for (const [offset, after] of writes) {
    const before = image[offset]!;
    if (before !== after) changes.push({ offset, before, after });
  }
  changes.sort((a, b) => a.offset - b.offset);
  const bytes = new Uint8Array(image);
  for (const change of changes) bytes[change.offset] = change.after;
  return { bytes, changes, footprints };
}
