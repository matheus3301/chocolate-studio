import { copyBytes } from './bytes.js';
import type { ByteInput } from './bytes.js';
import { ChocolateError, integerInRange } from './errors.js';
import { BinarySnapshot } from './snapshot.js';

export const candidateEvidence = Object.freeze({
  status: 'native-transport-hardware-observed' as const,
  libraryHardwareQualified: true as const,
  libraryQualificationScope: 'FootCtrlPlus_016:native-full-read-channel-and-bank-storage-write-readback-restore' as const,
  bankStorageRoundtripQualified: true as const,
  webMidiHardwareQualified: false as const,
  coordinatorIndependentHardwareValidated: true as const,
  readChunkSize: 1024,
  binarySha256: '1730799b103cb3c029ca9d1999e7355e20342f5a99d338cca963cf127140c88f',
  identityObserved: 'FootCtrlPlus_016',
  writeChunkSize: 1024,
  configFlashType: 4,
  configAddress: 0,
  configLength: 0x5c5e,
});

export interface CandidatePacket {
  readonly command: number;
  readonly body: BinarySnapshot;
}
export interface FlashReadResponse {
  readonly flashType: number;
  readonly address: number;
  readonly length: number;
  readonly data: BinarySnapshot;
}

/** Continuous LSB-first bit stream, not a seven-byte/MSB-prefix encoding. */
export function packMidi(input: ByteInput): Uint8Array {
  const raw = copyBytes(input);
  const midi = new Uint8Array(Math.ceil(raw.length * 8 / 7) + 2);
  midi[0] = 0xf0;
  let accumulator = 0, bits = 0, offset = 1;
  for (const byte of raw) {
    accumulator |= byte << bits;
    bits += 8;
    while (bits >= 7) {
      midi[offset++] = accumulator & 0x7f;
      accumulator >>>= 7;
      bits -= 7;
    }
  }
  if (bits) midi[offset++] = accumulator;
  midi[offset] = 0xf7;
  return midi;
}

/** Strict complete-frame decoder; rejects extra chunks and nonzero padding bits. */
export function unpackMidi(input: ByteInput): Uint8Array {
  const midi = copyBytes(input);
  if (midi.length < 2 || midi[0] !== 0xf0 || midi[midi.length - 1] !== 0xf7) {
    throw new ChocolateError('INVALID_PACKET', { field: 'framing' });
  }
  const payloadLength = midi.length - 2;
  const raw = new Uint8Array(Math.floor(payloadLength * 7 / 8));
  if (Math.ceil(raw.length * 8 / 7) !== payloadLength) {
    throw new ChocolateError('INVALID_PACKET', { field: 'packedLength' });
  }
  let accumulator = 0, bits = 0, offset = 0;
  for (let index = 1; index < midi.length - 1; index++) {
    const byte = midi[index]!;
    if (byte > 0x7f) throw new ChocolateError('INVALID_PACKET', { field: 'sevenBitData', index });
    accumulator |= byte << bits;
    bits += 7;
    if (bits >= 8) {
      raw[offset++] = accumulator & 0xff;
      accumulator >>>= 8;
      bits -= 8;
    }
  }
  if (accumulator !== 0) throw new ChocolateError('INVALID_PACKET', { field: 'padding' });
  return raw;
}

export function encodeCandidatePacket(command: number, body: ByteInput): Uint8Array {
  integerInRange(command, 0, 255, 'command');
  const bytes = copyBytes(body);
  integerInRange(bytes.length, 0, 0xffffff, 'bodyLength');
  const packet = new Uint8Array(bytes.length + 7);
  packet.set([0, 0x59, command, bytes.length & 255, (bytes.length >>> 8) & 255, bytes.length >>> 16]);
  packet.set(bytes, 6);
  let sum = 0;
  for (const byte of bytes) sum = (sum + byte) & 255;
  packet[packet.length - 1] = (~sum) & 255;
  return packMidi(packet);
}

