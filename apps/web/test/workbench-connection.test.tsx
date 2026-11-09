// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { useSyncExternalStore } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectionExperience } from '../src/ConnectionExperience.js';
import type { ConnectionExperienceProps } from '../src/ConnectionExperience.js';
import { classifyConnectionCandidate, midiPermission } from '../src/workbench-connection.js';
import { workbenchConnectionEn as en, workbenchConnectionPt as pt } from '../src/workbench-connection-i18n.js';
import { i18n, initializeLanguage } from '../src/i18n.js';
import { database } from '../src/storage.js';
import { workbenchFixture } from './workbench-fixture.js';
import type { WorkbenchFixture } from './workbench-fixture.js';

function Harness({ value, onRead = vi.fn(), onPendingChange = vi.fn() }: {
  value: WorkbenchFixture; onRead?: ConnectionExperienceProps['onRead']; onPendingChange?: ConnectionExperienceProps['onPendingChange'];
}) {
  const state = useSyncExternalStore(value.service.subscribe, value.service.getSnapshot);
  return <ConnectionExperience service={value.service} state={state} onRead={onRead} onOffline={() => {}} onNotice={() => {}} onPendingChange={onPendingChange} />;
}
function permission(state: PermissionState) {
  vi.stubGlobal('navigator', { permissions: { query: vi.fn().mockResolvedValue({ state }) } });
}

beforeAll(async () => { await initializeLanguage('en'); });
beforeEach(async () => { await i18n.changeLanguage('en'); await database.open(); permission('prompt'); });
afterEach(async () => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); await database.delete(); });

describe('safe connection candidates', () => {
  it('does not probe an unknown singleton or a name containing SINCO', () => {
    const value = workbenchFixture(false);
    for (const name of ['MIDI', 'SINCO virtual route', 'Chocolate Plus']) {
      expect(classifyConnectionCandidate({ ...value.service.getSnapshot(), inputs: [{ id: 'in', name, manufacturer: '' }], outputs: value.ports.outputs }).kind).toBe('manual');
    }
  });
  it('requires one matching profile pair, not the first port in a list', () => {
    const value = workbenchFixture(false);
    const snapshot = { ...value.service.getSnapshot(), ...value.ports };
    expect(classifyConnectionCandidate(snapshot)).toEqual({ kind: 'candidate', source: 'profile', selection: { inputId: 'in', outputId: 'out' } });
    expect(classifyConnectionCandidate({ ...snapshot, outputs: [...snapshot.outputs, { ...snapshot.outputs[0]!, id: 'second' }] }).kind).toBe('ambiguous');
    expect(classifyConnectionCandidate({ ...snapshot, outputs: [{ ...snapshot.outputs[0]!, manufacturer: 'Different' }] }).kind).toBe('manual');
  });
  it('never replaces an existing or missing remembered session with another known device', () => {
    const value = workbenchFixture();
    expect(classifyConnectionCandidate(value.service.getSnapshot()).kind).toBe('session');
    const other = { ...workbenchFixture(false).service.getSnapshot(), ...value.ports };
    expect(classifyConnectionCandidate(other, { inputId: 'old-in', outputId: 'old-out' }, true).kind).toBe('missing-remembered');
    expect(classifyConnectionCandidate(other, { inputId: 'in', outputId: 'out' }, true)).toEqual({ kind: 'candidate', source: 'remembered', selection: { inputId: 'in', outputId: 'out' } });
  });
  it('falls back to a gesture when permission queries are unsupported', async () => {
    vi.stubGlobal('navigator', { permissions: { query: async () => { throw new TypeError('unsupported descriptor'); } } });
    expect(await midiPermission()).toBe('unknown');
  });
});

