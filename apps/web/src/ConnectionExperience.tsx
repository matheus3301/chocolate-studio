import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ConnectionStepProps } from './ConnectionStep.js';
import type { HardwareService, PortSelection } from './hardware.js';
import { connectionFailureKey, useOriginalBackup } from './connection-backup.js';
import { classifyConnectionCandidate, midiPermission, qualifiedConnection } from './workbench-connection.js';
import { useWorkbenchConnectionTranslation } from './workbench-connection-i18n.js';

export type ConnectionExperienceProps = ConnectionStepProps;
// Remember only a pair whose protocol identity was qualified, within this adapter's lifetime.
const rememberedPairs = new WeakMap<HardwareService, PortSelection>();

export function ConnectionExperience({ service, state, onRead, onOffline, onNotice, onPendingChange }: ConnectionExperienceProps) {
  const { t } = useTranslation();
  const { wt } = useWorkbenchConnectionTranslation();
  const [pending, setPending] = useState(false);
  const [autoEnabled, setAutoEnabled] = useState(true);
  const [discovered, setDiscovered] = useState(false);
  const [permission, setPermission] = useState<PermissionState | 'unknown'>('unknown');
  const [failure, setFailure] = useState<string | null>(null);
  const [inputId, setInput] = useState('');
  const [outputId, setOutput] = useState('');
  const active = useRef(false);
  const working = useRef(false);
  const generation = useRef(0);
  const attempted = useRef<string | null>(null);
  const inventory = useRef('');
  const sessionSeen = useRef(false);
  const lastDelivered = useRef<string | null>(null);
  const callbacks = useRef({ onRead, onNotice, onPendingChange });
  callbacks.current = { onRead, onNotice, onPendingChange };
  // Storage failure must not hold the editor hostage. SaveBar presents the fallback when saving.
  useOriginalBackup(service, state, key => { if (key !== 'connection:backupStorageFailed') callbacks.current.onNotice(key); });
  const busy = pending || ['requesting', 'connecting', 'busy'].includes(state.status);
  const connected = qualifiedConnection(state);
  const candidate = classifyConnectionCandidate(state, rememberedPairs.get(service) ?? null, sessionSeen.current);
  const portsKey = JSON.stringify([state.inputs, state.outputs]);

  async function perform(action: (current: () => boolean) => Promise<void>) {
    if (!active.current || working.current) return;
    working.current = true;
    const token = ++generation.current;
    const current = () => active.current && generation.current === token;
    setPending(true); setFailure(null); callbacks.current.onPendingChange?.(true);
    try { await action(current); }
    catch (error) {
      if (current()) {
        const key = connectionFailureKey(error, service);
        setFailure(key); callbacks.current.onNotice(key);
      }
    } finally {
      if (current()) { working.current = false; setPending(false); callbacks.current.onPendingChange?.(false); }
    }
  }

  async function connectPair(selection: PortSelection) {
    await perform(async current => {
      const before = service.getSnapshot();
      if (before.selection || before.identity) throw new Error('hardware.busy');
      await service.connect(selection);
      if (!current()) return;
      const live = service.getSnapshot();
      if (!qualifiedConnection(live) || live.status !== 'connected' || live.selection?.inputId !== selection.inputId || live.selection.outputId !== selection.outputId) return;
      sessionSeen.current = true;
      rememberedPairs.set(service, { ...selection });
      await service.read();
    });
  }

  function discover() {
    attempted.current = null;
    setAutoEnabled(true);
    void perform(async current => {
      const live = service.getSnapshot();
      // Reconnecting is deliberate; never replace a healthy session merely to enumerate ports.
      if (live.status === 'error' && (live.selection || live.identity)) await service.disconnect();
      if (!current()) return;
      await service.requestPorts();
      if (current()) { setPermission('granted'); setDiscovered(true); }
    });
  }

  useEffect(() => {
    active.current = true; working.current = false; attempted.current = null; inventory.current = '';
    lastDelivered.current = null;
    const initial = service.getSnapshot();
    sessionSeen.current = !!initial.selection || !!initial.identity || rememberedPairs.has(service);
    if (qualifiedConnection(initial)) rememberedPairs.set(service, { ...initial.selection! });
    setDiscovered(qualifiedConnection(initial) || initial.inputs.length > 0 || initial.outputs.length > 0);
    let live = true;
    void midiPermission().then(result => {
      if (!live) return;
      setPermission(result);
      if (result === 'granted' && service.getSnapshot().status !== 'unavailable') {
        void perform(async current => { await service.requestPorts(); if (current()) setDiscovered(true); });
      }
    });
    return () => {
      live = false; active.current = false; generation.current++; working.current = false;
      callbacks.current.onPendingChange?.(false);
    };
  }, [service]);

  useEffect(() => {
    if (inventory.current !== portsKey) { inventory.current = portsKey; attempted.current = null; }
    if (inputId && !state.inputs.some(port => port.id === inputId)) setInput('');
    if (outputId && !state.outputs.some(port => port.id === outputId)) setOutput('');
    if ((!discovered && !connected) || !autoEnabled || busy || working.current || state.status === 'unavailable' || state.status === 'error') return;
    if (connected) {
      sessionSeen.current = true;
      rememberedPairs.set(service, { ...state.selection! });
      if (!state.observed) {
        const key = `read:${state.connectionEpoch}:${JSON.stringify(state.selection)}`;
        if (attempted.current !== key) { attempted.current = key; void perform(async () => { await service.read(); }); }
      }
    } else if (candidate.kind === 'candidate') {
      const key = JSON.stringify([candidate.selection, portsKey]);
      if (attempted.current !== key) { attempted.current = key; void connectPair(candidate.selection); }
    }
  }, [service, portsKey, state.status, state.observed, state.connectionEpoch, connected, busy, discovered, autoEnabled, inputId, outputId]);

  useEffect(() => {
    if (!connected || state.status !== 'connected' || !state.observed) return;
    sessionSeen.current = true;
    rememberedPairs.set(service, { ...state.selection! });
    const key = `${state.connectionEpoch}:${state.observed.rawBackup.id}`;
    if (lastDelivered.current === key) return;
    lastDelivered.current = key;
    callbacks.current.onRead(structuredClone(state.observed));
  }, [service, connected, state.status, state.observed, state.connectionEpoch]);

  const message = state.status === 'unavailable' ? 'unavailable' : busy ? (state.status === 'requesting' ? 'permission' : 'reading') :
    connected ? (state.observed ? 'connected' : 'reading') : permission === 'denied' || state.reason === 'hardware.permissionDenied' ? 'denied' :
      !discovered ? 'noPorts' : candidate.kind === 'ambiguous' ? 'ambiguous' : candidate.kind === 'manual' ? 'manual' :
        candidate.kind === 'missing-remembered' ? 'missingRemembered' : candidate.kind === 'candidate' ? 'checking' : 'noPorts';
  const failureKey = failure ?? (state.status === 'error' ? state.reason : null);

  return <section className="connection-experience" aria-label={wt('connect')} aria-busy={busy}>
    <p className="connection-experience-status" role="status">{wt(message)}</p>
    {failureKey && <p className="connection-experience-error" role="alert">{failureKey === 'hardware.unsupportedDevice' ? wt('unsupportedIdentity') : t(failureKey, { defaultValue: wt('failed') })}</p>}
    {!connected && state.status !== 'unavailable' && <button type="button" className="connection-experience-connect" disabled={busy} onClick={discover}>
      {wt(!discovered ? 'connect' : failureKey ? 'retry' : 'refresh')}
    </button>}
    <button type="button" className="connection-experience-offline" disabled={busy} onClick={onOffline}>{wt('offline')}</button>
    <details className="connection-experience-help"><summary>{wt('help')}</summary>
      <p>{wt('cable')}</p>
      {state.selection || state.identity ? <>
        <p>{wt('sessionHelp')}</p>
        <button type="button" disabled={busy} onClick={() => { setAutoEnabled(false); void perform(async () => { await service.disconnect(); }); }}>{wt('disconnect')}</button>
        <button type="button" disabled={busy || !connected} onClick={() => void perform(async () => { await service.read(); })}>{wt('readAgain')}</button>
      </> : <>
        <p>{wt('pairHelp')}</p>
        <label className="connection-experience-port"><span>{wt('input')}</span><select value={inputId} disabled={busy} onChange={event => setInput(event.target.value)}>
          <option value="">{wt('choosePort')}</option>{state.inputs.map(port => <option key={port.id} value={port.id}>{port.name}{port.manufacturer ? ` · ${port.manufacturer}` : ''}</option>)}
        </select></label>
        <label className="connection-experience-port"><span>{wt('output')}</span><select value={outputId} disabled={busy} onChange={event => setOutput(event.target.value)}>
          <option value="">{wt('choosePort')}</option>{state.outputs.map(port => <option key={port.id} value={port.id}>{port.name}{port.manufacturer ? ` · ${port.manufacturer}` : ''}</option>)}
        </select></label>
        <button type="button" disabled={busy || !inputId || !outputId || state.status === 'unavailable'} onClick={() => void connectPair({ inputId, outputId })}>{wt('pair')}</button>
        <button type="button" disabled={busy || state.status === 'unavailable'} onClick={discover}>{wt('refresh')}</button>
      </>}
    </details>
  </section>;
}
