import { assertInteger } from './layout.js';

/** CubeSuite's own menu indexes, NOT USB HID usages or ASCII. init 0x100083102..0x100083e3f. */
export const FCP_KEYBOARD_KEYS: readonly string[] = Object.freeze([
  'None', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'Up', 'Down', 'Left', 'Right',
  'Page Up', 'Page Down', 'Space', 'Enter', 'Escape', 'Delete', 'Caps Lock', 'Tab',
  ...'0123456789', '+', '-', ...Array.from({ length: 12 }, (_, index) => `F${index + 1}`),
]);
export const FCP_KEYBOARD_MODIFIERS = Object.freeze(['None', 'Ctrl', 'Shift', 'Alt', 'Win/Command'] as const);
export const FCP_TURNER_KEYS = Object.freeze([
  'Up', 'Down', 'Left', 'Right', 'Page Up', 'Page Down', 'Previous track', 'Next track', 'Volume −', 'Volume +',
] as const);
export interface KeyboardCombination { modifier1: number; modifier2: number; key: number }
/** init populates 0..4; comBoxChange stores zero or menu index + 0x3e. */
export function encodeKeyboardCombination(combination: KeyboardCombination): [number, number, number] {
  assertInteger(combination.modifier1, 0, 4, 'modifier1');
  assertInteger(combination.modifier2, 0, 4, 'modifier2');
  assertInteger(combination.key, 0, FCP_KEYBOARD_KEYS.length - 1, 'key');
  if (combination.modifier1 !== 0 && combination.modifier1 === combination.modifier2) {
    throw new RangeError('Keyboard modifiers must differ unless both are None');
  }
  return [combination.modifier1 === 0 ? 0 : combination.modifier1 + 62,
    combination.modifier2 === 0 ? 0 : combination.modifier2 + 62, combination.key];
}
