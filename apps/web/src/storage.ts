import Dexie from 'dexie';
import type { Table } from 'dexie';
import type { StudioConfiguration } from '@chocolate-studio/midi';
import { validConfiguration } from './editor.js';
import type { Locale } from './editor.js';
import type { RawBackup } from './hardware.js';

export interface SavedDraft {
  id: 'current';
  revision: number;
  configuration: StudioConfiguration;
  updatedAt: number;
  /** Exact last clean seed/read/verified configuration. Missing on legacy edited drafts. */
  recoveryBaseline?: StudioConfiguration;
}
export interface Backup { id: string; name: string; configuration: StudioConfiguration; createdAt: number }
interface Preference { id: 'locale'; value: Locale }
export class DraftConflict extends Error {}

export class StudioDatabase extends Dexie {
  drafts!: Table<SavedDraft, string>;
  backups!: Table<Backup, string>;
  preferences!: Table<Preference, string>;
  rawBackups!: Table<RawBackup & { source: 'device' | 'file' }, string>;

  constructor(name = 'chocolate-studio') {
    super(name);
    this.version(1).stores({ drafts: 'id', backups: 'id, createdAt', preferences: 'id' });
    this.version(2).stores({ rawBackups: 'id, capturedAt, sha256' });
  }

  async initialize(configuration: StudioConfiguration): Promise<SavedDraft> {
    const checked = validConfiguration(configuration);
    return this.transaction('rw', this.drafts, async () => {
      const current = await this.drafts.get('current');
      if (current) {
        validConfiguration(current.configuration);
        if (current.recoveryBaseline) validConfiguration(current.recoveryBaseline);
        // The old initializer created revision zero without a user save.
        if (!current.recoveryBaseline && current.revision === 0) {
          current.recoveryBaseline = current.configuration;
          await this.drafts.put(current);
        }
        return current;
      }
      const draft: SavedDraft = {
        id: 'current', revision: 0, configuration: checked, updatedAt: Date.now(), recoveryBaseline: checked,
      };
      await this.drafts.add(draft);
      return draft;
    });
  }

  async save(configuration: StudioConfiguration, revision: number, baseline?: StudioConfiguration | null): Promise<SavedDraft> {
    const checked = validConfiguration(configuration);
    const checkedBaseline = baseline ? validConfiguration(baseline) : baseline;
    return this.transaction('rw', this.drafts, async () => {
      const current = await this.assertRevision(revision);
      const recoveryBaseline = checkedBaseline === undefined ? current.recoveryBaseline : checkedBaseline;
      const draft: SavedDraft = {
        id: 'current', revision: revision + 1, configuration: checked, updatedAt: Date.now(),
        ...(recoveryBaseline ? { recoveryBaseline } : {}),
      };
      await this.drafts.put(draft);
      return draft;
    });
  }

  /** Preserve the current in-memory draft, including unsaved edits, before any replacement. */
  async replace(current: StudioConfiguration, next: StudioConfiguration, revision: number, backupName: string, baseline?: StudioConfiguration | null): Promise<SavedDraft> {
    const backupConfiguration = validConfiguration(current);
    const configuration = validConfiguration(next);
    const checkedBaseline = baseline ? validConfiguration(baseline) : baseline;
    return this.transaction('rw', this.drafts, this.backups, async () => {
      const stored = await this.assertRevision(revision);
      const recoveryBaseline = checkedBaseline === undefined ? stored.recoveryBaseline : checkedBaseline;
      await this.backups.add({ id: crypto.randomUUID(), name: backupName, configuration: backupConfiguration, createdAt: Date.now() });
      const draft: SavedDraft = {
        id: 'current', revision: revision + 1, configuration, updatedAt: Date.now(),
        ...(recoveryBaseline ? { recoveryBaseline } : {}),
      };
      await this.drafts.put(draft);
      return draft;
    });
  }

  async snapshot(configuration: StudioConfiguration, name: string): Promise<void> {
    await this.backups.add({ id: crypto.randomUUID(), name, configuration: validConfiguration(configuration), createdAt: Date.now() });
  }

  private async assertRevision(revision: number): Promise<SavedDraft> {
    const stored = await this.drafts.get('current');
    if (!stored || stored.revision !== revision) throw new DraftConflict('Draft changed in another tab');
    return stored;
  }
}

export const database = new StudioDatabase();
