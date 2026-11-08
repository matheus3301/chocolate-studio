// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { useSyncExternalStore } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultConfiguration } from '@chocolate-studio/midi';
import type { StudioConfiguration } from '@chocolate-studio/midi';
import { ConnectionStep } from '../src/ConnectionStep.js';
import { HardwarePanel } from '../src/HardwarePanel.js';
import type { DeviceRead, HardwareService, HardwareSnapshot, VerifiedDeviceRead, WritePreview } from '../src/hardware.js';
import { database } from '../src/storage.js';
import { i18n, initializeLanguage } from '../src/i18n.js';
import { connectionEn, connectionPt } from '../src/connection-i18n.js';
import { persistOriginalBackup } from '../src/connection-backup.js';
import { downloadFile } from '../src/useStudio.js';
import type * as StudioModule from '../src/useStudio.js';

vi.mock('../src/useStudio.js', async importOriginal => ({ ...await importOriginal<typeof StudioModule>(), downloadFile: vi.fn() }));

interface Fixture {
  service: HardwareService;
  publish(patch: Partial<HardwareSnapshot>): void;
  configuration: StudioConfiguration;
}
/** Synthetic service boundary; adapter packet safety is exercised separately. */
function fixture(connected = false, read = false): Fixture {
  const configuration = createDefaultConfiguration();
  const identity = { name: 'FootCtrlPlus_016', manufacturer: 'Synthetic', model: 'Chocolate Plus', firmware: null };
  const bytes = new Uint8Array(23646);
  const original: DeviceRead = { configuration, rawBackup: { id: 'original-1', bytes, sha256: 'synthetic-original', capturedAt: 1, identity }, readAt: 1, warnings: [],
    controller: { rawMode: 0, modeKind: 'program-change', displayStyle: 'pc-number', pcDisplayEnabled: false,
      storedAdvancedGroupIndex: 0, storedAdvancedMaxGroupIndex: 0, pcMaxGroupIndex: null, ccMaxGroupIndex: 0 } };
  let state: HardwareSnapshot = { status: connected ? 'connected' : 'disconnected', reason: null,
    inputs: [], outputs: [], selection: connected ? { inputId: 'in', outputId: 'out' } : null,
    identity: connected ? identity : null, capabilities: { read: connected, preview: connected, write: connected, restore: connected },
    observed: read ? structuredClone(original) : null, verified: null, baseline: read ? structuredClone(original.rawBackup) : null,
    history: [], connectionEpoch: connected ? 1 : 0, backupSafety: null };
  const listeners = new Set<() => void>();
  let sequence = 1;
  let preview: WritePreview | null = null;
  const publish = (patch: Partial<HardwareSnapshot>) => { state = { ...state, ...patch }; for (const listener of listeners) listener(); };
  const service: HardwareService = {
    getSnapshot: () => state,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    async requestPorts() { publish({ status: 'disconnected', inputs: [{ id: 'in', name: 'Synthetic input', manufacturer: 'Test' }], outputs: [{ id: 'out', name: 'Synthetic output', manufacturer: 'Test' }] }); },
    async connect(selection) { publish({ status: 'connected', selection, identity, connectionEpoch: (state.connectionEpoch ?? 0) + 1,
      capabilities: { read: true, preview: true, write: true, restore: true }, observed: null, baseline: null, backupSafety: null }); },
    async disconnect() { preview = null; publish({ status: 'disconnected', selection: null, identity: null, observed: null, verified: null, baseline: null, backupSafety: null,
      connectionEpoch: (state.connectionEpoch ?? 0) + 1, capabilities: { read: false, preview: false, write: false, restore: false } }); },
    async read() {
      if (!state.identity) throw new Error('hardware.notConnected');
      const next = structuredClone(original); next.rawBackup.id = `read-${++sequence}`; next.readAt = sequence;
      preview = null; publish({ observed: next, baseline: state.baseline ?? structuredClone(next.rawBackup), verified: null }); return structuredClone(next);
    },
    async acknowledgeBackup(proof) {
      if (proof.baselineId !== state.baseline?.id || proof.sha256 !== state.baseline.sha256) throw new Error('connection:backupRequired');
      publish({ backupSafety: structuredClone(proof) });
    },
    async preview(next) {
      preview = { id: `preview-${++sequence}`, baselineSha256: state.observed!.rawBackup.sha256, configuration: structuredClone(next),
        patches: [{ offset: 0, before: 0, after: 3 }], warnings: [], unsupported: [] }; return structuredClone(preview);
    },
    async write(id) {
      if (!preview || preview.id !== id || !state.backupSafety) throw new Error('hardware.expiredPreview');
      const verified: VerifiedDeviceRead = { ...structuredClone(original), configuration: structuredClone(preview.configuration),
        rawBackup: { ...structuredClone(original.rawBackup), id: `verified-${++sequence}` }, readAt: sequence, verifiedAt: sequence };
      publish({ observed: verified, verified }); preview = null; return verified;
    },
    async restore() { throw new Error('unused explicit restore in this service fixture'); },
    clearHistory() { publish({ history: [] }); },
  };
  return { service, publish, configuration };
}

