import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { StudioConfiguration } from '@chocolate-studio/midi';
import type { HardwareService, HardwareSnapshot, RawBackup, VerifiedDeviceRead } from './hardware.js';
import { validConfiguration } from './editor.js';
import { database } from './storage.js';
import { Dialog, Icon } from './components.js';
import { MusicalReview } from './MusicalReview.js';
import { ControllerReview } from './ControllerReview.js';
import { connectionFailureKey, exportControllerBackup, originalBackupIsSafe, useOriginalBackup } from './connection-backup.js';
import type { StoredRawBackup } from './connection-backup.js';
import { ControllerModeNotice, OriginalBackupControls } from './connection-controls.js';
import { useConnectionTranslation } from './connection-i18n.js';
import { bindPreview, previewIsCurrent } from './connection-preview.js';
import type { PreviewApproval } from './connection-preview.js';
import { configurationFromBytes } from './hardware-mapping.js';

export interface HardwarePanelProps {
  service: HardwareService;
  state: HardwareSnapshot;
  configuration: StudioConfiguration;
  onReviewRead: (configuration: StudioConfiguration) => void;
  onNotice: (key: string) => void;
  compact?: boolean;
  recoveryOnly?: boolean;
  onVerified?: (read: VerifiedDeviceRead) => void;
  onPendingChange?: (pending: boolean) => void;
}