export function decodeCandidatePacket(input: ByteInput): CandidatePacket {
  const raw = unpackMidi(input);
  if (raw.length < 7) throw new ChocolateError('TRUNCATED_INPUT', { minimum: 7, actual: raw.length });
  if (raw[0] !== 0 || raw[1] !== 0x59) throw new ChocolateError('INVALID_PACKET', { field: 'header' });
  const length = raw[3]! | (raw[4]! << 8) | (raw[5]! << 16);
  if (raw.length !== length + 7) {
    throw new ChocolateError(raw.length < length + 7 ? 'TRUNCATED_INPUT' : 'INVALID_PACKET', { field: 'bodyLength', length, actual: raw.length - 7 });
  }
  let sum = 0;
  for (let index = 6; index < raw.length; index++) sum = (sum + raw[index]!) & 255;
  if (sum !== 255) throw new ChocolateError('CHECKSUM_MISMATCH');
  return Object.freeze({ command: raw[2]!, body: new BinarySnapshot(raw.subarray(6, raw.length - 1)) });
}

function flashBody(flashType: number, address: number, length: number, data?: Uint8Array): Uint8Array {
  integerInRange(flashType, 0, 255, 'flashType');
  integerInRange(address, 0, 0xffffffff, 'address');
  integerInRange(length, 1, 0xffffff, 'length');
  if (address + length > 0x1_0000_0000) throw new ChocolateError('INVALID_ARGUMENT', { field: 'addressRange' });
  const body = new Uint8Array(8 + (data?.length ?? 0));
  body[0] = flashType;
  new DataView(body.buffer).setUint32(1, address, true);
  body.set([length & 255, (length >>> 8) & 255, length >>> 16], 5);
  if (data) body.set(data, 8);
  return body;
}

export function encodeFlashRead(flashType: number, address: number, length: number): Uint8Array {
  return encodeCandidatePacket(0x23, flashBody(flashType, address, length));
}

/** Offline encoding only; no send, erase, reset, firmware or automatic save side effects. */
export function encodeFlashWrite(flashType: number, address: number, input: ByteInput): Uint8Array {
  const data = copyBytes(input);
  integerInRange(data.length, 1, candidateEvidence.writeChunkSize, 'writeLength');
  return encodeCandidatePacket(0x22, flashBody(flashType, address, data.length, data));
}

export function decodeFlashReadResponse(packet: CandidatePacket): FlashReadResponse {
  if (packet.command !== 0x23 || packet.body.length < 8) {
    throw new ChocolateError('INVALID_PACKET', { field: 'readResponse' });
  }
  const body = packet.body;
  const length = body.at(5) | (body.at(6) << 8) | (body.at(7) << 16);
  if (length !== body.length - 8) throw new ChocolateError('INVALID_PACKET', { field: 'readDataLength', length, actual: body.length - 8 });
  const address = (body.at(1) | (body.at(2) << 8) | (body.at(3) << 16) | (body.at(4) << 24)) >>> 0;
  return Object.freeze({ flashType: body.at(0), address, length, data: body.slice(8) });
}

export function decodeAck(packet: CandidatePacket): { readonly status: number; readonly accepted: boolean } {
  if (packet.command !== 0 || packet.body.length !== 1) throw new ChocolateError('INVALID_PACKET', { field: 'ack' });
  const status = packet.body.at(0);
  return Object.freeze({ status, accepted: status === 0 });
}

/** Packet boundaries need not coincide with transport callbacks. Bounded to supplied limit. */
export class CandidateStreamDecoder {
  readonly #maxFrameLength: number;
  #frame: number[] | undefined;
  constructor(maxFrameLength: number) {
    integerInRange(maxFrameLength, 2, 32_000_000, 'maxFrameLength');
    this.#maxFrameLength = maxFrameLength;
  }
  push(input: ByteInput): readonly CandidatePacket[] {
    const packets: CandidatePacket[] = [];
    for (const byte of copyBytes(input)) {
      if (byte >= 0xf8) continue; // Standard MIDI realtime bytes can interleave SysEx.
      if (byte === 0xf0) { this.#frame = [byte]; continue; }
      if (!this.#frame) continue;
      if (this.#frame.length >= this.#maxFrameLength) {
        this.#frame = undefined;
        throw new ChocolateError('INVALID_PACKET', { field: 'frameLimit' });
      }
      this.#frame.push(byte);
      if (byte === 0xf7) {
        const frame = this.#frame;
        this.#frame = undefined;
        packets.push(decodeCandidatePacket(frame));
      } else if (byte > 127) {
        this.#frame = undefined;
        throw new ChocolateError('INVALID_PACKET', { field: 'interruptedSysex' });
      }
    }
    return Object.freeze(packets);
  }
}