interface HarnessProps {
  value: Fixture;
  panel?: boolean;
  configuration?: StudioConfiguration;
  onRead?: (read: DeviceRead) => void;
  onVerified?: (read: VerifiedDeviceRead) => void;
}
function Harness({ value, panel = false, configuration = value.configuration, onRead = () => {}, onVerified }: HarnessProps) {
  const state = useSyncExternalStore(value.service.subscribe, value.service.getSnapshot);
  return panel ? <HardwarePanel compact service={value.service} state={state} configuration={configuration} onReviewRead={() => {}} onNotice={() => {}}
    {...(onVerified ? { onVerified } : {})} /> :
    <ConnectionStep service={value.service} state={state} onRead={onRead} onOffline={() => {}} onNotice={() => {}} />;
}

beforeAll(async () => {
  await initializeLanguage('en');
  if (!HTMLDialogElement.prototype.showModal) HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  if (!HTMLDialogElement.prototype.close) HTMLDialogElement.prototype.close = function () { this.open = false; };
});
beforeEach(async () => { await i18n.changeLanguage('en'); await database.open(); });
afterEach(async () => { cleanup(); vi.restoreAllMocks(); await database.delete(); });

describe('connection wizard', () => {
  it.each(['en', 'pt-BR'] as const)('explains a pending MIDI/SysEx permission prompt in %s', async locale => {
    await i18n.changeLanguage(locale);
    const value = fixture(); const permission = Promise.withResolvers<void>();
    const requestPorts = value.service.requestPorts;
    vi.spyOn(value.service, 'requestPorts').mockImplementation(async () => { value.publish({ status: 'requesting' }); await permission.promise; await requestPorts(); });
    render(<Harness value={value} />);
    const strings = locale === 'en' ? connectionEn : connectionPt;
    fireEvent.click(screen.getByRole('button', { name: strings.findPorts }));
    expect(screen.getByText(strings.permission)).toBeTruthy();
    expect((screen.getByRole('button', { name: strings.continue }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { permission.resolve(); await permission.promise; });
  });

  it('does not turn an identity-only connection into a completed read or an automatic write', async () => {
    const value = fixture(true); const read = vi.spyOn(value.service, 'read'); const write = vi.spyOn(value.service, 'write'); const onRead = vi.fn();
    render(<Harness value={value} onRead={onRead} />);
    expect(screen.getByText(connectionEn.connectedNotRead)).toBeTruthy();
    expect((screen.getByRole('button', { name: connectionEn.continue }) as HTMLButtonElement).disabled).toBe(true);
    expect(read).not.toHaveBeenCalled(); expect(write).not.toHaveBeenCalled(); expect(onRead).not.toHaveBeenCalled();
  });

  it('requires explicit port confirmation and durable original bytes before returning the complete read', async () => {
    const value = fixture(); const onRead = vi.fn(); const connect = vi.spyOn(value.service, 'connect'); const write = vi.spyOn(value.service, 'write');
    render(<Harness value={value} onRead={onRead} />);
    fireEvent.click(screen.getByRole('button', { name: connectionEn.findPorts }));
    await waitFor(() => expect(screen.getByRole('option', { name: 'Synthetic input · Test' })).toBeTruthy());
    fireEvent.change(screen.getByLabelText(connectionEn.input), { target: { value: 'in' } });
    fireEvent.change(screen.getByLabelText(connectionEn.output), { target: { value: 'out' } });
    const start = screen.getByRole('button', { name: connectionEn.connectRead }) as HTMLButtonElement;
    expect(start.disabled).toBe(true); fireEvent.click(screen.getByLabelText(connectionEn.confirmPorts)); fireEvent.click(start);
    await waitFor(() => expect((screen.getByRole('button', { name: connectionEn.continue }) as HTMLButtonElement).disabled).toBe(false));
    expect(connect).toHaveBeenCalledWith({ inputId: 'in', outputId: 'out' });
    const original = value.service.getSnapshot().baseline!;
    expect((await database.rawBackups.get(original.id))?.bytes).toEqual(original.bytes);
    expect(onRead).not.toHaveBeenCalled(); fireEvent.click(screen.getByRole('button', { name: connectionEn.continue }));
    expect(onRead).toHaveBeenCalledWith(value.service.getSnapshot().observed);
    expect(write).not.toHaveBeenCalled();
  });

  it('requires an explicit saved-file acknowledgement after failed persistence, not merely download', async () => {
    vi.spyOn(database.rawBackups, 'put').mockRejectedValue(new Error('storage unavailable'));
    const value = fixture(true, true); const onRead = vi.fn(); render(<Harness value={value} onRead={onRead} />);
    await waitFor(() => expect(screen.getByText(connectionEn.backupStorageFailed)).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: connectionEn.downloadOriginal }));
    expect(downloadFile).toHaveBeenCalled();
    expect((screen.getByRole('button', { name: connectionEn.continue }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText(connectionEn.downloadedAcknowledgement));
    await waitFor(() => expect((screen.getByRole('button', { name: connectionEn.continue }) as HTMLButtonElement).disabled).toBe(false));
    expect(screen.getByText(connectionEn.backupDownloaded)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: connectionEn.continue })); expect(onRead).toHaveBeenCalledTimes(1);
    expect(value.service.getSnapshot().backupSafety?.method).toBe('downloaded');
  });

  it('blocks continuation after disconnect even if a previously completed read was visible', async () => {
    const value = fixture(true, true); const onRead = vi.fn(); render(<Harness value={value} onRead={onRead} />);
    await waitFor(() => expect((screen.getByRole('button', { name: connectionEn.continue }) as HTMLButtonElement).disabled).toBe(false));
    await act(async () => { await value.service.disconnect(); });
    expect((screen.getByRole('button', { name: connectionEn.continue }) as HTMLButtonElement).disabled).toBe(true);
    expect(onRead).not.toHaveBeenCalled();
  });
});

