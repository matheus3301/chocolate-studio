import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { exportConfiguration, importConfiguration } from '@chocolate-studio/midi';
import { destinationIsUsed, differences, initialConfiguration, setMessages } from '../src/editor.js';
import { DraftConflict, StudioDatabase } from '../src/storage.js';

let database: StudioDatabase;
beforeEach(() => { database = new StudioDatabase(`web-test-${crypto.randomUUID()}`); });
afterEach(async () => { await database.delete(); });

describe('draft replacement and concurrent edits', () => {
  it('backs up unsaved edits, then restores the complete previous draft without losing Bank B', async () => {
    const initial = initialConfiguration('pt-BR');
    const first = await database.initialize(initial);
    const edited = setMessages(initial, initial.groups[0]!.id, 'A', 'secondary', [{ type: 'cc', channel: 16, controller: 80, value: 127 }]);
    edited.groups[0]!.switches.A.behavior = 'alternate';
    edited.name = 'Ensaio · não salvo';
    const imported = initialConfiguration('en');
    imported.name = 'Imported project';
    const replacement = await database.replace(edited, imported, first.revision, 'Before import');
    const backup = (await database.backups.toArray())[0]!;
    expect(backup.configuration).toEqual(edited);
    expect((await database.drafts.get('current'))?.configuration).toEqual(imported);
    const restored = await database.replace(imported, backup.configuration, replacement.revision, 'Before restore');
    database.close();
    await database.open();
    expect((await database.drafts.get('current'))?.configuration.groups[0]?.switches.A).toEqual(edited.groups[0]!.switches.A);
    expect(restored.configuration.name).toBe('Ensaio · não salvo');
    expect((await database.backups.orderBy('createdAt').toArray()).map((copy) => copy.configuration.name).sort()).toEqual(['Ensaio · não salvo', 'Imported project']);
  });

  it('rejects a stale tab before creating a misleading backup or overwriting the newer draft', async () => {
    const initial = initialConfiguration('en');
    const first = await database.initialize(initial);
    const otherTab = new StudioDatabase(database.name);
    try {
      const stale = await otherTab.initialize(initial);
      const changed = structuredClone(initial);
      changed.name = 'Saved in first tab';
      await database.save(changed, first.revision);
      await expect(otherTab.replace(initial, initialConfiguration('pt-BR'), stale.revision, 'Stale backup')).rejects.toBeInstanceOf(DraftConflict);
      expect(await database.backups.count()).toBe(0);
      expect((await database.drafts.get('current'))?.configuration.name).toBe('Saved in first tab');
    } finally { otherTab.close(); }
  });

  it('rejects invalid incoming data without changing either saved state or backups', async () => {
    const initial = initialConfiguration('en');
    const saved = await database.initialize(initial);
    const invalid = structuredClone(initial);
    invalid.groups[0]!.switches.A.actions[0]!.messages[0]!.channel = 17;
    await expect(database.replace(initial, invalid, saved.revision, 'Invalid import')).rejects.toThrow();
    expect((await database.drafts.get('current'))?.configuration).toEqual(initial);
    expect(await database.backups.count()).toBe(0);
  });
});

describe('two-sequence editing and review', () => {
  it('edits Bank B without changing Bank A, and retains its destination through real JSON validation', () => {
    const initial = initialConfiguration('en');
    const group = initial.groups[0]!;
    const edited = setMessages(initial, group.id, 'A', 'secondary', [{ type: 'pc', channel: 9, program: 127, bank: { lsb: 32 }, destinationId: initial.destinations[0]!.id }]);
    edited.groups[0]!.switches.A.behavior = 'shortLong';
    expect(edited.groups[0]!.switches.A.actions).toEqual(group.switches.A.actions);
    const result = importConfiguration(exportConfiguration(edited));
    expect(result.success).toBe(true);
    if (!result.success) throw new Error('Round trip rejected');
    expect(result.data.groups[0]!.switches.A.secondaryMessages).toEqual([{ type: 'pc', channel: 9, program: 127, bank: { lsb: 32 }, destinationId: initial.destinations[0]!.id }]);
    // Secondary-only references must prevent deleting a still-used destination.
    const secondaryOnly = setMessages(edited, group.id, 'A', 'primary', []);
    for (const id of ['B', 'C', 'D'] as const) secondaryOnly.groups[0]!.switches[id].actions = [];
    expect(destinationIsUsed(secondaryOnly, initial.destinations[0]!.id)).toBe(true);
    secondaryOnly.groups[0]!.switches.A.secondaryMessages = [];
    expect(destinationIsUsed(secondaryOnly, initial.destinations[0]!.id)).toBe(false);
  });

  it('reviews removed bank bytes and changed behavior instead of only the first program', () => {
    const initial = initialConfiguration('en');
    const before = setMessages(initial, initial.groups[0]!.id, 'A', 'secondary', [{ type: 'pc', channel: 1, program: 0, bank: { msb: 12, lsb: 0 } }]);
    const after = structuredClone(before);
    const message = after.groups[0]!.switches.A.secondaryMessages![0]!;
    if (message.type !== 'pc') throw new Error('Expected program');
    delete message.bank;
    after.groups[0]!.switches.A.behavior = 'alternate';
    const changes = differences(before, after);
    expect(changes).toContainEqual({ path: ['groups', '0', 'switches', 'A', 'secondaryMessages', '0', 'bank'], before: '{"msb":12,"lsb":0}', after: '—' });
    expect(changes).toContainEqual({ path: ['groups', '0', 'switches', 'A', 'behavior'], before: '—', after: 'alternate' });
  });
});
