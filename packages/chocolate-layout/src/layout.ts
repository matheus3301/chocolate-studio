/** Derived only from the installed unstripped CubeSuite x86_64 executable. */
export const CUBESUITE_EXECUTABLE_SHA256 = '1730799b103cb3c029ca9d1999e7355e20342f5a99d338cca963cf127140c88f';
export const FCP_SIZE = 23_646;
export const FCP_LAYOUT = Object.freeze({
  configObjectOffset: 0x1470,
  flashType: 4,
  flashAddress: 0,
  interfaceBankOffset: 0x0d,
  advancedOffset: 0x5d,
  advancedLength: 0x3420,
  groupCount: 8,
  groupStride: 0x684,
  switchesPerGroup: 4,
  switchStride: 0x1a1,
  slotsPerBank: 16,
  recordLength: 5,
  bankAOffset: 0x01,
  bankBOffset: 0x51,
  customAOffset: 0xa1,
  customBOffset: 0x121,
  customLength: 128,
});
export const SWITCH_IDS = ['A', 'B', 'C', 'D'] as const;
export type SwitchId = typeof SWITCH_IDS[number];
export type BankId = 'A' | 'B';

/** Static UI labels/IDs only: init 0x100081fd1..0x100082063;
 * retranslateUi 0x10009524f..0x1000953d3. No physical gesture verification. */
export const FCP_SWITCH_MODES = Object.freeze({
  single: 0, alternate: 1, momentary: 2, long: 3, shortLong: 4,
} as const);
export type FcpSwitchMode = keyof typeof FCP_SWITCH_MODES;

export interface ByteRange { offset: number; length: number }
export interface FieldDefinition {
  offset: number;
  min: number;
  max: number;
  /** Method and virtual instruction address in the executable identified above. */
  provenance: string;
}

/** Raw stored indexes/flags; channels here are zero-based, not UI channel labels. */
export const FCP_FIELDS = {
  mode: { offset: 0, min: 0, max: 12, provenance: 'checkedMode 0x1000877c6; init 0x100081d24..0x100081eae' },
  interfaceType: { offset: 1, min: 0, max: 1, provenance: 'checkedInterfaceType 0x100087730; initView 0x10008afb2..0x10008b02c' },
  channelIndex: { offset: 2, min: 0, max: 15, provenance: 'btnClick 0x100093b53..0x100093d2f' },
  visualA: { offset: 3, min: 0, max: 1, provenance: 'visualClick 0x10008ac5d' },
  customCommandA: { offset: 4, min: 0, max: 133, provenance: 'comBoxChange 0x100089d28; init 0x100082776' },
  visualB: { offset: 5, min: 0, max: 1, provenance: 'visualClick 0x10008acc0' },
  customCommandB: { offset: 6, min: 0, max: 133, provenance: 'comBoxChange 0x100089d8b; init 0x100082776' },
  visualC: { offset: 7, min: 0, max: 1, provenance: 'visualClick 0x10008ad2b' },
  customCommandC: { offset: 8, min: 0, max: 133, provenance: 'comBoxChange 0x100089df6; init 0x100082776' },
  visualD: { offset: 9, min: 0, max: 1, provenance: 'visualClick 0x10008ad96' },
  customCommandD: { offset: 10, min: 0, max: 133, provenance: 'comBoxChange 0x100089e61; init 0x100082776' },
  interfaceCommand: { offset: 12, min: 0, max: 129, provenance: 'comBoxChange 0x100089ecc; init 0x100082b0d' },
  pcMaxGroupIndex: { offset: 0x5c55, min: 0, max: 31, provenance: 'comBoxChange 0x10008aa06; updateGroupMaxBank 0x100087d5e' },
  ccMaxGroupIndex: { offset: 0x5c56, min: 0, max: 31, provenance: 'comBoxChange 0x10008aa62; updateGroupMaxBank 0x100087ddf' },
  advancedMaxGroupIndex: { offset: 0x5c57, min: 0, max: 7, provenance: 'comBoxChange 0x10008aacc; updateGroupMaxBank 0x100087e73' },
  advancedGroupIndex: { offset: 0x5c58, min: 0, max: 7, provenance: 'comBoxChange 0x10008a7ba; init 0x100084516' },
  keyboardGroupIndex: { offset: 0x5c59, min: 0, max: 5, provenance: 'comBoxChange 0x100089f37; init 0x1000843c4' },
  polarity: { offset: 0x5c5a, min: 0, max: 1, provenance: 'visualClick 0x10008ae01; setupUi 0x10007ea5a..0x10007ea6f' },
  bankMidi: { offset: 0x5c5b, min: 0, max: 1, provenance: 'visualClick 0x10008ae69; initView 0x10008af6e' },
  pcDisplay: { offset: 0x5c5c, min: 0, max: 1, provenance: 'visualClick 0x10008aece; setupUi 0x10007f71e..0x10007f733' },
  mixGroupIndex: { offset: 0x5c5d, min: 0, max: 5, provenance: 'comBoxChange 0x100089f97; init 0x1000845e1' },
} as const satisfies Record<string, FieldDefinition>;
for (const definition of Object.values(FCP_FIELDS)) Object.freeze(definition);
Object.freeze(FCP_FIELDS);
export type FcpField = keyof typeof FCP_FIELDS;

/** Identified extents, not decoded/rewritten: keyboard, mixed mode, and byte 11. */
export const OPAQUE_REGIONS: readonly Readonly<ByteRange>[] = Object.freeze([
  Object.freeze({ offset: 11, length: 1 }),
  Object.freeze({ offset: 0x347d, length: 0x48 }),
  Object.freeze({ offset: 0x34c5, length: 0x2790 }),
]);

export function assertFcpImage(image: Uint8Array): void {
  if (!(image instanceof Uint8Array) || image.byteLength !== FCP_SIZE) {
    throw new RangeError(`Expected a ${FCP_SIZE}-byte Uint8Array FCP image`);
  }
}

export function assertInteger(value: number, min: number, max: number, name: string): void {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new RangeError(`${name} must be an integer in ${min}..${max}`);
  }
}

export function advancedSwitchOffset(groupIndex: number, switchId: SwitchId): number {
  assertInteger(groupIndex, 0, 7, 'groupIndex');
  const switchIndex = SWITCH_IDS.indexOf(switchId);
  if (switchIndex < 0) throw new RangeError('switchId must be A, B, C, or D');
  return FCP_LAYOUT.advancedOffset + groupIndex * FCP_LAYOUT.groupStride + switchIndex * FCP_LAYOUT.switchStride;
}

export type MessageLocation =
  | { scope: 'interface'; slot: number }
  | { scope: 'advanced'; groupIndex: number; switchId: SwitchId; bank: BankId; slot: number };

export function messageOffset(location: MessageLocation): number {
  assertInteger(location.slot, 0, 15, 'slot');
  if (location.scope === 'interface') return FCP_LAYOUT.interfaceBankOffset + location.slot * FCP_LAYOUT.recordLength;
  if (location.scope !== 'advanced' || (location.bank !== 'A' && location.bank !== 'B')) {
    throw new RangeError('Unknown message scope or bank');
  }
  return advancedSwitchOffset(location.groupIndex, location.switchId) +
    (location.bank === 'A' ? FCP_LAYOUT.bankAOffset : FCP_LAYOUT.bankBOffset) + location.slot * FCP_LAYOUT.recordLength;
}
