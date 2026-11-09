import type { StudioConfiguration } from '@chocolate-studio/midi';
import type { DeviceRead, HardwareService, HardwareSnapshot, VerifiedDeviceRead, WritePreview } from '../src/hardware.js';
import { configurationFromBytes, configurationToBytes } from '../src/hardware-mapping.js';

export interface WorkbenchFixture {
  service: HardwareService;
  publish(patch: Partial<HardwareSnapshot>): void;
  configuration: StudioConfiguration;
  changed: StudioConfiguration;
  ports: Pick<HardwareSnapshot, 'inputs' | 'outputs'>;
}

/** Generated zero image, never derived from a user's backup. Protocol I/O has separate endpoint tests. */
export function workbenchFixture(connected = true, mode = 3): WorkbenchFixture {
  let bytes: Uint8Array = new Uint8Array(23646); bytes[0] = mode;
  let sequence = 1;
  const identity = { name: 'FootCtrlPlus_016', manufacturer: 'Synthetic', model: 'Chocolate Plus', firmware: null };
  function makeRead(metadata?: StudioConfiguration): DeviceRead {
    const mapped = configurationFromBytes(bytes, metadata);
    const id = `synthetic-${sequence++}`;
    return { configuration: mapped.configuration, controller: mapped.controller, warnings: mapped.warnings, readAt: sequence,
      rawBackup: { id, sha256: id, bytes: bytes.slice(), capturedAt: sequence, identity } };
  }
  const original = makeRead();
  const ports = { inputs: [{ id: 'in', name: 'SINCO', manufacturer: '' }], outputs: [{ id: 'out', name: 'SINCO', manufacturer: '' }] };
  let state: HardwareSnapshot = { status: connected ? 'connected' : 'disconnected', reason: null,
    inputs: connected ? ports.inputs : [], outputs: connected ? ports.outputs : [],
    selection: connected ? { inputId: 'in', outputId: 'out' } : null, identity: connected ? identity : null,
    observed: connected ? original : null, verified: null, baseline: connected ? original.rawBackup : null,
    backupSafety: connected ? { baselineId: original.rawBackup.id, sha256: original.rawBackup.sha256, method: 'stored' } : null,
    capabilities: { read: connected, preview: connected, write: connected, restore: connected }, connectionEpoch: 1, history: [] };
  const listeners = new Set<() => void>();
  function publish(patch: Partial<HardwareSnapshot>) { state = { ...state, ...patch }; for (const listener of listeners) listener(); }
  let plan: { preview: WritePreview; bytes: Uint8Array } | null = null;
  const service: HardwareService = {
    getSnapshot: () => state,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    async requestPorts() { publish({ ...ports, status: state.identity ? 'connected' : 'disconnected' }); },
    async connect(selection) {
      publish({ selection, identity, connectionEpoch: (state.connectionEpoch ?? 0) + 1, status: 'connected',
        observed: null, verified: null, baseline: null, backupSafety: null,
        capabilities: { read: true, preview: true, write: true, restore: true } });
    },
    async disconnect() {
      plan = null;
      publish({ selection: null, identity: null, connectionEpoch: (state.connectionEpoch ?? 0) + 1, status: 'disconnected',
        observed: null, verified: null, baseline: null, backupSafety: null,
        capabilities: { read: false, preview: false, write: false, restore: false } });
    },
    async read() {
      const read = makeRead(state.observed?.configuration);
      plan = null; publish({ observed: read, baseline: state.baseline ?? read.rawBackup, verified: null });
      return structuredClone(read);
    },
    async acknowledgeBackup(proof) {
      if (proof.baselineId !== state.baseline?.id || proof.sha256 !== state.baseline.sha256) throw new Error('connection:backupRequired');
      publish({ backupSafety: proof });
    },
    async preview(configuration) {
      const mapped = configurationToBytes(bytes, configuration);
      const patches = Array.from(bytes, (before, offset) => ({ offset, before, after: mapped.bytes[offset]! })).filter(patch => patch.before !== patch.after);
      const planned = mapped.unsupported.length ? configuration : configurationFromBytes(mapped.bytes, configuration).configuration;
      const preview: WritePreview = { id: `preview-${sequence++}`, baselineSha256: state.observed!.rawBackup.sha256,
        configuration: structuredClone(planned), patches, unsupported: mapped.unsupported, warnings: mapped.warnings };
      plan = { preview, bytes: mapped.bytes };
      return structuredClone(preview);
    },
    async write(id) {
      if (!plan || plan.preview.id !== id) throw new Error('hardware.expiredPreview');
      if (!state.backupSafety) throw new Error('connection:backupRequired');
      if (plan.preview.unsupported.length) throw new Error('hardware.unsupportedConfiguration');
      bytes = plan.bytes;
      const read = makeRead(plan.preview.configuration);
      const verified: VerifiedDeviceRead = { ...read, verifiedAt: sequence++ };
      plan = null; publish({ observed: read, verified }); return structuredClone(verified);
    },
    async restore() { throw new Error('No implicit restore in workbench fixture'); },
    clearHistory() { publish({ history: [] }); },
  };
  const changed = structuredClone(original.configuration);
  changed.controller = { ...changed.controller, channelIndex: 4 };
  return { service, publish, configuration: original.configuration, changed, ports };
}
