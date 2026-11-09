// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { useSyncExternalStore } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { SaveBar } from '../src/SaveBar.js';
import type { SaveBarProps } from '../src/SaveBar.js';
import type { HardwareSnapshot, WritePreview } from '../src/hardware.js';
import { bindPreview } from '../src/connection-preview.js';
import { inspectDeviceDraft, savePreviewDisposition } from '../src/workbench-save.js';
import { workbenchConnectionEn as en, workbenchConnectionPt as pt } from '../src/workbench-connection-i18n.js';
import { i18n, initializeLanguage } from '../src/i18n.js';
import { database } from '../src/storage.js';
import { downloadFile } from '../src/useStudio.js';
import type * as StudioModule from '../src/useStudio.js';
import { workbenchFixture } from './workbench-fixture.js';
import type { WorkbenchFixture } from './workbench-fixture.js';

vi.mock('../src/useStudio.js', async importOriginal => ({ ...await importOriginal<typeof StudioModule>(), downloadFile: vi.fn() }));

function Harness({ value, configuration = value.changed, onVerified, onConnect = () => {}, disabled = false }: {
  value: WorkbenchFixture; configuration?: SaveBarProps['configuration']; onVerified?: SaveBarProps['onVerified']; onConnect?: SaveBarProps['onConnect']; disabled?: boolean;
}) {
  const state = useSyncExternalStore(value.service.subscribe, value.service.getSnapshot);
  return <SaveBar service={value.service} state={state} configuration={configuration} onNotice={() => {}} onVerified={onVerified} onConnect={onConnect} disabled={disabled} />;
}

beforeAll(async () => {
  await initializeLanguage('en');
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
});
beforeEach(async () => { await i18n.changeLanguage('en'); await database.open(); });
afterEach(async () => { cleanup(); vi.restoreAllMocks(); await database.delete(); });

describe('pure device draft and preview decisions', () => {
  it.each(Array.from({ length: 13 }, (_, mode) => mode))('keeps an unchanged mode %s as a byte-level no-op', mode => {
    const value = workbenchFixture(true, mode);
    const before = value.service.getSnapshot().observed!.rawBackup.bytes.slice();
    const local = structuredClone(value.configuration); local.name = 'Local label only';
    expect(inspectDeviceDraft(local, value.service.getSnapshot()).kind).toBe('noop');
    expect(value.service.getSnapshot().observed!.rawBackup.bytes).toEqual(before);
  });
  it('does not count inactive Advanced edits as device changes in fixed PC mode', () => {
    const value = workbenchFixture(true, 0);
    const local = structuredClone(value.configuration);
    local.groups[0]!.switches.A.actions = [{ gesture: 'press', messages: [{ type: 'pc', channel: 1, program: 42 }] }];
    expect(inspectDeviceDraft(local, value.service.getSnapshot()).kind).toBe('noop');
  });
  it('rejects unsupported gestures rather than presenting a partial save', () => {
    const value = workbenchFixture();
    const local = structuredClone(value.changed);
    local.groups[0]!.switches.A.actions = [{ gesture: 'longPress', messages: [{ type: 'pc', channel: 1, program: 4 }] }];
    const draft = inspectDeviceDraft(local, value.service.getSnapshot());
    expect(draft.kind).toBe('unsupported'); expect(draft.unsupported).toContain('hardware.useTwoSequences');
  });
  it('requires concrete mode review, then a valid original backup', async () => {
    const value = workbenchFixture(true, 0); const local = structuredClone(value.configuration); local.controller!.mode = 3;
    const snapshot = value.service.getSnapshot(); const preview = await value.service.preview(local);
    const approval = bindPreview(preview, 'draft', snapshot);
    expect(savePreviewDisposition(approval, 'draft', snapshot)).toBe('mode-review');
    expect(savePreviewDisposition(approval, 'draft', snapshot, true)).toBe('write');
    expect(savePreviewDisposition(approval, 'draft', { ...snapshot, backupSafety: null }, true)).toBe('backup-required');
    expect(savePreviewDisposition({ ...approval, preview: { ...preview, patches: [] } }, 'draft', snapshot)).toBe('noop');
    expect(savePreviewDisposition({ ...approval, preview: { ...preview, unsupported: ['hardware.useTwoSequences'] } }, 'draft', snapshot, true)).toBe('unsupported');
  });
  it.each(['draft', 'epoch', 'read', 'ports', 'capability'] as const)('invalidates mode acceptance after %s changes', async change => {
    const value = workbenchFixture(true, 0); const local = structuredClone(value.configuration); local.controller!.mode = 3;
    const snapshot = value.service.getSnapshot(); const approval = bindPreview(await value.service.preview(local), 'draft', snapshot);
    const next: HardwareSnapshot = { ...snapshot };
    if (change === 'epoch') next.connectionEpoch = 99;
    if (change === 'read') next.observed = { ...snapshot.observed!, rawBackup: { ...snapshot.observed!.rawBackup, id: 'other-read' } };
    if (change === 'ports') next.selection = { inputId: 'other-in', outputId: 'other-out' };
    if (change === 'capability') next.capabilities = { ...snapshot.capabilities, write: false };
    expect(savePreviewDisposition(approval, change === 'draft' ? 'changed' : 'draft', next, true)).toBe('expired');
  });
});