describe('original backup persistence proof', () => {
  it('rejects corrupted stored bytes without releasing the backup gate', async () => {
    const value = fixture(true, true);
    const stored = structuredClone(value.service.getSnapshot().baseline!); stored.bytes[11] = 5;
    const acknowledge = vi.spyOn(value.service, 'acknowledgeBackup');
    await expect(persistOriginalBackup(value.service, { put: async () => {}, get: async () => ({ ...stored, source: 'device' }) })).rejects.toThrow('connection:backupReadMismatch');
    expect(acknowledge).not.toHaveBeenCalled(); expect(value.service.getSnapshot().backupSafety).toBeNull();
  });

  it('cannot attest a saved original into a different connection epoch', async () => {
    const value = fixture(true, true); const gate = Promise.withResolvers<void>(); const original = structuredClone(value.service.getSnapshot().baseline!);
    const pending = persistOriginalBackup(value.service, { put: async () => { await gate.promise; }, get: async () => ({ ...original, source: 'device' }) });
    const rejected = expect(pending).rejects.toThrow('connection:disconnected');
    await value.service.disconnect(); gate.resolve(); await rejected;
    expect(value.service.getSnapshot().backupSafety).toBeNull();
  });
});

describe('compact review approval', () => {
  it.each(['draft', 'read', 'disconnect'] as const)('invalidates the visible preview after %s changes', async change => {
    const value = fixture(true, true); const write = vi.spyOn(value.service, 'write');
    const view = render(<Harness value={value} panel />);
    await waitFor(() => expect((screen.getByRole('button', { name: connectionEn.reviewSave }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: connectionEn.reviewSave })); await screen.findByRole('dialog');
    if (change === 'draft') {
      const next = structuredClone(value.configuration); next.groups[0]!.switches.A.label = 'Changed after approval'; view.rerender(<Harness value={value} panel configuration={next} />);
    } else await act(async () => { if (change === 'read') await value.service.read(); else await value.service.disconnect(); });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull()); expect(write).not.toHaveBeenCalled();
  });

  it('discards a late preview response if the draft changed while it was being prepared', async () => {
    const value = fixture(true, true); const plan = await value.service.preview(value.configuration);
    const deferred = Promise.withResolvers<WritePreview>(); vi.spyOn(value.service, 'preview').mockReturnValueOnce(deferred.promise);
    const view = render(<Harness value={value} panel />);
    await waitFor(() => expect((screen.getByRole('button', { name: connectionEn.reviewSave }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: connectionEn.reviewSave }));
    const changed = structuredClone(value.configuration); changed.groups[0]!.switches.A.label = 'New draft'; view.rerender(<Harness value={value} panel configuration={changed} />);
    await act(async () => { deferred.resolve(plan); await deferred.promise; }); expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keeps ready mode/backup detail behind disclosures and calls physical-test navigation only after write verification', async () => {
    const value = fixture(true, true); const verified = vi.fn(); render(<Harness value={value} panel onVerified={verified} />);
    await waitFor(() => expect((screen.getByRole('button', { name: connectionEn.reviewSave }) as HTMLButtonElement).disabled).toBe(false));
    expect(screen.getByText(connectionEn.pcMode).closest('details')?.open).toBe(false);
    expect(screen.getByRole('button', { name: connectionEn.downloadOriginal, hidden: true }).closest('details')?.open).toBe(false);
    expect(verified).not.toHaveBeenCalled(); fireEvent.click(screen.getByRole('button', { name: connectionEn.reviewSave }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(connectionEn.advancedActivation)).toBeTruthy(); expect(within(dialog).getByText(connectionEn.physicalCaveat)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: i18n.t('write') }));
    await waitFor(() => expect(verified).toHaveBeenCalledTimes(1));
    expect(verified.mock.calls[0]![0].verifiedAt).toBeGreaterThan(0);
  });
});
