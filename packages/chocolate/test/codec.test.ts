import { describe, expect, it } from 'vitest';
import { BinarySnapshot, formatHex, parseHex } from '../src/index.js';
import { CandidateStreamDecoder, ConfigurationDraft, decodeAck, decodeCandidatePacket, decodeFlashReadResponse, encodeCandidatePacket, encodeFlashRead, encodeFlashWrite, packMidi, unpackMidi } from '../src/protocol.js';

// Reviewed, non-personal observed vectors: research/fixtures/channel-roundtrip.json in coordinator worktree.
// Coordinator experiment: research/experiments/001-hardware-roundtrip.md. No private capture copied.
const observed = [
  { value: 1, request: 'f000320949000000020200000010000000016e03f7', raw: '005922090000040200000001000001f7' },
  { value: 0, request: 'f000320949000000020200000010000000007003f7', raw: '005922090000040200000001000000f8' },
];
const observedAck = 'f000320108000000007f01f7';

describe('evidence-derived codec', () => {
  it.each(observed)('matches observed channel request exactly for $value', ({ value, request, raw }) => {
    expect(encodeFlashWrite(4, 2, [value])).toEqual(parseHex(request));
    expect(unpackMidi(parseHex(request))).toEqual(parseHex(raw));
    const ack = decodeAck(decodeCandidatePacket(parseHex(observedAck)));
    expect(ack).toEqual({ status: 0, accepted: true });
  });

  it('packs cross-byte LSB-first bits rather than MSB-prefix groups', () => {
    expect([...packMidi([255, 128])]).toEqual([240, 127, 1, 2, 247]);
    for (let length = 0; length <= 32; length++) {
      const bytes = Uint8Array.from({ length }, (_, index) => (index * 79 + length) & 255);
      expect(unpackMidi(packMidi(bytes))).toEqual(bytes);
    }
  });

  it.each([[240, 127, 247], [240, 128, 0, 247], [240, 1, 2, 247], [1, 2], [240, 0]])('rejects invalid framing, packed length, data or padding: %s', (...bytes) => {
    expect(() => unpackMidi(bytes)).toThrow(expect.objectContaining({ code: 'INVALID_PACKET' }));
  });

  it('validates exact body length, checksum and header before exposing data', () => {
    const good = unpackMidi(encodeFlashWrite(4, 2, [1]));
    const corrupt = good.slice(); corrupt[8] = corrupt[8]! ^ 1;
    expect(() => decodeCandidatePacket(packMidi(corrupt))).toThrow(expect.objectContaining({ code: 'CHECKSUM_MISMATCH' }));
    expect(() => decodeCandidatePacket(packMidi(good.subarray(0, good.length - 1)))).toThrow(expect.objectContaining({ code: 'TRUNCATED_INPUT' }));
    const extended = new Uint8Array(good.length + 1); extended.set(good);
    expect(() => decodeCandidatePacket(packMidi(extended))).toThrow(expect.objectContaining({ code: 'INVALID_PACKET' }));
    const wrongHeader = good.slice(); wrongHeader[1] = 0;
    expect(() => decodeCandidatePacket(packMidi(wrongHeader))).toThrow(expect.objectContaining({ code: 'INVALID_PACKET' }));
  });

  it('decodes read data with unsigned addresses and enforces embedded byte counts', () => {
    const reply = decodeCandidatePacket(encodeCandidatePacket(0x23, [4, 0, 0, 0, 128, 2, 0, 0, 255, 0]));
    const decoded = decodeFlashReadResponse(reply);
    expect({ type: decoded.flashType, address: decoded.address, length: decoded.length, data: [...decoded.data.toUint8Array()] }).toEqual({ type: 4, address: 0x80000000, length: 2, data: [255, 0] });
    expect(() => decodeFlashReadResponse(decodeCandidatePacket(encodeCandidatePacket(0x23, [4, 0, 0, 0, 0, 3, 0, 0, 255, 0])))).toThrow(expect.objectContaining({ code: 'INVALID_PACKET' }));
    expect(decodeAck(decodeCandidatePacket(encodeCandidatePacket(0, [1])))).toEqual({ accepted: false, status: 1 });
    expect(() => encodeFlashRead(4, 0xffffffff, 2)).toThrow(expect.objectContaining({ code: 'INVALID_ARGUMENT' }));
    expect(() => encodeFlashWrite(4, 0, new Uint8Array(1025))).toThrow(expect.objectContaining({ code: 'INVALID_ARGUMENT' }));
  });

  it('reassembles split and coalesced SysEx with realtime interleaving and a hard frame bound', () => {
    const decoder = new CandidateStreamDecoder(64);
    const ack = parseHex(observedAck);
    expect(decoder.push(ack.subarray(0, 4))).toEqual([]);
    const packets = decoder.push([...ack.subarray(4), 248, ...ack]);
    expect(packets.map(decodeAck)).toEqual([{ status: 0, accepted: true }, { status: 0, accepted: true }]);
    expect(() => new CandidateStreamDecoder(4).push([240, 0, 0, 0, 0])).toThrow(expect.objectContaining({ code: 'INVALID_PACKET' }));
  });

  it('edits only the evidenced channel byte and preserves all opaque configuration bytes', () => {
    const baseline = Uint8Array.from({ length: 23646 }, (_, i) => (i * 37) & 255);
    baseline[2] = 0;
    const draft = new ConfigurationDraft(new BinarySnapshot(baseline));
    const changed = draft.withChannel(15);
    const expected = baseline.slice(); expected[2] = 15;
    expect(changed.snapshot.toUint8Array()).toEqual(expected);
    expect(draft.channel).toBe(0);
    expect(changed.channel).toBe(15);
    expect(() => draft.withChannel(16)).toThrow(expect.objectContaining({ code: 'INVALID_ARGUMENT' }));
    expect(() => new ConfigurationDraft(new BinarySnapshot([0]))).toThrow(expect.objectContaining({ code: 'INVALID_ARGUMENT' }));
    expect(formatHex(draft.snapshot.slice(0, 3).toUint8Array())).toBe('00 25 00');
  });
});
