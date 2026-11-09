import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { StudioConfiguration } from '@chocolate-studio/midi';
import type { HardwareService, HardwareSnapshot, VerifiedDeviceRead } from './hardware.js';
import { Dialog } from './components.js';
import { ControllerReview } from './ControllerReview.js';
import { MusicalReview } from './MusicalReview.js';
import { connectionFailureKey, useOriginalBackup } from './connection-backup.js';
import { bindPreview, previewIsCurrent } from './connection-preview.js';
import type { PreviewApproval } from './connection-preview.js';
import { configurationFromBytes } from './hardware-mapping.js';
import { inspectDeviceDraft, savePreviewDisposition } from './workbench-save.js';
import { useWorkbenchConnectionTranslation } from './workbench-connection-i18n.js';

export interface SaveBarProps {
  service: HardwareService;
  state: HardwareSnapshot;
  configuration: StudioConfiguration;
  onNotice: (key: string) => void;
  onVerified?: (read: VerifiedDeviceRead) => void;
  onPendingChange?: (pending: boolean) => void;
  disabled?: boolean;
  onConnect: () => void;
}

export function SaveBar({ service, state, configuration, onNotice, onVerified, onPendingChange, disabled = false, onConnect }: SaveBarProps) {
  const { t } = useTranslation();
  const { wt } = useWorkbenchConnectionTranslation();
  const [pending, setPending] = useState(false);
  const [approval, setApproval] = useState<PreviewApproval | null>(null);
  const [dialog, setDialog] = useState<'changes' | 'mode' | null>(null);
  const [backupRequested, setBackupRequested] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [issues, setIssues] = useState<string[]>([]);
  const active = useRef(false);
  const working = useRef(false);
  const generation = useRef(0);
  const callbacks = useRef({ onNotice, onVerified, onPendingChange });
  callbacks.current = { onNotice, onVerified, onPendingChange };
  const signature = useMemo(() => JSON.stringify(configuration), [configuration]);
  const latest = useRef({ signature, disabled, service }); latest.current = { signature, disabled, service };
  const backup = useOriginalBackup(service, state, key => { if (key !== 'connection:backupStorageFailed') callbacks.current.onNotice(key); });
  const draft = useMemo(() => inspectDeviceDraft(configuration, state), [configuration, state.observed, state.identity, state.selection, state.verified]);
  const connected = !!state.identity && !!state.selection && state.capabilities.read;
  const busy = pending || ['busy', 'connecting', 'requesting'].includes(state.status);
  const capable = connected && !!state.observed && state.capabilities.preview && state.capabilities.write;
  const currentApproval = approval && previewIsCurrent(approval, signature, state) ? approval : null;
  const readId = state.observed?.rawBackup.id;
  const ports = JSON.stringify(state.selection);
  const reviewed = useMemo(() => {
    if (!currentApproval || !state.observed) return null;
    const bytes = state.observed.rawBackup.bytes.slice();
    for (const patch of currentApproval.preview.patches) bytes[patch.offset] = patch.after;
    return configurationFromBytes(bytes, currentApproval.preview.configuration).configuration;
  }, [currentApproval, state.observed]);

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; generation.current++; callbacks.current.onPendingChange?.(false); };
  }, [service]);
  useEffect(() => {
    generation.current++; setApproval(null); setDialog(null); setIssues([]); setFailure(null); setBackupRequested(false);
  }, [signature, readId, state.connectionEpoch, ports, state.capabilities.write, disabled, service]);

  async function perform(action: () => Promise<void>) {
    if (!active.current || working.current || latest.current.disabled) return;
    working.current = true; setPending(true); setFailure(null); callbacks.current.onPendingChange?.(true);
    try { await action(); }
    catch (error) {
      if (active.current && latest.current.service === service) {
        const key = connectionFailureKey(error, service);
        setFailure(key); callbacks.current.onNotice(key);
      }
    } finally {
      working.current = false;
      if (active.current && latest.current.service === service) { setPending(false); callbacks.current.onPendingChange?.(false); }
    }
  }

  async function save(owned: PreviewApproval, modeConfirmed = false) {
    if (!active.current || latest.current.service !== service || latest.current.disabled) return;
    const disposition = savePreviewDisposition(owned, latest.current.signature, service.getSnapshot(), modeConfirmed);
    if (disposition === 'expired') {
      setApproval(null); setDialog(null); setFailure('workbenchConnection:previewExpired'); return;
    }
    if (disposition === 'unsupported') { setIssues(owned.preview.unsupported); return; }
    if (disposition === 'noop') { setApproval(null); setDialog(null); return; }
    if (disposition === 'mode-review') { setApproval(owned); setDialog('mode'); setBackupRequested(true); return; }
    if (disposition === 'backup-required') { setBackupRequested(true); return; }
    // No await between validation and write: this consumes exactly this concrete preview.
    const verified = await service.write(owned.preview.id);
    if (!active.current || latest.current.service !== service) return;
    setApproval(null); setDialog(null);
    const live = service.getSnapshot();
    if (latest.current.signature === owned.draftSignature && live.connectionEpoch === owned.epoch &&
        JSON.stringify(live.selection) === owned.ports && live.verified?.rawBackup.id === verified.rawBackup.id) {
      callbacks.current.onVerified?.(structuredClone(verified));
    }
  }

  async function prepare(reviewOnly: boolean) {
    const token = ++generation.current;
    const expected = latest.current.signature;
    const snapshot = service.getSnapshot();
    const preview = await service.preview(configuration);
    const owned = bindPreview(preview, expected, snapshot);
    if (!active.current || latest.current.service !== service || token !== generation.current || latest.current.disabled || !previewIsCurrent(owned, latest.current.signature, service.getSnapshot())) return;
    setIssues(preview.unsupported);
    setApproval(owned);
    if (reviewOnly) setDialog('changes');
    else await save(owned);
  }

  const pendingChanges = draft.kind === 'changes' || draft.kind === 'unsupported';
  const status = pending ? 'saving' : !connected ? 'disconnected' : draft.kind === 'verified' ? 'verified' : pendingChanges || draft.kind === 'invalid' ? 'changes' : 'noPending';
  const allIssues = [...new Set([...draft.unsupported, ...issues])];
  const warnings = [...new Set([...draft.warnings, ...(currentApproval?.preview.warnings ?? [])])].filter(warning => warning !== 'hardware.labelsLocal');
  const errorKey = failure ?? (state.status === 'error' ? state.reason : null);
  const backupControls = backupRequested && !backup.ready && <section className="device-save-backup" aria-label={wt('backupRequired')}>
    <p role="alert">{wt(backup.phase === 'saving' ? 'backupSaving' : 'backupFailed')}</p>
    <button type="button" disabled={busy} onClick={backup.download}>{wt('download')}</button>
    {backup.canAcknowledge && <button type="button" disabled={busy} onClick={() => void backup.acknowledgeDownload()}>{wt('keptDownload')}</button>}
  </section>;

  return <section className="device-save-bar" aria-label={wt('save')} aria-busy={busy}>
    <div className="device-save-summary"><p className="device-save-status" role="status">{wt(status)}</p>
      {draft.kind === 'invalid' && <p className="device-save-error" role="alert">{wt('invalidDraft')}</p>}
      {connected && !capable && <p className="device-save-error" role="alert">{wt('capability')}</p>}
      {allIssues.length > 0 && <div className="device-save-error" role="alert"><p>{wt('unsupported')}</p><ul>{allIssues.map(issue => <li key={issue}>{t(issue, { defaultValue: issue })}</li>)}</ul></div>}
      {warnings.map(warning => <p className="device-save-warning" key={warning}>{t(warning, { defaultValue: warning })}</p>)}
      {errorKey && <p className="device-save-error" role="alert">{t(errorKey, { defaultValue: wt('failed') })}</p>}
    </div>
    <div className="device-save-actions">
      {!connected && <button type="button" className="device-save-reconnect" disabled={busy} onClick={onConnect}>{wt('reconnect')}</button>}
      <button type="button" className="device-save-submit" disabled={disabled || busy || !capable || draft.kind !== 'changes'} onClick={() => void perform(() => prepare(false))}>{wt('save')}</button>
      <button type="button" className="device-save-review" disabled={disabled || busy || !capable || !pendingChanges} onClick={() => void perform(() => prepare(true))}>{wt('viewChanges')}</button>
    </div>
    {!dialog && backupControls}
    {dialog && currentApproval && reviewed && state.observed && <Dialog title={wt(dialog === 'mode' ? 'modeReview' : 'review')} onClose={() => { if (!busy) { setDialog(null); setApproval(null); } }}>
      <div className="device-save-review-content">
        {dialog === 'mode' && <p className="device-save-mode-impact">{wt('modeImpact')}</p>}
        <ControllerReview device before={state.observed.configuration} after={reviewed} {...(state.observed.controller ? { beforeMode: state.observed.controller.rawMode } : {})} />
        {reviewed.controller?.mode === 3 && <MusicalReview device before={state.observed.configuration} after={reviewed} />}
        <p>{wt('byteChanges', { count: currentApproval.preview.patches.length })}</p>
        <p className="device-save-review-detail">{wt('physical')}</p>
        <div className="device-save-review-actions"><button type="button" disabled={busy} onClick={() => { setDialog(null); setApproval(null); }}>{wt(dialog === 'mode' ? 'cancel' : 'close')}</button>
          {dialog === 'mode' && <button type="button" disabled={disabled || busy || !backup.ready || allIssues.length > 0} onClick={() => void perform(() => save(currentApproval, true))}>{wt('confirmMode')}</button>}
        </div>
        {dialog === 'mode' && backupControls}
      </div>
    </Dialog>}
  </section>;
}
