import { copyBytes } from './bytes.js';
import type { ByteInput } from './bytes.js';
import { ChocolateError, integerInRange } from './errors.js';
import { createTraceFrame } from './trace.js';
import type { TraceFrame } from './trace.js';
import { systemClock } from './transport.js';
import type { CancellationSignal, SessionClock, Transport, Unsubscribe } from './transport.js';

export interface OperationOptions {
  readonly signal?: CancellationSignal;
  readonly timeoutMs?: number;
}
interface Completion<T> {
  resolve(value: T): void;
  reject(error: ChocolateError): void;
  cleanup(unsubscribe: Unsubscribe): void;
}

/** One receive waiter and one physical send at a time. No device requests or implicit retry. */
export class Session {
  readonly #transport: Transport;
  readonly #clock: SessionClock;
  readonly #pending = new Set<(error: ChocolateError) => void>();
  readonly #unsubscribeDisconnect: Unsubscribe;
  #terminal: 'DISCONNECTED' | 'SESSION_CLOSED' | undefined;
  #sending = false;
  #receiving = false;

  constructor(transport: Transport, clock: SessionClock = systemClock) {
    this.#transport = transport;
    this.#clock = clock;
    this.#unsubscribeDisconnect = transport.onDisconnect(() => this.#terminate('DISCONNECTED'));
    if (!transport.connected) this.#terminate('DISCONNECTED');
  }

  #terminate(code: 'DISCONNECTED' | 'SESSION_CLOSED'): void {
    this.#terminal ??= code;
    for (const reject of [...this.#pending]) reject(new ChocolateError(this.#terminal));
  }

  dispose(): void {
    this.#terminate('SESSION_CLOSED');
    this.#unsubscribeDisconnect();
  }

  async #operation<T>(options: OperationOptions, start: (completion: Completion<T>) => void): Promise<T> {
    const timeoutMs = options.timeoutMs ?? 10_000;
    integerInRange(timeoutMs, 1, 2_147_483_647, 'timeoutMs');
    if (this.#terminal || !this.#transport.connected) throw new ChocolateError(this.#terminal ?? 'DISCONNECTED');
    if (options.signal?.aborted) throw new ChocolateError('CANCELLED');
    const { promise, resolve, reject } = Promise.withResolvers<T>();
    let settled = false;
    const cleanups: Unsubscribe[] = [];
    const finish = (value: T | ChocolateError, failed: boolean): void => {
      if (settled) return;
      settled = true;
      this.#pending.delete(cancel);
      for (const unsubscribe of cleanups) unsubscribe();
      if (failed) reject(value); else resolve(value as T);
    };
    const cancel = (error: ChocolateError): void => finish(error, true);
    const cleanup = (unsubscribe: Unsubscribe): void => {
      if (settled) unsubscribe(); else cleanups.push(unsubscribe);
    };
    this.#pending.add(cancel);
    const abort = (): void => cancel(new ChocolateError('CANCELLED'));
    options.signal?.addEventListener('abort', abort, { once: true });
    cleanup(() => options.signal?.removeEventListener('abort', abort));
    cleanup(this.#clock.schedule(() => cancel(new ChocolateError('TIMEOUT', { timeoutMs })), timeoutMs));
    if (options.signal?.aborted) abort();
    if (!settled) {
      try { start({ resolve: (value) => finish(value, false), reject: cancel, cleanup }); }
      catch (cause) { cancel(cause instanceof ChocolateError ? cause : new ChocolateError('TRANSPORT_FAILURE', { cause })); }
    }
    return promise;
  }

  async send(input: ByteInput, options: OperationOptions = {}): Promise<TraceFrame> {
    if (this.#sending) throw new ChocolateError('BUSY', { operation: 'send' });
    const bytes = copyBytes(input);
    return this.#operation(options, (completion) => {
      const trace = createTraceFrame('outgoing', this.#clock.now(), bytes);
      this.#sending = true;
      let sent: Promise<void>;
      try { sent = this.#transport.send(bytes); }
      catch (cause) { this.#sending = false; throw cause; }
      void sent.then(() => {
        this.#sending = false;
        completion.resolve(trace);
      }, (cause: unknown) => {
        this.#sending = false;
        completion.reject(new ChocolateError('TRANSPORT_FAILURE', { cause }));
      });
    });
  }

  async receive(matches: (frame: TraceFrame) => boolean, options: OperationOptions = {}): Promise<TraceFrame> {
    if (this.#receiving) throw new ChocolateError('BUSY', { operation: 'receive' });
    return this.#operation(options, (completion) => {
      this.#receiving = true;
      completion.cleanup(() => { this.#receiving = false; });
      completion.cleanup(this.#transport.onData((bytes, timestamp) => {
        try {
          const frame = createTraceFrame('incoming', timestamp, bytes);
          if (matches(frame)) completion.resolve(frame);
        } catch (cause) {
          completion.reject(cause instanceof ChocolateError ? cause : new ChocolateError('MATCHER_FAILURE', { cause }));
        }
      }));
    });
  }
}