export function HardwarePanel({ service, state, configuration, onReviewRead, onNotice, compact = false, recoveryOnly = false, onVerified, onPendingChange }: HardwarePanelProps) {
  const { t, i18n } = useTranslation();
  const { ct } = useConnectionTranslation();
  const [inputId, setInput] = useState('');
  const [outputId, setOutput] = useState('');
  const [pending, setPending] = useState(false);
  const [approval, setApproval] = useState<PreviewApproval | null>(null);
  const [restore, setRestore] = useState<RawBackup | null>(null);
  const [copies, setCopies] = useState<StoredRawBackup[]>([]);
  const [page, setPage] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const active = useRef(true);
  const working = useRef(false);
  const previewGeneration = useRef(0);
  const notice = useRef(onNotice); notice.current = onNotice;
  const pendingChanged = useRef(onPendingChange); pendingChanged.current = onPendingChange;
  const signature = useMemo(() => JSON.stringify(configuration), [configuration]);
  const latest = useRef({ signature, state }); latest.current = { signature, state };
  const backup = useOriginalBackup(service, state, onNotice);
  const unavailable = state.status === 'unavailable';
  const busy = pending || ['busy', 'connecting', 'requesting'].includes(state.status);
  const connected = state.selection !== null && state.identity !== null && state.capabilities.read;
  const readId = state.observed?.rawBackup.id;
  const currentApproval = approval && previewIsCurrent(approval, signature, state) ? approval : null;
  const preview = currentApproval?.preview;
  const reviewedConfiguration = useMemo(() => {
    if (!preview || !state.observed) return null;
    const projected = new Uint8Array(state.observed.rawBackup.bytes);
    for (const patch of preview.patches) projected[patch.offset] = patch.after;
    // Decode the actual byte plan, not inactive draft edits the mapper will ignore.
    return configurationFromBytes(projected, preview.configuration).configuration;
  }, [preview, state.observed]);

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; previewGeneration.current++; pendingChanged.current?.(false); };
  }, []);
  useEffect(() => {
    previewGeneration.current++;
    setApproval(null); setRestore(null);
  }, [signature, readId, state.connectionEpoch, connected]);
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        // The original is persisted/checked by useOriginalBackup; later reads are separate copies.
        const raw = state.observed?.rawBackup;
        if (raw && raw.id !== state.baseline?.id) await database.rawBackups.put({ ...structuredClone(raw), source: 'device' });
        const stored = await database.rawBackups.orderBy('capturedAt').reverse().toArray();
        if (live) setCopies(stored);
      } catch { if (live && state.observed) notice.current('rawSnapshotError'); }
    })();
    return () => { live = false; };
  }, [readId, state.baseline?.id, state.backupSafety?.method]);
  useEffect(() => {
    if (inputId && !state.inputs.some(port => port.id === inputId)) setInput('');
    if (outputId && !state.outputs.some(port => port.id === outputId)) setOutput('');
  }, [state.inputs, state.outputs, inputId, outputId]);

  async function perform(action: () => Promise<unknown>) {
    if (working.current) return;
    working.current = true; setPending(true); pendingChanged.current?.(true);
    try { await action(); }
    catch (error) { if (active.current) notice.current(connectionFailureKey(error, service)); }
    finally { working.current = false; if (active.current) { setPending(false); pendingChanged.current?.(false); } }
  }
  async function review() {
    const token = ++previewGeneration.current;
    const originalSignature = latest.current.signature;
    const snapshot = service.getSnapshot();
    const checked = validConfiguration(configuration);
    const candidate = await service.preview(checked);
    const owned = bindPreview(candidate, originalSignature, snapshot);
    if (!active.current || token !== previewGeneration.current || !previewIsCurrent(owned, latest.current.signature, service.getSnapshot())) return;
    setApproval(owned); setPage(0);
  }
  async function writeReviewed() {
    const live = service.getSnapshot();
    if (!approval || !previewIsCurrent(approval, latest.current.signature, live)) { setApproval(null); onNotice('connection:previewExpired'); return; }
    if (!originalBackupIsSafe(live)) { onNotice('connection:backupRequired'); return; }
    const expectedSignature = approval.draftSignature;
    const epoch = approval.epoch;
    const verified = await service.write(approval.preview.id);
    if (!active.current) return;
    setApproval(null);
    if (latest.current.signature === expectedSignature && service.getSnapshot().connectionEpoch === epoch) {
      onNotice('connection:writeVerified'); onVerified?.(structuredClone(verified));
    }
  }
  async function importRaw(file: File) {
    if (file.size !== 23_646) { onNotice('hardware.invalidBackup'); return; }
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
      const raw: StoredRawBackup = { id: crypto.randomUUID(), bytes,
        sha256: [...digest].map(value => value.toString(16).padStart(2, '0')).join(''), capturedAt: Date.now(),
        identity: { name: t('unknownIdentity'), manufacturer: null, model: null, firmware: null }, source: 'file' };
      await database.rawBackups.put(raw);
      const stored = await database.rawBackups.orderBy('capturedAt').reverse().toArray();
      if (active.current) setCopies(stored);
    } catch { if (active.current) onNotice('rawSnapshotError'); }
  }

  return <section className={`panel hardware-panel${compact ? ' hardware-panel-compact' : ''}`} aria-label={ct('reviewSave')}>
    {!recoveryOnly && <><header className="section-heading"><h2>{ct('reviewSave')}</h2></header>
    {!compact && <><ControllerModeNotice {...(state.observed?.controller ? { controller: state.observed.controller } : {})} />
      <p className="helper">{ct('physicalCaveat')}</p></>}
    {compact && state.observed && <p className="helper" role="status">{t(state.verified ? 'lastVerified' : 'lastRead')} · {new Date(state.verified?.verifiedAt ?? state.observed.readAt).toLocaleTimeString(i18n.language)}</p>}
    {!connected && <p role="status">{ct('needsConnection')}</p>}
    {state.reason && <p role="status">{t(state.reason, { defaultValue: ct('failed') })}</p>}
    {state.baseline && (!compact || !backup.ready) && <OriginalBackupControls backup={backup} />}
    <button className="primary" disabled={busy || !state.capabilities.preview || !state.observed || !backup.ready}
      onClick={() => void perform(review)}>{compact ? ct('reviewSave') : t('previewWrite')}</button>

    <details className="connection-details" open={!compact}><summary>{ct('connectionDetails')}</summary>
      {compact && <ControllerModeNotice {...(state.observed?.controller ? { controller: state.observed.controller } : {})} />}
      {compact && state.baseline && backup.ready && <OriginalBackupControls backup={backup} />}
      {unavailable && <p className="helper">{ct('unavailable')}</p>}
      {state.status === 'requesting' && <p role="status">{ct('permission')}</p>}
      {state.identity && <p>{[state.identity.name, state.identity.model].filter(Boolean).join(' · ')}</p>}
      <div className="port-fields"><label className="field"><span>{t('input')}</span><select value={inputId} disabled={unavailable || busy || connected} onChange={event => setInput(event.target.value)}>
        <option value="">{t('choosePort')}</option>{state.inputs.map(port => <option value={port.id} key={port.id}>{port.name}</option>)}
      </select></label><label className="field"><span>{t('output')}</span><select value={outputId} disabled={unavailable || busy || connected} onChange={event => setOutput(event.target.value)}>
        <option value="">{t('choosePort')}</option>{state.outputs.map(port => <option value={port.id} key={port.id}>{port.name}</option>)}
      </select></label></div>
      <div className="button-row"><button className="secondary" disabled={unavailable || busy || connected} onClick={() => void perform(() => service.requestPorts())}>{t('requestPorts')}</button>
        {connected ? <button className="secondary" onClick={() => { previewGeneration.current++; setApproval(null); void service.disconnect().catch(error => onNotice(connectionFailureKey(error, service))); }}>{t('disconnect')}</button> :
          <button className="secondary" disabled={unavailable || busy || !inputId || !outputId} onClick={() => void perform(() => service.connect({ inputId, outputId }))}>{t('connect')}</button>}
        <button className="secondary" disabled={busy || !state.capabilities.read} onClick={() => { previewGeneration.current++; setApproval(null); void perform(() => service.read()); }}>{t('read')}</button></div>
      <dl className="device-states"><div><dt>{t('draft')}</dt><dd>{t('localOnly')}</dd></div><div><dt>{t('lastRead')}</dt><dd>{state.observed ? new Date(state.observed.readAt).toLocaleTimeString(i18n.language) : t('none')}</dd></div>
        <div><dt>{t('lastVerified')}</dt><dd>{state.verified ? new Date(state.verified.verifiedAt).toLocaleTimeString(i18n.language) : t('none')}</dd></div></dl>
      {state.observed && <><div className="button-row"><button className="text-button" onClick={() => onReviewRead(structuredClone(state.observed!.configuration))}>{t('readToDraft')}</button>
        <button className="text-button" onClick={() => exportControllerBackup(state.observed!.rawBackup)}>{t('downloadRaw')}</button></div>
        {state.observed.warnings.map((warning, index) => <p className="warning-text" key={`${warning}-${index}`}>{t(warning, { defaultValue: warning })}</p>)}</>}
    </details>

    </>}
    {recoveryOnly && state.baseline && !backup.ready && <OriginalBackupControls backup={backup} />}
    <details className="raw-library" open={recoveryOnly || undefined}><summary>{ct('backupDetails')} <span>{copies.length}</span></summary><p className="helper">{t('rawFileHint')}</p>
      <button className="secondary" onClick={() => fileInput.current?.click()}><Icon name="upload" />{t('importRaw')}</button>
      <input className="visually-hidden" type="file" tabIndex={-1} aria-label={t('importRaw')} accept=".fcp,application/octet-stream" ref={fileInput} onChange={event => {
        const file = event.target.files?.[0]; event.target.value = ''; if (file) void importRaw(file);
      }} />
      {copies.map(raw => <article className="raw-copy" key={raw.id}><div><strong>{raw.source === 'file' ? t('rawImported') : raw.identity.name}</strong>
        <small>{new Date(raw.capturedAt).toLocaleString(i18n.language)} · {raw.bytes.byteLength} B</small><code title={raw.sha256}>{raw.sha256.slice(0, 16)}</code></div>
        <div className="button-row"><button className="text-button" onClick={() => exportControllerBackup(raw)}>{t('download')}</button>
          <button className="text-button" disabled={busy || !state.capabilities.restore || !backup.ready} onClick={() => setRestore(structuredClone(raw))}>{t('restoreRaw')}</button></div></article>)}
    </details>
    <details><summary>{ct('historyDetails')}</summary><ol>{state.history.map(event => <li key={event.id}>{new Date(event.time).toLocaleTimeString(i18n.language)} · {t(event.summary, { defaultValue: event.summary })}</li>)}</ol></details>

    {preview && <Dialog title={t('writeReview')} onClose={() => { if (!busy) { previewGeneration.current++; setApproval(null); } }}>
      {state.observed && reviewedConfiguration && <><ControllerReview device before={state.observed.configuration} after={reviewedConfiguration} {...(state.observed.controller ? { beforeMode: state.observed.controller.rawMode } : {})} />{reviewedConfiguration.controller?.mode === 3 && <MusicalReview device before={state.observed.configuration} after={reviewedConfiguration} />}</>}
      <p className="helper">{ct('physicalCaveat')}</p>
      {[...preview.warnings, ...preview.unsupported].map((warning, index) => <p className="warning-text" key={`${warning}-${index}`}>{t(warning, { defaultValue: warning })}</p>)}
      <details className="technical-review"><summary>{t('technicalDetails')}</summary><p>{t('patchCount', { count: preview.patches.length })}</p><p className="hash">SHA256 {preview.baselineSha256}</p>
        <div className="diff-scroll"><table><thead><tr><th>{t('offset')}</th><th>{t('before')}</th><th>{t('after')}</th></tr></thead><tbody>{preview.patches.slice(page * 100, (page + 1) * 100).map(patch =>
          <tr key={patch.offset}><td>{patch.offset}</td><td><code>{patch.before.toString(16).padStart(2, '0')}</code></td><td><code>{patch.after.toString(16).padStart(2, '0')}</code></td></tr>)}</tbody></table></div>
        {preview.patches.length > 100 && <div className="pagination"><button disabled={!page} onClick={() => setPage(page - 1)}>{t('previous')}</button><span>{page + 1} / {Math.ceil(preview.patches.length / 100)}</span>
          <button disabled={(page + 1) * 100 >= preview.patches.length} onClick={() => setPage(page + 1)}>{t('next')}</button></div>}
      </details>
      <footer className="dialog-footer"><button className="secondary" disabled={busy} onClick={() => { previewGeneration.current++; setApproval(null); }}>{t('cancel')}</button>
        <button className="primary" disabled={busy || !backup.ready || !state.capabilities.write || preview.unsupported.length > 0 || preview.patches.length === 0} onClick={() => void perform(writeReviewed)}>{t('write')}</button></footer>
    </Dialog>}
    {restore && <Dialog title={t('restoreRaw')} onClose={() => { if (!busy) setRestore(null); }}>
      <p>{t('restoreRawConfirm')}</p>{restore.source === 'file' && <p role="status" className="warning-text">{t('rawIdentityWarning')}</p>}
      <p className="hash">SHA256 {restore.sha256}</p><p>{restore.bytes.byteLength} B · {restore.identity.name}</p>
      <footer className="dialog-footer"><button className="secondary" disabled={busy} onClick={() => setRestore(null)}>{t('cancel')}</button>
        <button className="primary" disabled={busy || !state.capabilities.restore || !backup.ready} onClick={() => void perform(async () => {
          if (!originalBackupIsSafe(service.getSnapshot())) { onNotice('connection:backupRequired'); return; }
          await service.restore(restore); if (active.current) setRestore(null);
        })}>{t('restoreRaw')}</button></footer>
    </Dialog>}
  </section>;
}
