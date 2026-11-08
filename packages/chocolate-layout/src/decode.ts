import {
  FCP_FIELDS, FCP_LAYOUT, SWITCH_IDS, advancedSwitchOffset, assertFcpImage,
} from './layout.js';
import type { ByteRange, FcpField, SwitchId } from './layout.js';

export type PcCcMessage =
  | { type: 'pc'; channel: number; program: number }
  | { type: 'cc'; channel: number; controller: number; value: number };

export interface LayoutIssue {
  offset: number;
  field: string;
  value: number;
  min: number;
  max: number;
}
export interface DecodedRecord {
  offset: number;
  enabled: number;
  channelIndex: number;
  typeCode: number;
  data1: number;
  data2: number;
  interpretation: 'empty' | 'pc' | 'cc' | 'opaque' | 'invalid';
  /** Only validated PC/CC is interpreted. Other records remain raw and unmodified. */
  message: PcCcMessage | null;
}
export interface DecodedBank {
  range: ByteRange;
  records: DecodedRecord[];
  /** Extent only; custom code is intentionally not interpreted. */
  customRange: ByteRange | null;
}
export interface DecodedSwitch {
  switchId: SwitchId;
  offset: number;
  modeCode: number;
  bankA: DecodedBank;
  bankB: DecodedBank;
}
export interface DecodedGroup {
  groupIndex: number;
  range: ByteRange;
  switches: Record<SwitchId, DecodedSwitch>;
}
export interface DecodedFcp {
  mode: number;
  globals: Record<Exclude<FcpField, 'mode'>, number>;
  interfaceBank: DecodedBank;
  advancedGroups: DecodedGroup[];
  /** Observed UI-domain violations, never silent repairs. Unknown bytes are accepted. */
  issues: LayoutIssue[];
}

function checkValue(issues: LayoutIssue[], offset: number, field: string, value: number, min: number, max: number): boolean {
  if (value >= min && value <= max) return true;
  issues.push({ offset, field, value, min, max });
  return false;
}

function decodeBank(image: Uint8Array, offset: number, customRange: ByteRange | null, issues: LayoutIssue[]): DecodedBank {
  const records: DecodedRecord[] = [];
  for (let slot = 0; slot < FCP_LAYOUT.slotsPerBank; slot++) {
    const at = offset + slot * FCP_LAYOUT.recordLength;
    const enabled = image[at]!;
    const channelIndex = image[at + 1]!;
    const typeCode = image[at + 2]!;
    const data1 = image[at + 3]!;
    const data2 = image[at + 4]!;
    let interpretation: DecodedRecord['interpretation'] = enabled === 0 ? 'empty' : 'opaque';
    let message: PcCcMessage | null = null;
    if (enabled !== 0) {
      let valid = checkValue(issues, at, 'enabled', enabled, 0, 1);
      valid = checkValue(issues, at + 2, 'typeCode', typeCode, 0, 4) && valid;
      if (typeCode === 0 || typeCode === 1) {
        valid = checkValue(issues, at + 1, 'channelIndex', channelIndex, 0, 15) && valid;
        valid = checkValue(issues, at + 3, 'data1', data1, 0, 127) && valid;
        if (typeCode === 1) valid = checkValue(issues, at + 4, 'data2', data2, 0, 127) && valid;
        if (valid) {
          interpretation = typeCode === 0 ? 'pc' : 'cc';
          message = typeCode === 0
            ? { type: 'pc', channel: channelIndex + 1, program: data1 }
            : { type: 'cc', channel: channelIndex + 1, controller: data1, value: data2 };
        }
      }
      if (!valid) interpretation = 'invalid';
    }
    records.push({ offset: at, enabled, channelIndex, typeCode, data1, data2, interpretation, message });
  }
  return { range: { offset, length: 80 }, records, customRange };
}

/** Exact-size structural decoding; no signature/device/version detection is available. */
export function decodeFcp(image: Uint8Array): DecodedFcp {
  assertFcpImage(image);
  const issues: LayoutIssue[] = [];
  const fields = {} as Record<FcpField, number>;
  for (const key of Object.keys(FCP_FIELDS) as FcpField[]) {
    const definition = FCP_FIELDS[key];
    fields[key] = image[definition.offset]!;
    checkValue(issues, definition.offset, key, fields[key], definition.min, definition.max);
  }
  const advancedGroups: DecodedGroup[] = [];
  for (let groupIndex = 0; groupIndex < FCP_LAYOUT.groupCount; groupIndex++) {
    const switches = {} as Record<SwitchId, DecodedSwitch>;
    for (const switchId of SWITCH_IDS) {
      const offset = advancedSwitchOffset(groupIndex, switchId);
      const modeCode = image[offset]!;
      checkValue(issues, offset, 'switchMode', modeCode, 0, 4);
      switches[switchId] = {
        switchId, offset, modeCode,
        bankA: decodeBank(image, offset + FCP_LAYOUT.bankAOffset,
          { offset: offset + FCP_LAYOUT.customAOffset, length: FCP_LAYOUT.customLength }, issues),
        bankB: decodeBank(image, offset + FCP_LAYOUT.bankBOffset,
          { offset: offset + FCP_LAYOUT.customBOffset, length: FCP_LAYOUT.customLength }, issues),
      };
    }
    advancedGroups.push({ groupIndex,
      range: { offset: FCP_LAYOUT.advancedOffset + groupIndex * FCP_LAYOUT.groupStride, length: FCP_LAYOUT.groupStride },
      switches,
    });
  }
  const { mode, ...globals } = fields;
  return { mode, globals, advancedGroups, issues,
    interfaceBank: decodeBank(image, FCP_LAYOUT.interfaceBankOffset, null, issues),
  };
}
