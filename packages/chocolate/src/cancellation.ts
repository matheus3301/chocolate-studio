import type { CancellationSignal } from './transport.js';

/** Explicit cancellation usable in non-DOM hosts as well as deterministic tests. */
export class CancellationSource {
  #aborted = false;
  readonly #listeners = new Set<() => void>();
  readonly signal: CancellationSignal;

  constructor() {
    const source = this;
    this.signal = Object.freeze({
      get aborted() { return source.#aborted; },
      addEventListener(_type: 'abort', listener: () => void) { source.#listeners.add(listener); },
      removeEventListener(_type: 'abort', listener: () => void) { source.#listeners.delete(listener); },
    });
  }
  cancel(): void {
    if (this.#aborted) return;
    this.#aborted = true;
    const listeners = [...this.#listeners];
    this.#listeners.clear();
    for (const listener of listeners) listener();
  }
}
