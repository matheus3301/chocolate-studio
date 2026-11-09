import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StudioConfiguration } from '@chocolate-studio/midi';
import { initialConfiguration, setMessages } from '../src/editor.js';
import { RecoverySession } from '../src/recovery.js';
import { StudioDatabase } from '../src/storage.js';

let database: StudioDatabase;
let initial: StudioConfiguration;
beforeEach(() => {
  database = new StudioDatabase(`recovery-${crypto.randomUUID()}`);
  initial = initialConfiguration('en');
});
afterEach(async () => { vi.restoreAllMocks(); await database.delete(); });

function edited(configuration: StudioConfiguration, program: number): StudioConfiguration {
  return setMessages(configuration, configuration.groups[0]!.id, 'A', 'primary', [{ type: 'pc', channel: 9, program }]);
}
async function session(): Promise<RecoverySession> {
  const recovery = new RecoverySession(database, initial);
  await recovery.initialize();
  return recovery;
}

describe('serialized recovery writes', () => {
  it('retains an immediate edit during a pending save, then persists it with the next revision', async () => {
    const recovery = await session();
    const gate = Promise.withResolvers<void>();
    const started = Promise.withResolvers<void>();
    const save = database.save.bind(database);
    vi.spyOn(database, 'save').mockImplementationOnce(async (...args) => {
      started.resolve(); await gate.promise; return save(...args);
    });
    recovery.edit(edited(initial, 11));
    const first = recovery.save();
    await started.promise;
    recovery.edit(edited(initial, 22));
    const second = recovery.save();
    gate.resolve();
    await Promise.all([first, second]);
    const reopened = await session();
    expect(reopened.state.configuration).toEqual(edited(initial, 22));
    expect(reopened.state.saved?.revision).toBe(2);
    expect(recovery.dirty).toBe(false);
    expect(reopened.hasRecoveryDraft).toBe(true);
  });

  it('stops on another tab revision without overwriting that tab or clearing memory edits', async () => {
    const recovery = await session();
    const other = new StudioDatabase(database.name);
    try {
      await other.save(edited(initial, 90), 0);
      recovery.edit(edited(initial, 12));
      await recovery.save();
      expect(recovery.state.problem).toBe('conflict');
      expect(recovery.state.configuration).toEqual(edited(initial, 12));
      expect(recovery.dirty).toBe(true);
      expect(await recovery.replace(edited(initial, 55), 'Before read', true)).toBe(false);
      recovery.edit(edited(initial, 13));
      await recovery.save();
      expect((await database.drafts.get('current'))?.configuration).toEqual(edited(initial, 90));
      expect(await database.backups.count()).toBe(0);
      expect(await recovery.reload()).toBe(true);
      expect(recovery.state.configuration).toEqual(edited(initial, 90));
    } finally { other.close(); }
  });

  it('serializes replacement after an in-flight save and backs up the actual unsaved local edit', async () => {
    const recovery = await session();
    const gate = Promise.withResolvers<void>();
    const started = Promise.withResolvers<void>();
    const save = database.save.bind(database);
    vi.spyOn(database, 'save').mockImplementationOnce(async (...args) => {
      started.resolve(); await gate.promise; return save(...args);
    });
    recovery.edit(edited(initial, 11));
    const saving = recovery.save();
    await started.promise;
    const unsaved = edited(initial, 22);
    recovery.edit(unsaved);
    const read = edited(initial, 33);
    const adoption = recovery.replace(read, 'Before read', true);
    gate.resolve();
    await saving;
    expect(await adoption).toBe(true);
    expect((await database.backups.toArray()).map((copy) => copy.configuration)).toEqual([unsaved]);
    expect((await session()).state.configuration).toEqual(read);
    expect((await session()).hasRecoveryDraft).toBe(false);
  });

  it('does not replace a newer edit or apply an obsolete queued read', async () => {
    const recovery = await session();
    const gate = Promise.withResolvers<void>();
    const started = Promise.withResolvers<void>();
    const save = database.save.bind(database);
    vi.spyOn(database, 'save').mockImplementationOnce(async (...args) => {
      started.resolve(); await gate.promise; return save(...args);
    });
    recovery.edit(edited(initial, 11));
    const saving = recovery.save();
    await started.promise;
    const obsolete = recovery.replace(edited(initial, 22), 'Obsolete', true);
    const latest = recovery.replace(edited(initial, 33), 'Latest', true);
    gate.resolve();
    await saving;
    expect(await obsolete).toBe(false);
    expect(await latest).toBe(true);
    expect((await database.backups.toArray()).map((copy) => copy.name)).toEqual(['Latest']);
    expect(recovery.state.configuration).toEqual(edited(initial, 33));
  });

  it('keeps edits made during a replacement transaction and saves them instead of reverting to its result', async () => {
    const recovery = await session();
    const gate = Promise.withResolvers<void>();
    const started = Promise.withResolvers<void>();
    const replace = database.replace.bind(database);
    vi.spyOn(database, 'replace').mockImplementationOnce(async (...args) => {
      started.resolve(); await gate.promise; return replace(...args);
    });
    const adoption = recovery.replace(edited(initial, 33), 'Before read', true);
    await started.promise;
    recovery.edit(edited(initial, 44));
    const saving = recovery.save();
    gate.resolve();
    expect(await adoption).toBe(false);
    await saving;
    expect((await session()).state.configuration).toEqual(edited(initial, 44));
    expect(recovery.hasRecoveryDraft).toBe(true);
  });

  it('leaves current memory and persisted data intact after invalid replacement input', async () => {
    const recovery = await session();
    recovery.edit(edited(initial, 22));
    const invalid = edited(initial, 33);
    invalid.groups[0]!.switches.A.actions[0]!.messages[0]!.channel = 17;
    expect(await recovery.replace(invalid, 'Invalid', true)).toBe(false);
    expect(recovery.state.configuration).toEqual(edited(initial, 22));
    expect((await database.drafts.get('current'))?.configuration).toEqual(initial);
    expect(await database.backups.count()).toBe(0);
  });
});

