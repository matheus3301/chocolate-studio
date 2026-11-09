import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CONFIGURATION_LIMITS, exportConfiguration, importConfiguration } from '@chocolate-studio/midi';
import type { StudioConfiguration } from '@chocolate-studio/midi';
import { initialConfiguration, validConfiguration } from './editor.js';
import { database, DraftConflict } from './storage.js';
import type { Backup } from './storage.js';
import type { Locale } from './editor.js';
import { RecoverySession } from './recovery.js';

export interface LocalEvent { id: string; time: number; kind: 'files' | 'storage'; key: string }
export function downloadFile(data: BlobPart, name: string, type: string): void {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function useStudio() {
  const { t, i18n } = useTranslation();
  const sessionRef = useRef<RecoverySession | null>(null);
  if (!sessionRef.current) sessionRef.current = new RecoverySession(database, initialConfiguration(i18n.language as Locale));
  const session = sessionRef.current;
  const [recovery, setRecovery] = useState(session.state);
  const { configuration, saved, loading, persistent, localSaving } = recovery;
  const [backups, setBackups] = useState<Backup[]>([]);
  const [events, setEvents] = useState<LocalEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [incoming, setIncomingState] = useState<StudioConfiguration | null>(null);
  const importGeneration = useRef(0);
  const active = useRef(false);
  const dirty = session.dirty;
  const hasRecoveryDraft = session.hasRecoveryDraft;

  function record(key: string, kind: LocalEvent['kind'] = 'storage') {
    if (active.current) setEvents((current) => [...current.slice(-199), { id: crypto.randomUUID(), time: Date.now(), kind, key }]);
  }

  function setIncoming(next: StudioConfiguration | null) {
    ++importGeneration.current;
    setIncomingState(next);
  }

  function updateConfiguration(next: StudioConfiguration): boolean {
    try {
      let messages = 0;
      for (const group of [...next.groups, ...(next.mixedGroups ?? [])]) {
        for (const pedal of Object.values(group.switches)) {
          messages += pedal.secondaryMessages?.length ?? 0;
          for (const action of pedal.actions) messages += action.messages.length;
        }
      }
      if (messages > CONFIGURATION_LIMITS.totalMessages) { setNotice('limitReached'); return false; }
      return session.edit(next);
    }
    catch (error) {
      setNotice(error instanceof RangeError ? 'limitReached' : 'invalidDraft');
      return false;
    }
  }

  useEffect(() => {
    active.current = true;
    let previousProblem = session.state.problem;
    const detach = session.attach(() => {
      setRecovery(session.state);
      if (session.state.problem !== previousProblem) {
        previousProblem = session.state.problem;
        setNotice(previousProblem);
        if (previousProblem) record('eventError');
      }
    });
    let current = true;
    void (async () => {
      await session.initialize();
      if (!current) return;
      setRecovery(session.state);
      try {
        const copies = await database.backups.orderBy('createdAt').reverse().toArray();
        if (current) setBackups(copies);
      } catch { if (current) setNotice('storageUnavailable'); }
      if (current) record('eventLoaded');
    })();
    return () => { current = false; active.current = false; ++importGeneration.current; detach(); };
  }, [session]);

  useEffect(() => {
    const preventLoss = (event: BeforeUnloadEvent) => { if (session.dirty) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', preventLoss);
    return () => window.removeEventListener('beforeunload', preventLoss);
  }, [session]);

  function report(error: unknown, fallback: string) {
    if (!active.current) return;
    setNotice(error instanceof DraftConflict ? 'conflict' : fallback);
    record('eventError');
  }

  async function save() {
    setBusy(true);
    try {
      await session.save();
      if (active.current && !session.dirty && !session.state.problem) { setNotice(null); record('eventSaved'); }
    } finally { if (active.current) setBusy(false); }
  }

  function exportProject(project = configuration) {
    try {
      const text = exportConfiguration(project);
      const filename = project.name.replace(/[^\p{L}\p{N}._-]+/gu, '-').slice(0, 80) || 'chocolate-studio';
      downloadFile(text, `${filename}.json`, 'application/json');
      record('eventExport', 'files');
    } catch { setNotice('invalidDraft'); }
  }

  async function importProject(file: File) {
    const generation = ++importGeneration.current;
    setIncomingState(null);
    if (file.size > CONFIGURATION_LIMITS.jsonBytes) { setNotice('fileTooLarge'); return; }
    try {
      const text = await file.text();
      if (generation !== importGeneration.current) return;
      const result = importConfiguration(text);
      if (!result.success) { setNotice(result.error.code === 'size' ? 'fileTooLarge' : 'invalidFile'); return; }
      setIncomingState(result.data);
      setNotice(null);
      record('eventImport', 'files');
    } catch { if (generation === importGeneration.current) setNotice('fileReadError'); }
  }

  async function replaceDraft(next = incoming): Promise<boolean> {
    if (!next) return false;
    const generation = ++importGeneration.current;
    setBusy(true);
    try {
      const adopted = await session.replace(next, t('beforeReplacement'));
      if (!active.current) return adopted;
      if (adopted) {
        if (generation === importGeneration.current) setIncomingState(null);
        await refreshBackups();
        record('eventReplaced');
      }
      return adopted;
    } finally { if (active.current) setBusy(false); }
  }

  /** App must resolve hasRecoveryDraft before calling. True may mean memory-only; inspect persistent/notice. */
  async function adoptRead(next: StudioConfiguration): Promise<boolean> {
    const generation = ++importGeneration.current;
    setBusy(true);
    try {
      const adopted = await session.replace(next, t('beforeReplacement'), true);
      if (adopted && active.current) {
        if (generation === importGeneration.current) setIncomingState(null);
        await refreshBackups();
        record('eventReplaced');
      }
      return adopted;
    } finally { if (active.current) setBusy(false); }
  }

  /** Only a verified, reconciled readback establishes this baseline; this method never contacts hardware. */
  async function markDeviceSynced(next: StudioConfiguration): Promise<void> {
    await session.markDeviceSynced(next);
  }

  async function refreshBackups() {
    try {
      const copies = await database.backups.orderBy('createdAt').reverse().toArray();
      if (active.current) setBackups(copies);
    } catch (error) { report(error, 'storageError'); }
  }

  async function createBackup(name: string) {
    try { validConfiguration(session.state.configuration); } catch { setNotice('invalidDraft'); return; }
    setBusy(true);
    try {
      await database.snapshot(session.state.configuration, name.trim() || t('newBackup'));
      await refreshBackups();
      if (active.current) { setNotice(null); record('eventBackup'); }
    } catch (error) { report(error, 'storageError'); }
    finally { if (active.current) setBusy(false); }
  }

  async function deleteBackup(id: string) {
    setBusy(true);
    try {
      await database.backups.delete(id);
      if (active.current) setBackups((current) => current.filter((backup) => backup.id !== id));
      record('eventDeleted');
    } catch (error) { report(error, 'storageError'); }
    finally { if (active.current) setBusy(false); }
  }

  async function reloadSaved() {
    setBusy(true);
    try { if (await session.reload()) record('eventLoaded'); }
    finally { if (active.current) setBusy(false); }
  }

  return { configuration, setConfiguration: updateConfiguration, saved, backups, events, setEvents, loading, busy,
    persistent, notice, setNotice, incoming, setIncoming, dirty, save, exportProject,
    importProject, replaceDraft, createBackup, deleteBackup, reloadSaved,
    localSaving, hasRecoveryDraft, adoptRead, markDeviceSynced, memoryBackups: recovery.memoryBackups };
}