describe('persistent Save to Chocolate', () => {
  it.each(['en', 'pt-BR'] as const)('saves an ordinary edit without a modal and compares the later draft to verified readback in %s', async locale => {
    await i18n.changeLanguage(locale); const strings = locale === 'en' ? en : pt;
    const value = workbenchFixture(); const verified = vi.fn(); const write = vi.spyOn(value.service, 'write');
    const view = render(<Harness value={value} onVerified={verified} />);
    fireEvent.click(screen.getByRole('button', { name: strings.save }));
    await waitFor(() => expect(verified).toHaveBeenCalledTimes(1)); expect(write).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull(); expect(screen.getByText(strings.verified)).toBeTruthy();
    expect((screen.getByRole('button', { name: strings.save }) as HTMLButtonElement).disabled).toBe(true);
    const next = structuredClone(value.changed); next.controller!.channelIndex = 6;
    view.rerender(<Harness value={value} configuration={next} onVerified={verified} />);
    expect(screen.getByText(strings.changes)).toBeTruthy(); expect((screen.getByRole('button', { name: strings.save }) as HTMLButtonElement).disabled).toBe(false);
    expect(value.service.getSnapshot().observed!.configuration.controller!.channelIndex).toBe(4);
  });
  it('never previews or writes on mount, no-op, reconnect, or download acknowledgement', async () => {
    const value = workbenchFixture(false); const preview = vi.spyOn(value.service, 'preview'); const write = vi.spyOn(value.service, 'write'); const connect = vi.fn();
    const view = render(<Harness value={value} onConnect={connect} />);
    fireEvent.click(screen.getByRole('button', { name: en.reconnect })); expect(connect).toHaveBeenCalledTimes(1);
    await act(async () => { await value.service.connect({ inputId: 'in', outputId: 'out' }); await value.service.read(); });
    expect(preview).not.toHaveBeenCalled(); expect(write).not.toHaveBeenCalled();
    view.rerender(<Harness value={value} configuration={value.service.getSnapshot().observed!.configuration} />);
    expect((screen.getByRole('button', { name: en.save }) as HTMLButtonElement).disabled).toBe(true);
    expect(preview).not.toHaveBeenCalled(); expect(write).not.toHaveBeenCalled();
  });
  it('requires explicit confirmation for the actual controller mode transition', async () => {
    const value = workbenchFixture(true, 0); const configuration = structuredClone(value.configuration); configuration.controller!.mode = 3;
    const write = vi.spyOn(value.service, 'write'); render(<Harness value={value} configuration={configuration} />);
    fireEvent.click(screen.getByRole('button', { name: en.save })); const dialog = await screen.findByRole('dialog');
    expect(value.service.getSnapshot().observed!.rawBackup.bytes[0]).toBe(0);
    expect(within(dialog).getByText(en.modeImpact)).toBeTruthy(); expect(write).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: en.confirmMode }));
    await screen.findByText(en.verified); expect(value.service.getSnapshot().observed!.rawBackup.bytes[0]).toBe(3);
  });
  it.each([false, true])('keeps editing available and requires the recovery fallback before saving (mode change: %s)', async modeChange => {
    vi.spyOn(database.rawBackups, 'put').mockRejectedValue(new Error('storage unavailable'));
    const value = workbenchFixture(true, 0); value.publish({ backupSafety: null });
    const configuration = structuredClone(modeChange ? value.configuration : value.changed); if (modeChange) configuration.controller!.mode = 3;
    const write = vi.spyOn(value.service, 'write'); render(<Harness value={value} configuration={configuration} />);
    expect(screen.queryByText(en.backupFailed)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: en.save })); await screen.findByText(en.backupFailed);
    expect(write).not.toHaveBeenCalled(); fireEvent.click(screen.getByRole('button', { name: en.download }));
    expect(downloadFile).toHaveBeenCalled(); expect(write).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: en.keptDownload }));
    await waitFor(() => expect(value.service.getSnapshot().backupSafety?.method).toBe('downloaded'));
    expect(write).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: modeChange ? en.confirmMode : en.save }));
    await screen.findByText(en.verified); expect(write).toHaveBeenCalledTimes(1);
  });
  it('keeps unsupported fields visible and disables partial saving', () => {
    const value = workbenchFixture(); const local = structuredClone(value.changed);
    local.groups[0]!.switches.A.actions = [{ gesture: 'longPress', messages: [{ type: 'pc', channel: 1, program: 4 }] }];
    const write = vi.spyOn(value.service, 'write'); render(<Harness value={value} configuration={local} />);
    expect(screen.getByText(en.unsupported)).toBeTruthy(); expect((screen.getByRole('button', { name: en.save }) as HTMLButtonElement).disabled).toBe(true); expect(write).not.toHaveBeenCalled();
  });
  it.each(['draft', 'read', 'epoch', 'disabled', 'unmount'] as const)('discards a late preview after %s changes', async change => {
    const value = workbenchFixture(); const preview = await value.service.preview(value.changed); const gate = Promise.withResolvers<WritePreview>();
    vi.spyOn(value.service, 'preview').mockReturnValueOnce(gate.promise); const write = vi.spyOn(value.service, 'write'); const verified = vi.fn();
    const view = render(<Harness value={value} onVerified={verified} />);
    fireEvent.click(screen.getByRole('button', { name: en.save }));
    if (change === 'draft') { const next = structuredClone(value.changed); next.controller!.channelIndex = 6; view.rerender(<Harness value={value} configuration={next} onVerified={verified} />); }
    if (change === 'read') await act(async () => { await value.service.read(); });
    if (change === 'epoch') act(() => value.publish({ connectionEpoch: 55 }));
    if (change === 'disabled') view.rerender(<Harness value={value} disabled onVerified={verified} />);
    if (change === 'unmount') view.unmount();
    await act(async () => { gate.resolve(preview); await gate.promise; });
    expect(write).not.toHaveBeenCalled(); expect(verified).not.toHaveBeenCalled(); expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('invalidates a visible mode review when the concrete draft changes', async () => {
    const value = workbenchFixture(true, 0); const local = structuredClone(value.configuration); local.controller!.mode = 3;
    const write = vi.spyOn(value.service, 'write'); const view = render(<Harness value={value} configuration={local} />);
    fireEvent.click(screen.getByRole('button', { name: en.save })); await screen.findByRole('dialog');
    const changed = structuredClone(local); changed.controller!.mode = 10; view.rerender(<Harness value={value} configuration={changed} />);
    expect(screen.queryByRole('dialog')).toBeNull(); expect(write).not.toHaveBeenCalled();
  });
  it('keeps a newer draft pending when an already-started write verifies an older draft', async () => {
    const value = workbenchFixture(); const gate = Promise.withResolvers<void>(); const original = value.service.write;
    vi.spyOn(value.service, 'write').mockImplementation(async id => { await gate.promise; return original(id); });
    const verified = vi.fn(); const view = render(<Harness value={value} onVerified={verified} />);
    fireEvent.click(screen.getByRole('button', { name: en.save }));
    await waitFor(() => expect(value.service.write).toHaveBeenCalledTimes(1));
    const next = structuredClone(value.changed); next.controller!.channelIndex = 6;
    view.rerender(<Harness value={value} configuration={next} onVerified={verified} />);
    await act(async () => { gate.resolve(); await gate.promise; });
    expect(value.service.getSnapshot().observed!.configuration.controller!.channelIndex).toBe(4);
    expect(verified).not.toHaveBeenCalled(); expect(screen.queryByText(en.verified)).toBeNull();
    expect((screen.getByRole('button', { name: en.save }) as HTMLButtonElement).disabled).toBe(false);
  });
  it('does not report success when writing fails', async () => {
    const value = workbenchFixture(); vi.spyOn(value.service, 'write').mockRejectedValue(new Error('hardware.verifyMismatch')); const verified = vi.fn();
    render(<Harness value={value} onVerified={verified} />); fireEvent.click(screen.getByRole('button', { name: en.save }));
    await screen.findByRole('alert'); expect(verified).not.toHaveBeenCalled(); expect(screen.queryByText(en.verified)).toBeNull();
  });
});
