import { afterEach, describe, expect, it, vi } from 'vitest';
import { CancellationSource } from '../src/index.js';
import { decodeCandidatePacket, encodeCandidatePacket, ProtocolSession } from '../src/protocol.js';
import { FakeTransport } from '../src/testing.js';

/** Synthetic in-memory flash with independent memory state and delayed/negative ACK controls. */
class MemoryDevice extends FakeTransport {
  readonly memory = Uint8Array.from({ length: 23646 }, (_, i) => (i * 17 + 3) & 255);
  readonly requests: Array<{ command: number; address: number; length: number }> = [];
  holdAck = false;
  rejectWrite = false;
  corruptReadback = false;
  injectUnrelated = false;

  override async send(midi: Uint8Array): Promise<void> {
    await super.send(midi);
    const packet = decodeCandidatePacket(midi);
    const body = packet.body.toUint8Array();
    const address = new DataView(body.buffer).getUint32(1, true);
    const length = body[5]! | (body[6]! << 8) | (body[7]! << 16);
    this.requests.push({ command: packet.command, address, length });
    if (packet.command === 0x22) {
      if (!this.rejectWrite) this.memory.set(body.subarray(8), address);
      if (!this.holdAck) this.emitIncoming(encodeCandidatePacket(0, [this.rejectWrite ? 1 : 0]));
    } else if (packet.command === 0x23) {
      const reply = new Uint8Array(8 + length);
      reply.set(body.subarray(0, 8));
      reply.set(this.memory.subarray(address, address + length), 8);
      if (this.corruptReadback) reply[8] = reply[8]! ^ 1;
      if (this.injectUnrelated) {
        this.emitIncoming(encodeCandidatePacket(0x11, [1]));
        const wrong = reply.slice(); wrong[1] = wrong[1]! ^ 1;
        this.emitIncoming(encodeCandidatePacket(0x23, wrong));
      }
      const encoded = encodeCandidatePacket(0x23, reply);
      this.emitIncoming(encoded.subarray(0, 7), 1);
      this.emitIncoming(encoded.subarray(7), 2);
    }
  }
}

afterEach(() => vi.useRealTimers());

describe('protocol transaction state', () => {
  it('reads all 23646 bytes exactly, serially and at correct chunk boundaries', async () => {
    const transport = new MemoryDevice();
    transport.injectUnrelated = true;
    const session = new ProtocolSession(transport);
    const expected = transport.memory.slice();
    const result = await session.readConfiguration();
    expect(result.state).toBe('read');
    expect(result.snapshot.toUint8Array()).toEqual(expected);
    expect(transport.requests).toEqual(Array.from({ length: 24 }, (_, i) => ({ command: 0x23, address: i * 1024, length: i === 23 ? 94 : 1024 })));
    session.dispose();
  });

  it('waits for ACK before the next write and verifies every byte through subsequent reads', async () => {
    const transport = new MemoryDevice();
    transport.holdAck = true;
    const session = new ProtocolSession(transport);
    const bytes = Uint8Array.from({ length: 1025 }, (_, i) => i & 255);
    let finished = false;
    const result = session.writeAndVerify(2, bytes).then((value) => { finished = true; return value; });
    await vi.waitFor(() => expect(transport.requests).toEqual([{ command: 0x22, address: 2, length: 1024 }]));
    expect(finished).toBe(false);
    await expect(session.read(0, 1)).rejects.toMatchObject({ code: 'BUSY' });
    transport.holdAck = false;
    transport.emitIncoming(encodeCandidatePacket(0, [0]));
    const verified = await result;
    expect(verified.state).toBe('verified');
    expect(verified.snapshot.toUint8Array()).toEqual(bytes);
    expect(transport.memory.subarray(2, 1027)).toEqual(bytes);
    expect(transport.requests).toEqual([
      { command: 0x22, address: 2, length: 1024 }, { command: 0x22, address: 1026, length: 1 },
      { command: 0x23, address: 2, length: 1024 }, { command: 0x23, address: 1026, length: 1 },
    ]);
    session.dispose();
  });

  it('never treats successful ACK as verified state when readback differs', async () => {
    const transport = new MemoryDevice();
    transport.corruptReadback = true;
    const session = new ProtocolSession(transport);
    await expect(session.writeAndVerify(2, [1])).rejects.toMatchObject({ code: 'VERIFICATION_MISMATCH', data: { ranges: [{ start: 0, end: 1 }] } });
    expect(transport.requests.map(({ command }) => command)).toEqual([0x22, 0x23]);
    session.dispose();
  });

  it('stops on a negative ACK before sending further chunks or readback', async () => {
    const transport = new MemoryDevice();
    transport.rejectWrite = true;
    const baseline = transport.memory.slice();
    const session = new ProtocolSession(transport);
    await expect(session.writeAndVerify(0, new Uint8Array(1025))).rejects.toMatchObject({ code: 'DEVICE_REJECTED', data: { status: 1, address: 0 } });
    expect(transport.memory).toEqual(baseline);
    expect(transport.requests).toEqual([{ command: 0x22, address: 0, length: 1024 }]);
    session.dispose();
  });

  it('cancellation after send makes late ACKs ineligible for any subsequent transaction', async () => {
    const transport = new FakeTransport();
    const session = new ProtocolSession(transport);
    const cancellation = new CancellationSource();
    const pending = session.writeAndVerify(2, [1], { signal: cancellation.signal });
    const rejected = expect(pending).rejects.toMatchObject({ code: 'CANCELLED' });
    cancellation.cancel();
    await rejected;
    transport.emitIncoming(encodeCandidatePacket(0, [0]));
    await expect(session.writeAndVerify(2, [0])).rejects.toMatchObject({ code: 'SESSION_DESYNCHRONIZED' });
    expect(transport.sent.length).toBe(1);
    session.dispose();
  });

  it('times out unmatched addresses and does not silently retry ambiguous operations', async () => {
    vi.useFakeTimers();
    const transport = new FakeTransport();
    const session = new ProtocolSession(transport);
    const pending = session.read(2, 1, { timeoutMs: 10 });
    const rejected = expect(pending).rejects.toMatchObject({ code: 'TIMEOUT' });
    transport.emitIncoming(encodeCandidatePacket(0x23, [4, 3, 0, 0, 0, 1, 0, 0, 9]));
    await vi.advanceTimersByTimeAsync(10);
    await rejected;
    await expect(session.read(2, 1)).rejects.toMatchObject({ code: 'SESSION_DESYNCHRONIZED' });
    expect(transport.sent.length).toBe(1);
    session.dispose();
  });
});
