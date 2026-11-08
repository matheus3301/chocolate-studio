import { copyBytes } from './bytes.js';
import type { ByteInput } from './bytes.js';
import { CancellationSource } from './cancellation.js';
import { candidateEvidence, CandidateStreamDecoder, decodeAck, decodeFlashReadResponse, encodeFlashRead, encodeFlashWrite } from './candidate-codec.js';
import type { CandidatePacket } from './candidate-codec.js';
import { ChocolateError, integerInRange } from './errors.js';
import { Session } from './session.js';
import type { OperationOptions } from './session.js';
import { BinarySnapshot, diffSnapshots } from './snapshot.js';
import type { SessionClock, Transport } from './transport.js';

export interface ReadState { readonly state: 'read'; readonly address: number; readonly snapshot: BinarySnapshot }
export interface VerifiedState { readonly state: 'verified'; readonly address: number; readonly snapshot: BinarySnapshot }

/** Evidence-derived research session; caller selects transport. Never discovers, erases or retries. */
export class ProtocolSession {
  readonly #session: Session;
  #busy = false;
  #desynchronized = false;
  constructor(transport: Transport, clock?: SessionClock) { this.#session = new Session(transport, clock); }
  dispose(): void { this.#session.dispose(); }

  async #exclusive<T>(operation: () => Promise<T>): Promise<T> {
    if (this.#desynchronized) throw new ChocolateError('SESSION_DESYNCHRONIZED');
    if (this.#busy) throw new ChocolateError('BUSY', { operation: 'transaction' });
    this.#busy = true;
    try { return await operation(); }
    finally { this.#busy = false; }
  }

  async #exchange(request: Uint8Array, matches: (packet: CandidatePacket) => boolean, options: OperationOptions): Promise<CandidatePacket> {
    if (options.signal?.aborted) throw new ChocolateError('CANCELLED');
    integerInRange(options.timeoutMs ?? 10_000, 1, 2_147_483_647, 'timeoutMs');
    const cancellation = new CancellationSource();
    const abort = (): void => cancellation.cancel();
    options.signal?.addEventListener('abort', abort, { once: true });
    if (options.signal?.aborted) cancellation.cancel();
    const operationOptions = { ...options, signal: cancellation.signal };
    const decoder = new CandidateStreamDecoder(2048);
    let response: CandidatePacket | undefined;
    // Subscribe before sending: a synchronous/very fast transport response cannot be missed.
    const received = this.#session.receive((frame) => {
      for (const packet of decoder.push(frame.bytes.toUint8Array())) {
        if (matches(packet)) { response = packet; return true; }
      }
      return false;
    }, operationOptions);
    try {
      await Promise.all([received, this.#session.send(request, operationOptions)]);
      return response!;
    } catch (error) {
      // No transaction IDs in ACKs. Late replies cannot safely be assigned to a later request.
      this.#desynchronized = true;
      throw error;
    } finally {
      cancellation.cancel();
      options.signal?.removeEventListener('abort', abort);
    }
  }

  /** Generic command/body matcher, serialized with every configuration operation. */
  transact(request: ByteInput, matches: (packet: CandidatePacket) => boolean, options: OperationOptions = {}): Promise<CandidatePacket> {
    const owned = copyBytes(request);
    return this.#exclusive(() => this.#exchange(owned, matches, options));
  }

  async #read(address: number, length: number, options: OperationOptions): Promise<BinarySnapshot> {
    integerInRange(address, 0, 0xffffffff, 'address');
    integerInRange(length, 1, candidateEvidence.configLength, 'length');
    if (address + length > 0x1_0000_0000) throw new ChocolateError('INVALID_ARGUMENT', { field: 'addressRange' });
    const bytes = new Uint8Array(length);
    for (let offset = 0; offset < length; offset += 1024) {
      const count = Math.min(1024, length - offset);
      const packet = await this.#exchange(encodeFlashRead(4, address + offset, count), (candidate) => {
        if (candidate.command !== 0x23) return false;
        const response = decodeFlashReadResponse(candidate);
        return response.flashType === 4 && response.address === address + offset && response.length === count;
      }, { timeoutMs: 2000, ...options });
      bytes.set(decodeFlashReadResponse(packet).data.toUint8Array(), offset);
    }
    return new BinarySnapshot(bytes);
  }

  read(address: number, length: number, options: OperationOptions = {}): Promise<ReadState> {
    return this.#exclusive(async () => Object.freeze({ state: 'read', address, snapshot: await this.#read(address, length, options) }));
  }

  readConfiguration(options: OperationOptions = {}): Promise<ReadState> {
    return this.read(candidateEvidence.configAddress, candidateEvidence.configLength, options);
  }

  /** ACK only authorizes the next chunk. Success is returned solely after exact readback. */
  writeAndVerify(address: number, input: ByteInput, options: OperationOptions = {}): Promise<VerifiedState> {
    const bytes = copyBytes(input);
    integerInRange(address, 0, 0xffffffff, 'address');
    integerInRange(bytes.length, 1, candidateEvidence.configLength, 'length');
    if (address + bytes.length > 0x1_0000_0000) throw new ChocolateError('INVALID_ARGUMENT', { field: 'addressRange' });
    return this.#exclusive(async () => {
      for (let offset = 0; offset < bytes.length; offset += 1024) {
        const chunk = bytes.subarray(offset, Math.min(offset + 1024, bytes.length));
        const packet = await this.#exchange(encodeFlashWrite(4, address + offset, chunk), (candidate) => candidate.command === 0, { timeoutMs: 10_000, ...options });
        const ack = decodeAck(packet);
        if (!ack.accepted) throw new ChocolateError('DEVICE_REJECTED', { status: ack.status, address: address + offset });
      }
      const actual = await this.#read(address, bytes.length, options);
      const differences = diffSnapshots(new BinarySnapshot(bytes), actual);
      if (differences.length) {
        throw new ChocolateError('VERIFICATION_MISMATCH', { ranges: differences.map(({ start, end }) => ({ start, end })) });
      }
      return Object.freeze({ state: 'verified', address, snapshot: actual });
    });
  }
}
