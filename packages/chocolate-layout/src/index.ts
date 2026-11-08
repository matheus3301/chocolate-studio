export {
  CUBESUITE_EXECUTABLE_SHA256, FCP_SIZE, FCP_LAYOUT, FCP_FIELDS,
  SWITCH_IDS, FCP_SWITCH_MODES, OPAQUE_REGIONS, advancedSwitchOffset, messageOffset,
} from './layout.js';
export type {
  SwitchId, BankId, ByteRange, FieldDefinition, FcpField, FcpSwitchMode, MessageLocation,
} from './layout.js';
export { decodeFcp } from './decode.js';
export type {
  PcCcMessage, LayoutIssue, DecodedRecord, DecodedBank, DecodedSwitch, DecodedGroup, DecodedFcp,
} from './decode.js';
export { applyFcpPatches } from './patch.js';
export type { FcpPatch, PatchFootprint, ByteChange, FcpPatchResult } from './patch.js';
export { keyboardSwitchOffset, mixedSwitchOffset } from './layout.js';
export { FCP_KEYBOARD_KEYS, FCP_KEYBOARD_MODIFIERS, FCP_TURNER_KEYS, encodeKeyboardCombination } from './keyboard.js';
export type { KeyboardCombination } from './keyboard.js';
export type { FcpMessage, DecodedKeyboard, DecodedKeyboardGroup, DecodedMixedSwitch, DecodedMixedGroup } from './decode.js';
export { interfaceAssignmentOffset } from './layout.js';
export type { InterfaceAssignment } from './layout.js';
export type { DecodedInterfaceRecord, DecodedInterfaceBank } from './decode.js';
