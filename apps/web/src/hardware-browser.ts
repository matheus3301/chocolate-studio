import { ProtocolSession, encodeCandidatePacket } from '@chocolate-studio/chocolate/protocol';
import { ChocolateError } from '@chocolate-studio/chocolate';
import type { Transport } from '@chocolate-studio/chocolate';
import { studioConfigurationSchema } from '@chocolate-studio/midi';
import type { StudioConfiguration } from '@chocolate-studio/midi';
import { decodeFcp } from '@chocolate-studio/chocolate-layout';
import type { DeviceIdentity, DeviceRead, HardwareEvent, HardwareService, HardwareSnapshot, PortSelection, RawBackup, VerifiedDeviceRead, WritePreview } from './hardware';
import { HARDWARE_HISTORY_LIMIT } from './hardware';
import { configurationFromBytes, configurationToBytes } from './hardware-mapping';

const CONFIG_SIZE = 23646;
const QUALIFIED_IDENTITY = 'FootCtrlPlus_016';
const disabled = { read: false, preview: false, write: false, restore: false };
const enabled = { read: true, preview: true, write: true, restore: true };
const clone = <T>(value: T): T => structuredClone(value);
const equal = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);
const hash = async (bytes: Uint8Array) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes).buffer)), b => b.toString(16).padStart(2, '0')).join('');
const fail = (code: string): never => { throw new Error(code); };
function errorKey(error: unknown): string {
  if (error instanceof Error && error.message.startsWith('hardware.')) return error.message;
  if (error instanceof ChocolateError) {
    const keys: Record<string, string> = { TIMEOUT: 'hardware.timeout', DEVICE_REJECTED: 'hardware.deviceRejected',
      VERIFICATION_MISMATCH: 'hardware.verifyMismatch', SESSION_DESYNCHRONIZED: 'hardware.reconnect',
      CANCELLED: 'hardware.disconnected', DISCONNECTED: 'hardware.disconnected', SESSION_CLOSED: 'hardware.disconnected',
      BUSY: 'hardware.busy', CHECKSUM_MISMATCH: 'hardware.invalidReply', INVALID_PACKET: 'hardware.invalidReply', TRUNCATED_INPUT: 'hardware.invalidReply' };
    return keys[error.code] ?? 'hardware.failed';
  }
  return 'hardware.failed';
}

