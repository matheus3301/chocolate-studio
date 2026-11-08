import { copyBytes } from './bytes.js';
import type { ByteInput } from './bytes.js';
import { ChocolateError } from './errors.js';
import { BinarySnapshot } from './snapshot.js';
import type { Transport, Unsubscribe } from './transport.js';

/** Manual completion can deliberately arrive after cancellation/disconnect. Never accesses MIDI. */
export class FakeTransport implements Transport {
  #connected = true;
  readonly #sent: BinarySnapshot[] = [];
  readonly #data = new Set<(bytes: ByteInput, timestamp: number) => void>();
  readonly #disconnect = new Set<() => void>();
  readonly #completions: Array<{ resolve: () => void; reject: (cause: unknown) => void }> = [];
  readonly #autoComplete: boolean;
  constructor(options: { autoComplete?: boolean } = {}) { this.#autoComplete = options.autoComplete ?? true; }
  get connected(): boolean { return this.#connected; }
  get sent(): readonly BinarySnapshot[] { return Object.freeze([...this.#sent]); }
  send(bytes: Uint8Array): Promise<void> {
    if (!this.connected) return Promise.reject(new ChocolateError('DISCONNECTED'));
    this.#sent.push(new BinarySnapshot(bytes));
    const { promise, resolve, reject } = Promise.withResolvers<void>();
    this.#completions.push({ resolve, reject });
    if (this.#autoComplete) resolve();
    return promise;
  }
  completeSend(index: number): void {
    const completion = this.#completions[index];
    if (!completion) throw new ChocolateError('OUT_OF_BOUNDS', { index });
    completion.resolve();
  }
  failSend(index: number, cause: unknown): void {
    const completion = this.#completions[index];
    if (!completion) throw new ChocolateError('OUT_OF_BOUNDS', { index });
    completion.reject(cause);
  }
  onData(listener: (bytes: ByteInput, timestamp: number) => void): Unsubscribe {
    this.#data.add(listener);
    return () => { this.#data.delete(listener); };
  }
  onDisconnect(listener: () => void): Unsubscribe {
    this.#disconnect.add(listener);
    return () => { this.#disconnect.delete(listener); };
  }
  emitIncoming(bytes: ByteInput, timestamp = 0): void {
    if (!this.connected) throw new ChocolateError('DISCONNECTED');
    const owned = copyBytes(bytes);
    for (const listener of [...this.#data]) listener(owned.slice(), timestamp);
  }
  disconnect(): void {
    if (!this.#connected) return;
    this.#connected = false;
    for (const listener of [...this.#disconnect]) listener();
  }
}
