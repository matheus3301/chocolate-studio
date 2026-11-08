import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CONFIGURATION_LIMITS, exportConfiguration, importConfiguration } from '@chocolate-studio/midi';
import type { StudioConfiguration } from '@chocolate-studio/midi';
import { initialConfiguration, sameConfiguration, validConfiguration } from './editor.js';
import { database, DraftConflict } from './storage.js';
import type { Backup, SavedDraft } from './storage.js';
import type { Locale } from './editor.js';

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
  const [configuration, setConfiguration] = useState(() => initialConfiguration(i18n.language as Locale));
  const initial = useRef(configuration);
  const [saved, setSaved] = useState<SavedDraft | null>(null);
  const [backups, setBackups] = useState<Backup[]>([]);
  const [events, setEvents] = useState<LocalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [persistent, setPersistent] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [incoming, setIncomingState] = useState<StudioConfiguration | null>(null);
  const importGeneration = useRef(0);
  const dirty = !saved || !sameConfiguration(configuration, saved.configuration);

  function record(key: string, kind: LocalEvent['kind'] = 'storage') {
    setEvents((current) => [...current.slice(-199), { id: crypto.randomUUID(), time: Date.now(), kind, key }]);
  }

  function setIncoming(next: StudioConfiguration | null) {
    ++importGeneration.current;
    setIncomingState(next);
  }

  function updateConfiguration(next: StudioConfiguration): boolean {
    let messages = 0;
    for (const group of next.groups) {
      for (const pedal of Object.values(group.switches)) {
        messages += pedal.secondaryMessages?.length ?? 0;
        for (const action of pedal.actions) messages += action.messages.length;
      }
    }
    if (messages > CONFIGURATION_LIMITS.totalMessages) {
      setNotice('limitReached');
      return false;
    }
    try { exportConfiguration(next); }
    catch (error) {
      setNotice(error instanceof RangeError ? 'limitReached' : 'invalidDraft');
      return false;
    }
    setConfiguration(next);
    return true;
  }
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const draft = await database.initialize(initial.current);
        const copies = await database.backups.orderBy('createdAt').reverse().toArray();
        if (active) {
          setConfiguration(draft.configuration);
          setSaved(draft);
          setBackups(copies);
          setEvents([{ id: crypto.randomUUID(), time: Date.now(), kind: 'storage', key: 'eventLoaded' }]);
        }
      } catch {
        if (active) { setPersistent(false); setNotice('storageUnavailable'); }
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; ++importGeneration.current; };
  }, []);

  useEffect(() => {
    const preventLoss = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', preventLoss);
    return () => window.removeEventListener('beforeunload', preventLoss);
  }, [dirty]);

  function report(error: unknown, fallback: string) {
    setNotice(error instanceof DraftConflict ? 'conflict' : fallback);
    record('eventError');
  }

  async function save() {
    let checked: StudioConfiguration;
    try { checked = validConfiguration(configuration); } catch { setNotice('invalidDraft'); return; }
    setBusy(true);
    try {
      const draft = await database.save(checked, saved?.revision ?? -1);
      setSaved(draft);
      setNotice(null);
      record('eventSaved');
    } catch (error) { report(error, 'storageError'); }
    finally { setBusy(false); }
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
    if (!next || !persistent || !saved) return false;
    try { validConfiguration(configuration); validConfiguration(next); } catch { setNotice('invalidDraft'); return false; }
    setBusy(true);
    try {
      const draft = await database.replace(configuration, next, saved.revision, t('beforeReplacement'));
      setConfiguration(draft.configuration);
      setSaved(draft);
      setIncoming(null);
      setNotice(null);
      setBackups(await database.backups.orderBy('createdAt').reverse().toArray());
      record('eventReplaced');
      return true;
    } catch (error) { report(error, 'storageError'); return false; }
    finally { setBusy(false); }
  }

  async function createBackup(name: string) {
    try { validConfiguration(configuration); } catch { setNotice('invalidDraft'); return; }
    setBusy(true);
    try {
      await database.snapshot(configuration, name.trim() || t('newBackup'));
      setBackups(await database.backups.orderBy('createdAt').reverse().toArray());
      setNotice(null);
      record('eventBackup');
    } catch (error) { report(error, 'storageError'); }
    finally { setBusy(false); }
  }

  async function deleteBackup(id: string) {
    setBusy(true);
    try {
      await database.backups.delete(id);
      setBackups((current) => current.filter((backup) => backup.id !== id));
      record('eventDeleted');
    } catch (error) { report(error, 'storageError'); }
    finally { setBusy(false); }
  }

  async function reloadSaved() {
    setBusy(true);
    try {
      const current = await database.drafts.get('current');
      if (!current) throw new Error('Missing draft');
      const checked = validConfiguration(current.configuration);
      setConfiguration(checked);
      setSaved(current);
      setNotice(null);
      record('eventLoaded');
    } catch (error) { report(error, 'storageError'); }
    finally { setBusy(false); }
  }

  return { configuration, setConfiguration: updateConfiguration, saved, backups, events, setEvents, loading, busy,
    persistent, notice, setNotice, incoming, setIncoming, dirty, save, exportProject,
    importProject, replaceDraft, createBackup, deleteBackup, reloadSaved };
}
