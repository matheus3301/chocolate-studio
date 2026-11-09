import type { StudioConfiguration } from '@chocolate-studio/midi';
import { sameConfiguration, validConfiguration } from './editor.js';
import { DraftConflict } from './storage.js';
import type { Backup, SavedDraft, StudioDatabase } from './storage.js';

export const RECOVERY_DEBOUNCE_MS = 500;
export type RecoveryProblem = 'conflict' | 'storageUnavailable' | 'storageError' | 'invalidDraft';
export interface RecoveryState {
  configuration: StudioConfiguration;
  saved: SavedDraft | null;
  baseline: StudioConfiguration | null;
  loading: boolean;
  localSaving: boolean;
  persistent: boolean;
  problem: RecoveryProblem | null;
  /** Session-only copies when durable replacement was unavailable. Never claim these survived reload. */
  memoryBackups: Backup[];
}

/**
 * Local-only recovery; no hardware access. useStudio exposes this through:
 * - localSaving: IndexedDB work, independent of the explicit-action busy lock.
 * - hasRecoveryDraft: full structural difference from the last clean seed/read/verified baseline,
 *   not device dirtiness and not whether the latest autosave finished. A legacy revision > 0
 *   without a baseline is conservatively offered for recovery; its exact modified state is unknown.
 * - adoptRead(next): explicit replacement decision, after the caller resolves recovery conflicts.
 *   Previous memory is backed up atomically with the persisted replacement. False preserves a
 *   newer edit or reports revision conflict. True with persistent=false is memory-only; the
 *   prior configuration is in memoryBackups, and neither survives browser termination.
 * - markDeviceSynced(next): only the exact editor configuration proven by readback is clean.
 *   A later editor change is not cleared; failed baseline persistence remains dirty.
 *
 * All revision-bearing writes share one queue. Conflicts never reload/advance the revision
 * automatically. The 500ms debounce and unmount flush are best effort: abrupt tab/process
 * termination can lose changes still pending in IndexedDB. beforeunload warns while dirty.
 * Baselines are local database metadata, not a new JSON import/export format.
 */
export class RecoverySession {
  state: RecoveryState;
  private listeners = new Set<() => void>();
  private initialized: Promise<void> | undefined;
  private queue: Promise<unknown> = Promise.resolve();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private generation = 0;
  private replacement = 0;
  private attached = false;

  constructor(private readonly store: StudioDatabase, initial: StudioConfiguration) {
    this.state = { configuration: initial, saved: null, baseline: initial, loading: true,
      localSaving: false, persistent: true, problem: null, memoryBackups: [] };
  }

  get dirty(): boolean {
    const { saved, configuration, baseline } = this.state;
    return !saved || !sameConfiguration(configuration, saved.configuration)
      || !this.sameBaseline(baseline, saved.recoveryBaseline ?? null);
  }

  get hasRecoveryDraft(): boolean {
    return !this.state.baseline || !sameConfiguration(this.state.configuration, this.state.baseline);
  }

  private sameBaseline(left: StudioConfiguration | null, right: StudioConfiguration | null): boolean {
    return left === right || (!!left && !!right && sameConfiguration(left, right));
  }

  private publish(change: Partial<RecoveryState>): void {
    this.state = { ...this.state, ...change };
    for (const listener of this.listeners) listener();
  }

  attach(listener: () => void): () => void {
    this.attached = true;
    this.listeners.add(listener);
    this.schedule();
    return () => {
      this.listeners.delete(listener);
      this.attached = false;
      this.cancelTimer();
      // Best effort on component unmount. Browser termination cannot await IndexedDB.
      if (this.dirty && this.state.persistent && this.state.problem !== 'conflict') void this.save();
    };
  }

  initialize(): Promise<void> {
    return this.initialized ??= (async () => {
      const generation = this.generation;
      try {
        const saved = await this.store.initialize(this.state.configuration);
        this.publish({ saved, baseline: saved.recoveryBaseline ?? null,
          ...(generation === this.generation ? { configuration: saved.configuration } : {}) });
      } catch { this.publish({ persistent: false, problem: 'storageUnavailable' }); }
      finally { this.publish({ loading: false }); this.schedule(); }
    })();
  }

  edit(next: StudioConfiguration): boolean {
    const configuration = validConfiguration(next);
    ++this.generation;
    this.publish({ configuration });
    this.schedule();
    return true;
  }

