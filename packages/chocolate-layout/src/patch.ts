import {
  FCP_FIELDS, FCP_LAYOUT, advancedSwitchOffset, assertFcpImage, assertInteger, messageOffset,
} from './layout.js';
import type { ByteRange, FcpField, MessageLocation, SwitchId } from './layout.js';
import type { PcCcMessage } from './decode.js';

export type FcpPatch =
  | { kind: 'field'; field: FcpField; value: number }
  | { kind: 'switchMode'; groupIndex: number; switchId: SwitchId; modeCode: number }
  | { kind: 'message'; location: MessageLocation; message: PcCcMessage }
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
  if (location.scope === 'interface') assertKeys(location, ['scope', 'slot']);
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
    assertKeys(patch, ['kind', 'field', 'value', 'groupIndex', 'switchId', 'modeCode', 'location', 'message']);
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
      case 'switchMode': {
        assertKeys(patch, ['kind', 'groupIndex', 'switchId', 'modeCode']);
        const offset = advancedSwitchOffset(patch.groupIndex, patch.switchId);
        assertInteger(patch.modeCode, 0, 4, 'modeCode');
        plan(offset, [patch.modeCode]);
        footprints.push({ fieldRange: { offset, length: 1 }, cubeSuiteRange: { offset, length: 1 },
          provenance: 'checkedFootSwitchMode 0x1000898a9, 0x100089ad7..0x100089adf' });
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
          assertKeys(message, ['type', 'channel', 'program', 'controller', 'value']);
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
          } else {
            throw new RangeError('Only observed PC/CC record edits are supported');
          }
        }
        footprints.push({ fieldRange: { offset, length },
          cubeSuiteRange: patch.location.scope === 'interface'
            ? { offset: FCP_LAYOUT.interfaceBankOffset, length: 80 }
            : { offset: FCP_LAYOUT.advancedOffset, length: FCP_LAYOUT.advancedLength },
          provenance: patch.location.scope === 'interface'
            ? 'editInterface 0x10008c8a0; updateInterfaceList 0x10008c480'
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
