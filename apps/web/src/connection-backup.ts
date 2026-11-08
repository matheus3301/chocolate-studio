import { useEffect, useRef, useState } from 'react';
import type { HardwareService, HardwareSnapshot, OriginalBackupConfirmation, RawBackup } from './hardware.js';
import { database } from './storage.js';
import { downloadFile } from './useStudio.js';

export type StoredRawBackup = RawBackup & { source: 'device' | 'file' };
export interface OriginalBackupStore {
  put(backup: StoredRawBackup): Promise<unknown>;
  get(id: string): Promise<StoredRawBackup | undefined>;
}

export function originalBackupIsSafe(state: HardwareSnapshot): boolean {
  return !!state.baseline && !!state.backupSafety &&
    state.backupSafety.baselineId === state.baseline.id && state.backupSafety.sha256 === state.baseline.sha256 &&
    (state.backupSafety.method === 'stored' || state.backupSafety.method === 'downloaded');
}

/** Checks actual persisted bytes before attesting; never treats a failed put as a backup. */
export async function persistOriginalBackup(service: HardwareService, store: OriginalBackupStore = database.rawBackups): Promise<void> {
  const snapshot = service.getSnapshot();
  const baseline = snapshot.baseline;
  if (!baseline || !snapshot.observed) throw new Error('connection:readFirst');
  const owned: StoredRawBackup = { ...structuredClone(baseline), bytes: new Uint8Array(baseline.bytes), source: 'device' };
  await store.put(owned);
  const saved = await store.get(owned.id);
  if (!saved || saved.sha256 !== owned.sha256 || saved.bytes.length !== owned.bytes.length ||
      !saved.bytes.every((byte, index) => byte === owned.bytes[index])) throw new Error('connection:backupReadMismatch');
  const current = service.getSnapshot();
  if (current.connectionEpoch !== snapshot.connectionEpoch || current.baseline?.id !== owned.id) throw new Error('connection:disconnected');
  await service.acknowledgeBackup({ baselineId: owned.id, sha256: owned.sha256, method: 'stored' });
}

export function exportControllerBackup(raw: RawBackup): void {
  downloadFile(new Uint8Array(raw.bytes).buffer, `chocolate-${raw.sha256.slice(0, 12)}.fcp`, 'application/octet-stream');
}

export function connectionFailureKey(error: unknown, service: HardwareService): string {
  if (error instanceof Error && /^(connection:|hardware\.)/.test(error.message)) return error.message;
  return service.getSnapshot().reason ?? 'connection:failed';
}

export interface OriginalBackupState {
  ready: boolean;
  phase: 'idle' | 'saving' | 'failed' | 'ready';
  method: 'stored' | 'downloaded' | null;
  download(): void;
  acknowledgeDownload(): Promise<void>;
  canAcknowledge: boolean;
}
/** Shared by the wizard and write panel; proof is scoped to the adapter-owned original. */
export function useOriginalBackup(service: HardwareService, state: HardwareSnapshot, onNotice: (key: string) => void): OriginalBackupState {
  const [phase, setPhase] = useState<'idle' | 'saving' | 'failed' | 'ready'>('idle');
  const [downloadedId, setDownloadedId] = useState<string | null>(null);
  const notice = useRef(onNotice);
  notice.current = onNotice;
  const baselineId = state.baseline?.id;
  const sha256 = state.baseline?.sha256;
  useEffect(() => {
    let active = true;
    setDownloadedId(null);
    if (!baselineId || !sha256) { setPhase('idle'); return () => { active = false; }; }
    setPhase('saving');
    void persistOriginalBackup(service).then(() => {
      if (active) setPhase('ready');
    }, () => {
      if (active) { setPhase('failed'); notice.current('connection:backupStorageFailed'); }
    });
    return () => { active = false; };
  }, [service, baselineId, sha256, state.connectionEpoch]);

  function download(): void {
    const original = service.getSnapshot().baseline;
    if (!original || original.id !== baselineId) return;
    try { exportControllerBackup(original); setDownloadedId(original.id); }
    catch { notice.current('connection:backupDownloadFailed'); }
  }
  async function acknowledgeDownload(): Promise<void> {
    const original = service.getSnapshot().baseline;
    if (!original || original.id !== downloadedId || original.id !== baselineId) return;
    const proof: OriginalBackupConfirmation = { baselineId: original.id, sha256: original.sha256, method: 'downloaded' };
    try { await service.acknowledgeBackup(proof); setPhase('ready'); }
    catch (error) { notice.current(connectionFailureKey(error, service)); }
  }
  return { ready: originalBackupIsSafe(state), phase, method: state.backupSafety?.method ?? null, download, acknowledgeDownload,
    canAcknowledge: phase === 'failed' && !!baselineId && downloadedId === baselineId };
}