  private cancelTimer(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  private schedule(): void {
    this.cancelTimer();
    if (!this.attached || this.state.loading || !this.state.persistent || this.state.problem === 'conflict' || !this.dirty) return;
    this.timer = setTimeout(() => { this.timer = undefined; void this.save(); }, RECOVERY_DEBOUNCE_MS);
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(async () => { await this.initialize(); return operation(); });
    this.queue = result.catch(() => undefined);
    return result;
  }

  private failed(error: unknown): void {
    this.cancelTimer();
    this.publish(error instanceof DraftConflict
      ? { problem: 'conflict' }
      : { persistent: false, problem: 'storageError' });
  }

  /** Explicit calls retry unavailable storage, but never refresh a stale revision behind the user's back. */
  save(): Promise<void> {
    this.cancelTimer();
    const generation = this.generation;
    const replacement = this.replacement;
    const configuration = this.state.configuration;
    return this.enqueue(async () => {
      if (generation !== this.generation || replacement !== this.replacement || !this.dirty || this.state.problem === 'conflict') return;
      this.publish({ localSaving: true });
      try {
        if (!this.state.saved) throw new Error('No local revision available');
        const saved = await this.store.save(configuration, this.state.saved.revision, this.state.baseline);
        this.publish({ saved, persistent: true, problem: null });
      } catch (error) { this.failed(error); }
      finally { this.publish({ localSaving: false }); this.schedule(); }
    });
  }

  /** Caller resolves recovery conflicts first. False means the chosen read was not adopted. */
  replace(next: StudioConfiguration, backupName: string, fromRead = false): Promise<boolean> {
    let checked: StudioConfiguration;
    try { checked = validConfiguration(next); }
    catch { this.publish({ problem: 'invalidDraft' }); return Promise.resolve(false); }
    this.cancelTimer();
    const replacement = ++this.replacement;
    const generation = this.generation;
    const current = this.state.configuration;
    const baseline = fromRead ? checked : this.state.baseline;
    return this.enqueue(async () => {
      const currentRequest = () => generation === this.generation && replacement === this.replacement;
      if (!currentRequest() || this.state.problem === 'conflict') return false;
      this.publish({ localSaving: true });
      try {
        if (!this.state.saved || !this.state.persistent) throw new Error('Local recovery unavailable');
        const saved = await this.store.replace(current, checked, this.state.saved.revision, backupName, baseline);
        this.publish({ saved });
        // An edit made while the transaction ran wins over this replacement.
        if (!currentRequest()) return false;
        ++this.generation;
        this.publish({ configuration: saved.configuration, baseline, persistent: true, problem: null });
        return true;
      } catch (error) {
        this.failed(error);
        if (error instanceof DraftConflict || !currentRequest()) return false;
        ++this.generation;
        const copy: Backup = { id: crypto.randomUUID(), name: backupName, configuration: current, createdAt: Date.now() };
        this.publish({ configuration: checked, baseline, memoryBackups: [...this.state.memoryBackups, copy] });
        return true;
      } finally { this.publish({ localSaving: false }); this.schedule(); }
    });
  }

  /** Pass only the exact reconciled configuration proven by readback, not the newest editor value. */
  markDeviceSynced(next: StudioConfiguration): Promise<void> {
    let baseline: StudioConfiguration;
    try { baseline = validConfiguration(next); }
    catch { this.publish({ problem: 'invalidDraft' }); return Promise.resolve(); }
    this.publish({ baseline });
    return this.save();
  }

  /** Explicit external-conflict resolution; pending edits/replacements cannot be overwritten by a late reload. */
  reload(): Promise<boolean> {
    this.cancelTimer();
    const replacement = ++this.replacement;
    const generation = this.generation;
    return this.enqueue(async () => {
      try {
        const saved = await this.store.drafts.get('current');
        if (!saved) throw new Error('Missing draft');
        const configuration = validConfiguration(saved.configuration);
        if (saved.recoveryBaseline) validConfiguration(saved.recoveryBaseline);
        if (generation !== this.generation || replacement !== this.replacement) return false;
        ++this.generation;
        this.publish({ saved, configuration, baseline: saved.recoveryBaseline ?? (saved.revision === 0 ? configuration : null),
          persistent: true, problem: null });
        return true;
      } catch (error) { this.failed(error); return false; }
      finally { this.schedule(); }
    });
  }
}