describe('automatic connection experience', () => {
  it('enumerates a granted launch and adopts the full read once without another action', async () => {
    permission('granted'); const value = workbenchFixture(false); const onRead = vi.fn();
    const request = vi.spyOn(value.service, 'requestPorts'); const connect = vi.spyOn(value.service, 'connect'); const read = vi.spyOn(value.service, 'read'); const write = vi.spyOn(value.service, 'write');
    const view = render(<Harness value={value} onRead={onRead} />);
    await waitFor(() => expect(onRead).toHaveBeenCalledTimes(1));
    expect(request).toHaveBeenCalledTimes(1); expect(connect).toHaveBeenCalledWith({ inputId: 'in', outputId: 'out' }); expect(read).toHaveBeenCalledTimes(1);
    expect(Array.from(onRead.mock.calls[0]![0].rawBackup.bytes)).toEqual(Array.from(value.service.getSnapshot().observed!.rawBackup.bytes));
    await waitFor(() => expect(value.service.getSnapshot().backupSafety?.method).toBe('stored'));
    view.rerender(<Harness value={value} onRead={onRead} />);
    expect(onRead).toHaveBeenCalledTimes(1); expect(write).not.toHaveBeenCalled();
  });
  it.each(['en', 'pt-BR'] as const)('uses one permission action and continues reading in %s', async locale => {
    await i18n.changeLanguage(locale); const strings = locale === 'en' ? en : pt;
    const value = workbenchFixture(false); const onRead = vi.fn(); const request = vi.spyOn(value.service, 'requestPorts');
    render(<Harness value={value} onRead={onRead} />);
    await screen.findByText(strings.noPorts); expect(request).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: strings.connect }));
    await waitFor(() => expect(onRead).toHaveBeenCalledTimes(1)); expect(request).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('checkbox')).toBeNull();
  });
  it('adopts a qualified read even when automatic recovery persistence fails', async () => {
    permission('granted'); vi.spyOn(database.rawBackups, 'put').mockRejectedValue(new Error('storage denied'));
    const value = workbenchFixture(false); const onRead = vi.fn(); render(<Harness value={value} onRead={onRead} />);
    await waitFor(() => expect(onRead).toHaveBeenCalledTimes(1));
    expect(value.service.getSnapshot().backupSafety).toBeNull(); expect(screen.queryByText(en.backupFailed)).toBeNull();
  });
  it('shows denied permission and never requests ports automatically', async () => {
    permission('denied'); const value = workbenchFixture(false); const request = vi.spyOn(value.service, 'requestPorts');
    render(<Harness value={value} />); await screen.findByText(en.denied); expect(request).not.toHaveBeenCalled();
  });
  it.each(['unknown', 'multiple'] as const)('does not identify %s ports without explicit pairing', async kind => {
    permission('granted'); const value = workbenchFixture(false); const connect = vi.spyOn(value.service, 'connect');
    vi.spyOn(value.service, 'requestPorts').mockImplementation(async () => value.publish(kind === 'unknown' ? {
      inputs: [{ id: 'in', name: 'Unknown', manufacturer: '' }], outputs: [{ id: 'out', name: 'Unknown', manufacturer: '' }],
    } : { ...value.ports, inputs: [...value.ports.inputs, { id: 'second', name: 'SINCO', manufacturer: '' }] }));
    render(<Harness value={value} />); await screen.findByText(en[kind === 'unknown' ? 'manual' : 'ambiguous']); expect(connect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText(en.help));
    fireEvent.change(screen.getByLabelText(en.input), { target: { value: 'in' } });
    fireEvent.change(screen.getByLabelText(en.output), { target: { value: 'out' } });
    fireEvent.click(screen.getByRole('button', { name: en.pair }));
    await waitFor(() => expect(connect).toHaveBeenCalledTimes(1));
  });
  it('reacts to hotplug but does not auto-switch after the original session disappears', async () => {
    permission('granted'); const value = workbenchFixture(false); const onRead = vi.fn(); const connect = vi.spyOn(value.service, 'connect');
    vi.spyOn(value.service, 'requestPorts').mockResolvedValue();
    render(<Harness value={value} onRead={onRead} />); await screen.findByText(en.noPorts);
    act(() => value.publish(value.ports)); await waitFor(() => expect(onRead).toHaveBeenCalledTimes(1));
    await act(async () => { value.publish({ inputs: [], outputs: [] }); await value.service.disconnect(); });
    act(() => value.publish({ inputs: [{ id: 'other-in', name: 'SINCO', manufacturer: '' }], outputs: [{ id: 'other-out', name: 'SINCO', manufacturer: '' }] }));
    await screen.findByText(en.missingRemembered); expect(connect).toHaveBeenCalledTimes(1);
    act(() => value.publish(value.ports)); await waitFor(() => expect(onRead).toHaveBeenCalledTimes(2)); expect(connect).toHaveBeenCalledTimes(2);
  });
  it('does not read a disconnected session after its delayed connect promise settles', async () => {
    permission('granted'); const value = workbenchFixture(false); const gate = Promise.withResolvers<void>();
    const original = value.service.connect;
    vi.spyOn(value.service, 'connect').mockImplementation(async selection => { await original(selection); await gate.promise; });
    const read = vi.spyOn(value.service, 'read'); const onRead = vi.fn();
    render(<Harness value={value} onRead={onRead} />);
    await waitFor(() => expect(value.service.getSnapshot().identity).not.toBeNull());
    await act(async () => { await value.service.disconnect(); gate.resolve(); await gate.promise; });
    expect(read).not.toHaveBeenCalled(); expect(onRead).not.toHaveBeenCalled();
  });
  it('does not read or adopt an unsupported identity even when stale observed data exists', async () => {
    const value = workbenchFixture(); const original = value.service.getSnapshot().identity!;
    value.publish({ identity: { ...original, name: 'FootCtrlPlus_017' } });
    const read = vi.spyOn(value.service, 'read'); const onRead = vi.fn();
    render(<Harness value={value} onRead={onRead} />);
    await act(async () => {});
    expect(read).not.toHaveBeenCalled(); expect(onRead).not.toHaveBeenCalled();
  });
  it('does not continue a late identification into a read after unmount', async () => {
    permission('granted'); const value = workbenchFixture(false); const gate = Promise.withResolvers<void>();
    const original = value.service.connect; vi.spyOn(value.service, 'connect').mockImplementation(async selection => { await gate.promise; await original(selection); });
    const read = vi.spyOn(value.service, 'read'); const onRead = vi.fn(); const onPendingChange = vi.fn();
    const view = render(<Harness value={value} onRead={onRead} onPendingChange={onPendingChange} />);
    await waitFor(() => expect(value.service.connect).toHaveBeenCalledTimes(1)); view.unmount();
    await act(async () => { gate.resolve(); await gate.promise; });
    expect(read).not.toHaveBeenCalled(); expect(onRead).not.toHaveBeenCalled(); expect(onPendingChange).toHaveBeenLastCalledWith(false);
  });
});