describe('clean baselines and unavailable persistence', () => {
  it('distinguishes seed, clean read, local edits and exact verified write across reloads', async () => {
    const recovery = await session();
    expect(recovery.hasRecoveryDraft).toBe(false);
    const read = edited(initial, 10);
    expect(await recovery.replace(read, 'Before read', true)).toBe(true);
    expect((await session()).hasRecoveryDraft).toBe(false);
    const change = edited(read, 20);
    recovery.edit(change);
    await recovery.save();
    expect(recovery.dirty).toBe(false);
    expect((await session()).hasRecoveryDraft).toBe(true);
    await recovery.markDeviceSynced(change);
    expect((await session()).hasRecoveryDraft).toBe(false);
    // Reverting an edit to the exact last clean state must not produce a recovery prompt.
    recovery.edit(edited(change, 30));
    await recovery.save();
    recovery.edit(change);
    await recovery.save();
    expect((await session()).hasRecoveryDraft).toBe(false);
  });

  it('does not mark edits newer than the verified write as device-synced', async () => {
    const recovery = await session();
    const verified = edited(initial, 10);
    const later = edited(initial, 20);
    recovery.edit(later);
    await recovery.markDeviceSynced(verified);
    expect(recovery.state.configuration).toEqual(later);
    expect(recovery.hasRecoveryDraft).toBe(true);
    expect((await database.drafts.get('current'))?.recoveryBaseline).toEqual(verified);
    expect((await session()).hasRecoveryDraft).toBe(true);
  });

  it('preserves the old baseline through import/replacement instead of treating autosave as device save', async () => {
    const recovery = await session();
    const imported = edited(initial, 40);
    expect(await recovery.replace(imported, 'Before import')).toBe(true);
    expect(recovery.dirty).toBe(false);
    expect((await session()).hasRecoveryDraft).toBe(true);
    expect((await database.drafts.get('current'))?.recoveryBaseline).toEqual(initial);
  });

  it('uses legacy revision zero as a seed but conservatively offers legacy manually saved recovery', async () => {
    await database.drafts.put({ id: 'current', revision: 0, updatedAt: 1, configuration: initial });
    expect((await session()).hasRecoveryDraft).toBe(false);
    await database.drafts.put({ id: 'current', revision: 3, updatedAt: 1, configuration: edited(initial, 60) });
    expect((await session()).hasRecoveryDraft).toBe(true);
  });

  it('allows reading and editing in memory when initialization is unavailable, without fake persistence', async () => {
    vi.spyOn(database, 'initialize').mockRejectedValue(new Error('Storage denied'));
    const recovery = await session();
    const local = edited(initial, 22);
    recovery.edit(local);
    const read = edited(initial, 33);
    expect(await recovery.replace(read, 'Before read', true)).toBe(true);
    expect(recovery.state.configuration).toEqual(read);
    expect(recovery.state.memoryBackups[0]?.configuration).toEqual(local);
    expect(recovery.state.saved).toBeNull();
    expect(recovery.state.persistent).toBe(false);
    expect(recovery.state.problem).toBe('storageError');
    expect(recovery.dirty).toBe(true);
    recovery.edit(edited(read, 44));
    expect(recovery.hasRecoveryDraft).toBe(true);
    expect(await database.drafts.count()).toBe(0);
  });

  it('retains edits after quota failure and records verified state without claiming it persisted', async () => {
    const recovery = await session();
    vi.spyOn(database, 'save').mockRejectedValue(new Error('Quota exceeded'));
    const change = edited(initial, 50);
    recovery.edit(change);
    await recovery.save();
    expect(recovery.state.configuration).toEqual(change);
    expect(recovery.dirty).toBe(true);
    expect(recovery.hasRecoveryDraft).toBe(true);
    await recovery.markDeviceSynced(change);
    expect(recovery.hasRecoveryDraft).toBe(false);
    expect(recovery.state.persistent).toBe(false);
    expect(recovery.state.problem).toBe('storageError');
    expect((await database.drafts.get('current'))?.configuration).toEqual(initial);
  });
});
