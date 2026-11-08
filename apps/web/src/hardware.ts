import type { StudioConfiguration } from '@chocolate-studio/midi';

export const HARDWARE_HISTORY_LIMIT = 200;
export interface MidiPort { id: string; name: string; manufacturer: string }
export interface PortSelection { inputId: string; outputId: string }
export interface DeviceIdentity { name: string; manufacturer: string | null; model: string | null; firmware: string | null }
export interface RawBackup {
  id: string;
  /** Files have no device identity signature; the real adapter validates their complete layout and explicit target. */
  source?: 'device' | 'file';
  /** Complete owned copy, never a normalized/re-encoded reconstruction. */
  bytes: Uint8Array;
  sha256: string;
  capturedAt: number;
  identity: DeviceIdentity;
}
/** Stored configuration facts, never telemetry from the physical display/footswitches. */
export interface ControllerReadMetadata {
  rawMode: number;
  modeKind: 'program-change' | 'advanced' | 'unclassified';
  displayStyle: 'pc-number' | 'unobserved';
  storedAdvancedGroupIndex: number | null;
  storedAdvancedMaxGroupIndex: number | null;
  pcDisplayEnabled: boolean | null;
  pcMaxGroupIndex: number | null;
  ccMaxGroupIndex: number | null;
}
export interface DeviceRead {
  /** Independent Advanced/Mixed intent plus raw controller settings; opaque bytes remain in rawBackup. */
  configuration: StudioConfiguration;
  rawBackup: RawBackup;
  readAt: number;
  warnings: string[];
  controller?: ControllerReadMetadata;
}
export interface VerifiedDeviceRead extends DeviceRead {
  /** Set only after ACK plus complete reread comparison, never on send alone. */
  verifiedAt: number;
}
export interface BytePatch { offset: number; before: number; after: number }
export interface WritePreview {
  /** Adapter-owned token, bound to this session and exact complete baseline hash. */
  id: string;
  baselineSha256: string;
  /** Complete planned configuration, including explicit target mode and reconciled metadata IDs. */
  configuration: StudioConfiguration;
  patches: BytePatch[];
  warnings: string[];
  /** Nonempty means write must be rejected, not partially applied. */
  unsupported: string[];
}
export interface HardwareEvent {
  id: string;
  time: number;
  direction: 'in' | 'out' | 'local';
  kind: 'connection' | 'midi' | 'read' | 'write' | 'restore' | 'error';
  summary: string;
  bytes?: number[];
}
export type HardwareStatus = 'unavailable' | 'disconnected' | 'requesting' | 'connecting' | 'connected' | 'busy' | 'error';
export interface OriginalBackupConfirmation {
  baselineId: string;
  sha256: string;
  method: 'stored' | 'downloaded';
}
export interface HardwareSnapshot {
  status: HardwareStatus;
  /** Human-readable reason/error. Never contain private configuration dumps. */
  reason: string | null;
  inputs: MidiPort[];
  outputs: MidiPort[];
  selection: PortSelection | null;
  identity: DeviceIdentity | null;
  capabilities: { read: boolean; preview: boolean; write: boolean; restore: boolean };
  observed: DeviceRead | null;
  verified: VerifiedDeviceRead | null;
  /** The full baseline retained before the first write; not overwritten by reread. */
  baseline: RawBackup | null;
  /** Oldest first, bounded to HARDWARE_HISTORY_LIMIT by the adapter. */
  history: HardwareEvent[];
  connectionEpoch?: number;
  /** Exact first-session image persisted, or explicitly acknowledged after download. */
  backupSafety?: OriginalBackupConfirmation | null;
}

/**
 * Parent supplies hardware-browser.ts. All methods reject on failure; no success
 * fallback. Serialize device operations; invalidate previews on read/disconnect/
 * port changes. Disconnect cancels in-flight I/O and clears observed/verified
 * state rather than presenting another device's state as current.
 */
export interface HardwareService {
  /** Stable object identity until state changes; required by useSyncExternalStore. */
  getSnapshot(): HardwareSnapshot;
  subscribe(listener: () => void): () => void;
  /** User-gesture permission request; publish available input/output ports. */
  requestPorts(): Promise<void>;
  /** Explicit selection required. Never silently select a similarly named port. */
  connect(selection: PortSelection): Promise<void>;
  disconnect(): Promise<void>;
  /** Complete read and raw backup before exposing mapped observed state. */
  read(): Promise<DeviceRead>;
  /** UI/storage attestation; must match the adapter-owned original baseline. */
  acknowledgeBackup(confirmation: OriginalBackupConfirmation): Promise<void>;
  /** Preserve inactive/unknown bytes; reject unsupported intent. Complete controller/mode preview, no MIDI write. */
  preview(configuration: StudioConfiguration): Promise<WritePreview>;
  /** Consume current preview, patch serially, require success ACK and full reread. */
  write(previewId: string): Promise<VerifiedDeviceRead>;
  /** Validate complete raw backup/device identity; write, ACK and exact full reread. */
  restore(backup: RawBackup): Promise<VerifiedDeviceRead>;
  clearHistory(): void;
}

export class HardwareUnavailableError extends Error {
  constructor() { super('Hardware adapter unavailable'); this.name = 'HardwareUnavailableError'; }
}
const unavailableSnapshot: HardwareSnapshot = {
  status: 'unavailable', reason: null, inputs: [], outputs: [], selection: null,
  identity: null, capabilities: { read: false, preview: false, write: false, restore: false },
  observed: null, verified: null, baseline: null, history: [],
  connectionEpoch: 0, backupSafety: null,
};
/** Honest offline boundary until the parent injects the real transport. */
export const unavailableHardware: HardwareService = {
  getSnapshot: () => unavailableSnapshot,
  subscribe: () => () => {},
  async requestPorts() { throw new HardwareUnavailableError(); },
  async connect() { throw new HardwareUnavailableError(); },
  async disconnect() { throw new HardwareUnavailableError(); },
  async acknowledgeBackup() { throw new HardwareUnavailableError(); },
  async read() { throw new HardwareUnavailableError(); },
  async preview() { throw new HardwareUnavailableError(); },
  async write() { throw new HardwareUnavailableError(); },
  async restore() { throw new HardwareUnavailableError(); },
  clearHistory() { unavailableSnapshot.history = []; },
};
