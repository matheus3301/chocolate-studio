import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { StudioConfiguration } from '@chocolate-studio/midi';
import type { HardwareService, HardwareSnapshot, RawBackup, WritePreview } from './hardware.js';
import { validConfiguration } from './editor.js';
import { database } from './storage.js';
import { Dialog, Icon } from './components.js';
import { downloadFile } from './useStudio.js';
import { MusicalReview } from './MusicalReview.js';

type StoredRawBackup = RawBackup & { source: 'device' | 'file' };
export function HardwarePanel({ service, state, configuration, onReviewRead, onNotice }: {
  service: HardwareService; state: HardwareSnapshot; configuration: StudioConfiguration;
  onReviewRead: (configuration: StudioConfiguration) => void; onNotice: (key: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const [inputId, setInput] = useState('');
  const [outputId, setOutput] = useState('');
  const [pending, setPending] = useState(false);
  const [preview, setPreview] = useState<WritePreview | null>(null);
  const [restore, setRestore] = useState<RawBackup | null>(null);
  const [copies, setCopies] = useState<StoredRawBackup[]>([]);
  const [page, setPage] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const unavailable = state.status === 'unavailable';
  const busy = pending || state.status === 'busy' || state.status === 'connecting' || state.status === 'requesting';
  const connected = state.selection !== null && (state.status === 'connected' || state.status === 'busy' || state.status === 'error');

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        // Store exact owned bytes, not an intent re-encoding. Device baseline stays separate.
        for (const raw of [state.observed?.rawBackup, state.baseline]) {
          if (raw) await database.rawBackups.put({ ...raw, bytes: new Uint8Array(raw.bytes), source: 'device' });
        }
        const stored = await database.rawBackups.orderBy('capturedAt').reverse().toArray();
        if (active) setCopies(stored);
      } catch { if (active && (state.observed || state.baseline)) onNotice('rawSnapshotError'); }
    })();
    return () => { active = false; };
  }, [state.observed, state.baseline]);

  useEffect(() => {
    if (inputId && !state.inputs.some((port) => port.id === inputId)) setInput('');
    if (outputId && !state.outputs.some((port) => port.id === outputId)) setOutput('');
  }, [state.inputs, state.outputs, inputId, outputId]);

  async function perform(action: () => Promise<unknown>) {
    setPending(true);
    try { await action(); }
    catch { onNotice(service.getSnapshot().reason ?? 'hardwareError'); }
    finally { setPending(false); }
  }
  function exportRaw(raw: RawBackup) {
    downloadFile(new Uint8Array(raw.bytes).buffer, `chocolate-${raw.sha256.slice(0, 12)}.fcp`, 'application/octet-stream');
  }
  async function importRaw(file: File) {
    if (file.size !== 23_646) { onNotice('hardware.invalidBackup'); return; }
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
      const raw: StoredRawBackup = {
        id: crypto.randomUUID(), bytes, sha256: [...digest].map((value) => value.toString(16).padStart(2, '0')).join(''),
        capturedAt: Date.now(), identity: { name: t('unknownIdentity'), manufacturer: null, model: null, firmware: null }, source: 'file',
      };
      await database.rawBackups.put(raw);
      setCopies(await database.rawBackups.orderBy('capturedAt').reverse().toArray());
      // Import never restores automatically and never creates observed/verified state.
    } catch { onNotice('rawSnapshotError'); }
  }
  const warningKeys = state.observed?.warnings ?? [];
  return <section className="panel hardware-panel" aria-label={t('ports')}>
    <header className="section-heading"><div><p className="eyebrow">MIDI</p><h2>{state.identity?.name ?? t('ports')}</h2></div><span className="status-dot" aria-hidden="true" /></header>
    {unavailable ? <p className="helper" id="hardware-unavailable">{t('hardwareHint')}</p> : state.reason && <p className="helper" role="status">{t(state.reason, { defaultValue: state.reason })}</p>}
    {state.identity && <p className="device-identity">{[state.identity.manufacturer, state.identity.model, state.identity.firmware].filter(Boolean).join(' · ')}</p>}
    <div className="port-fields"><label className="field"><span>{t('input')}</span><select value={inputId} disabled={unavailable || busy || connected} onChange={(event) => setInput(event.target.value)}><option value="">{t('choosePort')}</option>{state.inputs.map((port) => <option value={port.id} key={port.id}>{port.name}</option>)}</select></label>
      <label className="field"><span>{t('output')}</span><select value={outputId} disabled={unavailable || busy || connected} onChange={(event) => setOutput(event.target.value)}><option value="">{t('choosePort')}</option>{state.outputs.map((port) => <option value={port.id} key={port.id}>{port.name}</option>)}</select></label></div>
    <div className="button-row"><button className="secondary" disabled={unavailable || busy || connected} aria-describedby={unavailable ? 'hardware-unavailable' : undefined} onClick={() => void perform(() => service.requestPorts())}>{t('requestPorts')}</button>
      {connected ? <button className="secondary" disabled={pending} onClick={() => void perform(() => service.disconnect())}>{t('disconnect')}</button> : <button className="secondary" disabled={unavailable || busy || !inputId || !outputId} onClick={() => void perform(() => service.connect({ inputId, outputId }))}>{t('connect')}</button>}
      <button className="secondary" disabled={busy || !state.capabilities.read} onClick={() => void perform(() => service.read())}>{t('read')}</button>
      <button className="primary" disabled={busy || !state.capabilities.preview} onClick={() => void perform(async () => {
        let checked: StudioConfiguration;
        try { checked = validConfiguration(configuration); } catch { onNotice('invalidDraft'); return; }
        setPreview(await service.preview(checked)); setPage(0);
      })}>{t('previewWrite')}</button></div>
    <dl className="device-states"><div><dt>{t('draft')}</dt><dd>{t('localOnly')}</dd></div><div><dt>{t('lastRead')}</dt><dd>{state.observed ? new Date(state.observed.readAt).toLocaleTimeString(i18n.language) : t('none')}</dd></div><div><dt>{t('lastVerified')}</dt><dd>{state.verified ? new Date(state.verified.verifiedAt).toLocaleTimeString(i18n.language) : t('none')}</dd></div></dl>
    {state.observed && <><div className="button-row"><button className="text-button" onClick={() => onReviewRead(structuredClone(state.observed!.configuration))}>{t('readToDraft')}</button><button className="text-button" onClick={() => exportRaw(state.observed!.rawBackup)}>{t('downloadRaw')}</button></div>{warningKeys.map((warning, index) => <p className="warning-text" key={`${warning}-${index}`}>{t(warning, { defaultValue: warning })}</p>)}</>}
    <details className="raw-library"><summary>{t('rawBackup')} <span>{copies.length}</span></summary><p className="helper">{t('rawFileHint')}</p><button className="secondary" onClick={() => fileInput.current?.click()}><Icon name="upload" />{t('importRaw')}</button><input className="visually-hidden" type="file" accept=".fcp,application/octet-stream" ref={fileInput} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void importRaw(file); }} />
      {copies.map((raw) => <article className="raw-copy" key={raw.id}><div><strong>{raw.source === 'file' ? t('rawImported') : raw.identity.name}</strong><small>{new Date(raw.capturedAt).toLocaleString(i18n.language)} · {raw.bytes.byteLength} B</small><code title={raw.sha256}>{raw.sha256.slice(0, 16)}</code></div><div className="button-row"><button className="text-button" onClick={() => exportRaw(raw)}>{t('download')}</button><button className="text-button" disabled={busy || !state.capabilities.restore} onClick={() => setRestore(raw)}>{t('restoreRaw')}</button></div></article>)}
    </details>
    {preview && <Dialog title={t('writeReview')} onClose={() => { if (!busy) setPreview(null); }}>
      {state.observed && <MusicalReview before={state.observed.configuration} after={preview.configuration} />}
      {[...preview.warnings, ...preview.unsupported].map((warning, index) => <p className="warning-text" key={`${warning}-${index}`}>{t(warning, { defaultValue: warning })}</p>)}
      <details className="technical-review"><summary>{t('technicalDetails')}</summary><p className="helper">{t('patchCount', { count: preview.patches.length })}</p><p className="hash">SHA256 {preview.baselineSha256}</p>
      <div className="diff-scroll"><table><thead><tr><th>{t('offset')}</th><th>{t('before')}</th><th>{t('after')}</th></tr></thead><tbody>{preview.patches.slice(page * 100, (page + 1) * 100).map((patch, index) => <tr key={`${patch.offset}-${index}`}><td>{patch.offset}</td><td><code>{patch.before.toString(16).padStart(2, '0')}</code></td><td><code>{patch.after.toString(16).padStart(2, '0')}</code></td></tr>)}</tbody></table></div>
      {preview.patches.length > 100 && <div className="pagination"><button disabled={!page} onClick={() => setPage(page - 1)}>{t('previous')}</button><span>{page + 1} / {Math.ceil(preview.patches.length / 100)}</span><button disabled={(page + 1) * 100 >= preview.patches.length} onClick={() => setPage(page + 1)}>{t('next')}</button></div>}
      </details>
      <footer className="dialog-footer"><button className="secondary" disabled={busy} onClick={() => setPreview(null)}>{t('cancel')}</button><button className="primary" disabled={busy || !state.capabilities.write || preview.unsupported.length > 0 || preview.patches.length === 0} onClick={() => void perform(async () => { await service.write(preview.id); setPreview(null); })}>{t('write')}</button></footer></Dialog>}
    {restore && <Dialog title={t('restoreRaw')} onClose={() => { if (!busy) setRestore(null); }}>
      <p>{t('restoreRawConfirm')}</p>
      {restore.source === 'file' && <p role="status" className="warning-text">{t('rawIdentityWarning')}</p>}
      <p className="hash">SHA256 {restore.sha256}</p>
      <p className="helper">{restore.bytes.byteLength} B · {restore.identity.name}</p>
      <footer className="dialog-footer">
        <button className="secondary" disabled={busy} onClick={() => setRestore(null)}>{t('cancel')}</button>
        <button className="primary" disabled={busy || !state.capabilities.restore} onClick={() => void perform(async () => { await service.restore(restore); setRestore(null); })}>{t('restoreRaw')}</button>
      </footer>
    </Dialog>}
  </section>;
}