/** Browser-only adapter. No network, telemetry, auto-selection or implicit write retry. */
export function createBrowserHardware(): HardwareService {
  let state: HardwareSnapshot = {
    status: typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator ? 'disconnected' : 'unavailable',
    reason: null, inputs: [], outputs: [], selection: null, identity: null,
    capabilities: disabled, observed: null, verified: null, baseline: null, history: [],
  };
  const subscribers = new Set<() => void>();
  let access: MIDIAccess | undefined;
  let input: MIDIInput | undefined;
  let output: MIDIOutput | undefined;
  let protocol: ProtocolSession | undefined;
  let cleanupTransport: (() => void) | undefined;
  let busy = false;
  let epoch = 0;
  let abort = new AbortController();
  let baseline: RawBackup | null = null;
  let observed: DeviceRead | null = null;
  let pending: { preview: WritePreview; bytes: Uint8Array; baseline: Uint8Array; epoch: number } | null = null;

  function publish(patch: Partial<HardwareSnapshot>) {
    state = { ...state, ...patch };
    for (const listener of subscribers) listener();
  }
  function event(kind: HardwareEvent['kind'], summary: string, direction: HardwareEvent['direction'] = 'local', bytes?: Uint8Array) {
    const item: HardwareEvent = { id: crypto.randomUUID(), time: Date.now(), kind, summary, direction,
      ...(bytes ? { bytes: Array.from(bytes.slice(0, 64)) } : {}) };
    publish({ history: [...state.history, item].slice(-HARDWARE_HISTORY_LIMIT) });
  }
  function refreshPorts() {
    const port = (p: MIDIPort) => ({ id: p.id, name: p.name || 'MIDI', manufacturer: p.manufacturer || '' });
    publish({ inputs: access ? [...access.inputs.values()].filter(p => p.state === 'connected').map(port) : [],
      outputs: access ? [...access.outputs.values()].filter(p => p.state === 'connected').map(port) : [] });
  }
  async function disconnect() {
    epoch++; abort.abort(); abort = new AbortController(); pending = null;
    protocol?.dispose(); protocol = undefined;
    cleanupTransport?.(); cleanupTransport = undefined;
    const closing = [input, output]; input = undefined; output = undefined;
    observed = null; baseline = null;
    publish({ status: 'disconnected', selection: null, identity: null, capabilities: disabled,
      observed: null, verified: null, baseline: null, reason: null });
    await Promise.allSettled(closing.map(p => p?.close()));
  }
  async function operation<T>(fn: (session: ProtocolSession, generation: number) => Promise<T>): Promise<T> {
    if (busy) return fail('hardware.busy');
    if (!protocol || !state.identity) return fail('hardware.notConnected');
    busy = true; const generation = epoch;
    publish({ status: 'busy', reason: null });
    try {
      const result = await fn(protocol, generation);
      if (generation !== epoch) return fail('hardware.disconnected');
      publish({ status: 'connected' }); return result;
    } catch (error) {
      pending = null;
      if (generation === epoch) {
        // Any failed I/O may leave uncorrelated replies. Reconnect before another operation.
        protocol?.dispose(); protocol = undefined;
        publish({ status: 'error', reason: errorKey(error), capabilities: disabled, verified: null });
        event('error', 'hardware.failed');
      }
      throw error;
    } finally { busy = false; }
  }
  async function makeRead(bytes: Uint8Array, identity: DeviceIdentity, metadata?: StudioConfiguration): Promise<DeviceRead> {
    if (bytes.length !== CONFIG_SIZE) return fail('hardware.invalidBackup');
    const mapped = configurationFromBytes(bytes, metadata);
    const rawBackup: RawBackup = { id: crypto.randomUUID(), bytes: bytes.slice(), sha256: await hash(bytes),
      capturedAt: Date.now(), identity: clone(identity) };
    return { configuration: mapped.configuration, warnings: mapped.warnings, rawBackup, readAt: Date.now() };
  }
  function acceptRead(read: DeviceRead, verified?: VerifiedDeviceRead) {
    observed = clone(read); baseline ??= clone(read.rawBackup);
    publish({ observed: clone(read), baseline: clone(baseline), verified: verified ? clone(verified) : null });
  }
  async function applyBytes(session: ProtocolSession, before: Uint8Array, after: Uint8Array, generation: number) {
    // CubeSuite rewrites this whole advanced-bank region after message edits.
    // Preserve its opaque bytes and activate the requested mode only after data.
    const banksStart = 0x5d, banksEnd = 0x347d;
    if (!equal(before.slice(banksStart, banksEnd), after.slice(banksStart, banksEnd))) {
      await session.writeAndVerify(banksStart, after.slice(banksStart, banksEnd), { signal: abort.signal });
    }
    for (let offset = 1; offset < after.length;) {
      if (offset === banksStart) { offset = banksEnd; continue; }
      if (before[offset] === after[offset]) { offset++; continue; }
      const start = offset;
      while (offset < after.length && offset !== banksStart && before[offset] !== after[offset] && offset - start < 1024) offset++;
      if (generation !== epoch) return fail('hardware.disconnected');
      await session.writeAndVerify(start, after.slice(start, offset), { signal: abort.signal });
    }
    if (before[0] !== after[0]) await session.writeAndVerify(0, after.slice(0, 1), { signal: abort.signal });
    const actual = (await session.readConfiguration({ signal: abort.signal })).snapshot.toUint8Array();
    if (!equal(actual, after)) return fail('hardware.verifyMismatch');
    return actual;
  }

  const service: HardwareService = {
    getSnapshot: () => state,
    subscribe(listener) { subscribers.add(listener); return () => subscribers.delete(listener); },
    async requestPorts() {
      if (!('requestMIDIAccess' in navigator)) return fail('hardware.unsupportedBrowser');
      if (busy) return fail('hardware.busy');
      busy = true; const generation = epoch;
      publish({ status: 'requesting', reason: null });
      try {
        access ??= await navigator.requestMIDIAccess({ sysex: true });
        if (generation !== epoch) return fail('hardware.disconnected');
        if (!access.sysexEnabled) return fail('hardware.sysexRequired');
        access.onstatechange = () => {
          refreshPorts();
          if (input?.state === 'disconnected' || output?.state === 'disconnected') {
            void disconnect().then(() => event('connection', 'hardware.disconnected'));
          }
        };
        refreshPorts(); publish({ status: protocol ? 'connected' : 'disconnected' });
      } catch (error) {
        if (generation === epoch) publish({ status: 'error', reason: 'hardware.permissionDenied' }); throw error;
      } finally { busy = false; }
    },
    async connect(selection: PortSelection) {
      if (busy) return fail('hardware.busy');
      if (!access) return fail('hardware.requestPermission');
      const selectedInput = access.inputs.get(selection.inputId);
      const selectedOutput = access.outputs.get(selection.outputId);
      if (!selectedInput || !selectedOutput || selectedInput.state !== 'connected' || selectedOutput.state !== 'connected') return fail('hardware.portMissing');
      busy = true;
      const closing = disconnect(); const generation = epoch;
      try {
        await closing;
        if (generation !== epoch) return fail('hardware.disconnected');
        publish({ status: 'connecting', reason: null });
        input = selectedInput; output = selectedOutput;
        await Promise.all([input.open(), output.open()]);
        if (generation !== epoch) return fail('hardware.disconnected');
        const dataListeners = new Set<Parameters<Transport['onData']>[0]>();
        const disconnectListeners = new Set<() => void>();
        const onMessage = (message: MIDIMessageEvent) => {
          if (!message.data) return;
          const bytes = new Uint8Array(message.data);
          event('midi', bytes[0] === 0xf0 ? 'SysEx' : 'MIDI', 'in', bytes);
          for (const listener of dataListeners) listener(bytes, message.timeStamp);
        };
        const onState = () => {
          if (selectedInput.state === 'disconnected' || selectedOutput.state === 'disconnected') for (const listener of disconnectListeners) listener();
        };
        selectedInput.addEventListener('midimessage', onMessage);
        selectedInput.addEventListener('statechange', onState); selectedOutput.addEventListener('statechange', onState);
        cleanupTransport = () => {
          selectedInput.removeEventListener('midimessage', onMessage);
          selectedInput.removeEventListener('statechange', onState); selectedOutput.removeEventListener('statechange', onState);
        };
        const transport: Transport = {
          get connected() { return generation === epoch && selectedInput.state === 'connected' && selectedOutput.state === 'connected'; },
          async send(bytes) { selectedOutput.send(Array.from(bytes)); event('midi', 'SysEx', 'out', bytes); },
          onData(listener) { dataListeners.add(listener); return () => dataListeners.delete(listener); },
          onDisconnect(listener) { disconnectListeners.add(listener); return () => disconnectListeners.delete(listener); },
        };
        const connectedSession = new ProtocolSession(transport);
        protocol = connectedSession;
        const identityPacket = await connectedSession.transact(encodeCandidatePacket(0x11, []), p => p.command === 0x11, { timeoutMs: 2000, signal: abort.signal });
        if (generation !== epoch || protocol !== connectedSession) return fail('hardware.disconnected');
        const identityText = new TextDecoder().decode(identityPacket.body.toUint8Array()).split('\0')[0]!;
        if (identityText !== QUALIFIED_IDENTITY) return fail('hardware.unsupportedDevice');
        const identity: DeviceIdentity = { name: identityText, manufacturer: 'M-VAVE', model: 'Chocolate Plus', firmware: null };
        publish({ status: 'connected', identity, selection: clone(selection), capabilities: enabled });
        event('connection', identityText);
      } catch (error) {
        if (generation === epoch) {
          await disconnect(); publish({ status: 'error', reason: errorKey(error) });
        }
        throw error;
      } finally { busy = false; }
    },
    disconnect,
    read() {
      return operation(async (session, generation) => {
        pending = null;
        const bytes = (await session.readConfiguration({ signal: abort.signal })).snapshot.toUint8Array();
        if (generation !== epoch) return fail('hardware.disconnected');
        const read = await makeRead(bytes, state.identity!, observed?.configuration);
        if (generation !== epoch) return fail('hardware.disconnected');
        acceptRead(read); event('read', 'hardware.readComplete'); return clone(read);
      });
    },
    async preview(configuration) {
      if (busy) return fail('hardware.busy');
      if (!protocol || !observed) return fail('hardware.readFirst');
      const valid = studioConfigurationSchema.parse(configuration);
      const before = observed.rawBackup.bytes;
      const mapped = configurationToBytes(before, valid);
      const preview: WritePreview = { id: crypto.randomUUID(), baselineSha256: observed.rawBackup.sha256,
        configuration: clone(valid), patches: [], warnings: mapped.warnings, unsupported: mapped.unsupported };
      for (let i = 0; i < before.length; i++) if (before[i] !== mapped.bytes[i]) preview.patches.push({ offset: i, before: before[i]!, after: mapped.bytes[i]! });
      pending = { preview: clone(preview), bytes: mapped.bytes.slice(), baseline: before.slice(), epoch };
      return clone(preview);
    },
    write(previewId) {
      const plan = pending;
      if (!plan || plan.preview.id !== previewId || plan.epoch !== epoch) return Promise.reject(new Error('hardware.expiredPreview'));
      if (plan.preview.unsupported.length) return Promise.reject(new Error('hardware.unsupportedConfiguration'));
      pending = null;
      return operation(async (session, generation) => {
        const current = (await session.readConfiguration({ signal: abort.signal })).snapshot.toUint8Array();
        if (!equal(current, plan.baseline)) return fail('hardware.conflict');
        const actual = await applyBytes(session, current, plan.bytes, generation);
        if (generation !== epoch) return fail('hardware.disconnected');
        const read = await makeRead(actual, state.identity!, plan.preview.configuration);
        if (generation !== epoch) return fail('hardware.disconnected');
        const verified = { ...read, verifiedAt: Date.now() };
        acceptRead(read, verified); event('write', 'hardware.writeVerified'); return clone(verified);
      });
    },
    restore(backup) {
      const owned = clone(backup);
      return operation(async (session, generation) => {
        pending = null;
        if (owned.bytes.length !== CONFIG_SIZE || await hash(owned.bytes) !== owned.sha256) return fail('hardware.invalidBackup');
        if (owned.source === 'file') {
          // FCP has no model signature. Accept only a structurally valid image,
          // explicitly imported for this already qualified connected controller.
          if (decodeFcp(owned.bytes).issues.length) return fail('hardware.invalidBackup');
        } else if (owned.identity.name !== state.identity?.name) return fail('hardware.invalidBackup');
        const current = (await session.readConfiguration({ signal: abort.signal })).snapshot.toUint8Array();
        const actual = await applyBytes(session, current, owned.bytes, generation);
        if (generation !== epoch) return fail('hardware.disconnected');
        const read = await makeRead(actual, state.identity!);
        if (generation !== epoch) return fail('hardware.disconnected');
        const verified = { ...read, verifiedAt: Date.now() };
        acceptRead(read, verified); event('restore', 'hardware.restoreVerified'); return clone(verified);
      });
    },
    clearHistory() { publish({ history: [] }); },
  };
  return service;
}
