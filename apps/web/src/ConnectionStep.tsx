import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DeviceRead, HardwareService, HardwareSnapshot } from './hardware.js';
import { connectionFailureKey, originalBackupIsSafe, useOriginalBackup } from './connection-backup.js';
import { ControllerModeNotice, OriginalBackupControls } from './connection-controls.js';
import { useConnectionTranslation } from './connection-i18n.js';

export interface ConnectionStepProps {
  service: HardwareService;
  state: HardwareSnapshot;
  /** Adoption/replacement review belongs to the parent, not this connection step. */
  onRead: (read: DeviceRead) => void;
  onOffline: () => void;
  onNotice: (key: string) => void;
  onPendingChange?: (pending: boolean) => void;
}

export function ConnectionStep({ service, state, onRead, onOffline, onNotice, onPendingChange }: ConnectionStepProps) {
  const { t } = useTranslation();
  const { ct } = useConnectionTranslation();
  const [inputId, setInput] = useState('');
  const [outputId, setOutput] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const generation = useRef(0);
  const pendingChanged = useRef(onPendingChange); pendingChanged.current = onPendingChange;
  const backup = useOriginalBackup(service, state, onNotice);
  const unavailable = state.status === 'unavailable';
  const busy = pending || ['busy', 'requesting', 'connecting'].includes(state.status);
  const connected = !!state.identity && !!state.selection && state.capabilities.read;
  const read = connected ? state.observed : null;

  useEffect(() => () => { generation.current++; pendingChanged.current?.(false); }, []);
  useEffect(() => {
    if (inputId && !state.inputs.some(port => port.id === inputId)) { setInput(''); setConfirmed(false); }
    if (outputId && !state.outputs.some(port => port.id === outputId)) { setOutput(''); setConfirmed(false); }
  }, [inputId, outputId, state.inputs, state.outputs]);

  async function perform(action: () => Promise<unknown>) {
    const token = ++generation.current;
    setPending(true); setFailure(null); pendingChanged.current?.(true);
    try { await action(); }
    catch (error) {
      if (token === generation.current) {
        const key = connectionFailureKey(error, service);
        setFailure(key); onNotice(key);
      }
    } finally { if (token === generation.current) { setPending(false); pendingChanged.current?.(false); } }
  }
  async function leave(offline: boolean) {
    generation.current++;
    setPending(false); setFailure(null); pendingChanged.current?.(false);
    try { if (!unavailable) await service.disconnect(); }
    catch (error) { onNotice(connectionFailureKey(error, service)); }
    if (offline) onOffline();
  }
  function continueWithRead() {
    const current = service.getSnapshot();
    if (busy || !current.observed || !current.identity || !current.capabilities.read ||
        current.connectionEpoch !== state.connectionEpoch || current.observed.rawBackup.id !== read?.rawBackup.id ||
        !originalBackupIsSafe(current)) { onNotice('connection:backupRequired'); return; }
    onRead(structuredClone(current.observed));
  }

  return <section className="panel connection-step" aria-labelledby="connection-step-title">
    <header className="page-heading"><div><h1 id="connection-step-title">{ct('title')}</h1><p>{ct('intro')}</p></div></header>
    <p className="helper">{ct('cableHelp')}</p>
    {unavailable && <p role="status">{ct('unavailable')}</p>}
    {state.status === 'requesting' && <p role="status">{ct('permission')}</p>}
    {(failure || state.reason) && <p role="alert">{t(failure ?? state.reason!, { defaultValue: ct('failed') })}</p>}
    {!unavailable && !connected && <>
      <button className="secondary" type="button" disabled={busy} onClick={() => void perform(() => service.requestPorts())}>{ct(failure ? 'retry' : 'findPorts')}</button>
      <div className="port-fields">
        <label className="field"><span>{ct('input')}</span><select value={inputId} disabled={busy} onChange={(event) => { setInput(event.target.value); setConfirmed(false); }}>
          <option value="">{ct('choosePort')}</option>{state.inputs.map(port => <option key={port.id} value={port.id}>{port.name} · {port.manufacturer}</option>)}
        </select></label>
        <label className="field"><span>{ct('output')}</span><select value={outputId} disabled={busy} onChange={(event) => { setOutput(event.target.value); setConfirmed(false); }}>
          <option value="">{ct('choosePort')}</option>{state.outputs.map(port => <option key={port.id} value={port.id}>{port.name} · {port.manufacturer}</option>)}
        </select></label>
      </div>
      <label className="check"><input type="checkbox" checked={confirmed} disabled={busy || !inputId || !outputId} onChange={(event) => setConfirmed(event.target.checked)} />{ct('confirmPorts')}</label>
      <button className="primary" type="button" disabled={busy || !inputId || !outputId || !confirmed} onClick={() => void perform(async () => {
        const token = generation.current;
        await service.connect({ inputId, outputId });
        if (token !== generation.current) return;
        await service.read();
      })}>{ct('connectRead')}</button>
    </>}
    {connected && <>
      <p role="status">{ct(busy ? 'checking' : read ? 'readComplete' : 'connectedNotRead')}</p>
      <ControllerModeNotice {...(read?.controller ? { controller: read.controller } : {})} />
      <div className="button-row"><button className="secondary" type="button" disabled={busy} onClick={() => void perform(() => service.read())}>{ct('readAgain')}</button>
        <button className="text-button" type="button" onClick={() => void leave(false)}>{ct('disconnect')}</button></div>
    </>}
    {read && state.baseline && <OriginalBackupControls backup={backup} />}
    <footer className="button-row"><button className="text-button" type="button" onClick={() => void leave(true)}>{ct('offline')}</button>
      <button className="primary" type="button" disabled={busy || !read || !backup.ready} onClick={continueWithRead}>{ct('continue')}</button></footer>
  </section>;
}
