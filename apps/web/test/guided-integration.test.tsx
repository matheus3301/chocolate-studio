// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, it, expect } from 'vitest';
import { applyEquipmentAction, exportConfiguration } from '@chocolate-studio/midi';
import { initialConfiguration, setMessages } from '../src/editor.js';
import { App } from '../src/App.js';
import { configurationFromBytes, configurationToBytes } from '../src/hardware-mapping.js';
import { unavailableHardware } from '../src/hardware.js';
import type { HardwareSnapshot } from '../src/hardware.js';
import { MusicalReview } from '../src/MusicalReview.js';
import { initializeLanguage } from '../src/i18n.js';
import { database } from '../src/storage.js';
import { useStudio } from '../src/useStudio.js';

beforeAll(async () => { await initializeLanguage('en');
  if (!HTMLDialogElement.prototype.showModal) HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  if (!HTMLDialogElement.prototype.close) HTMLDialogElement.prototype.close = function () { this.open = false; };
});
beforeEach(async () => { await database.open(); });
afterEach(async () => { cleanup(); await database.delete(); });

function musicalProject() {
  let project = initialConfiguration('en');
  const base = { modelId: 'line6.m5', profileVersion: '0.1.0', destinationId: project.destinations[0]!.id, actionId: 'select-preset' };
  project = applyEquipmentAction(project, project.groups[0]!.id, 'A', 'primary', { ...base, parameters: { 'preset-number': 1 } }, { behavior: 'shortLong' });
  return applyEquipmentAction(project, project.groups[0]!.id, 'A', 'secondary', { ...base, parameters: { 'preset-number': 2 } });
}

it('raw editing detaches only the edited musical binding and keeps the other gesture exportable', () => {
  const before = musicalProject();
  const after = setMessages(before, before.groups[0]!.id, 'A', 'primary', [{ type: 'cc', channel: 3, controller: 64, value: 127 }]);
  expect(after.groups[0]!.switches.A.actionBindings?.primary).toBeUndefined();
  expect(after.groups[0]!.switches.A.actionBindings?.secondary).toEqual(before.groups[0]!.switches.A.actionBindings?.secondary);
  expect(after.groups[0]!.switches.B).toEqual(before.groups[0]!.switches.B);
  expect(before.groups[0]!.switches.A.actionBindings?.primary).toBeDefined();
  expect(() => exportConfiguration(after)).not.toThrow();
});

it('reviews musical intent with separate tap and hold rather than presenting raw PC as the primary description', () => {
  const before = initialConfiguration('en');
  render(<MusicalReview before={before} after={musicalProject()} />);
  expect(screen.getByText('On tap')).toBeTruthy();
  expect(screen.getByText('On hold')).toBeTruthy();
  expect(screen.getByText(/Select preset.*Preset number: 2/)).toBeTruthy();
});

it('does not invent changes after export key reordering, but preserves meaningful sequence order', () => {
  const before = musicalProject();
  before.groups[0]!.switches.B.actions[0]!.messages = [
    { type: 'cc', channel: 1, controller: 10, value: 0 },
    { type: 'cc', channel: 1, controller: 10, value: 127 },
  ];
  const after = JSON.parse(exportConfiguration(before));
  const view = render(<MusicalReview before={before} after={after} />);
  expect(screen.getByText('No actions changed.')).toBeTruthy();
  after.groups[0].switches.B.actions[0].messages.reverse();
  view.rerender(<MusicalReview before={before} after={after} />);
  expect(screen.queryByText('No actions changed.')).toBeNull();
  expect(screen.getAllByRole('article')).toHaveLength(1);
});

it('adopting a complete read preserves unsaved local actions and their bindings in a recoverable copy', async () => {
  const { result } = renderHook(() => useStudio());
  await waitFor(() => expect(result.current.loading).toBe(false));
  const local = musicalProject();
  act(() => { result.current.setConfiguration(local); });
  const read = initialConfiguration('en'); read.name = 'Controller read';
  let accepted = false;
  await act(async () => { accepted = await result.current.replaceDraft(read); });
  expect(accepted).toBe(true);
  expect(result.current.configuration.name).toBe('Controller read');
  const savedCopy = (await database.backups.toArray())[0]!;
  expect(savedCopy.configuration).toEqual(local);
  expect(JSON.parse(exportConfiguration(savedCopy.configuration)).formatVersion).toBe(2);
});

it('reconciles a fresh connection against saved musical intent before adopting the read', async () => {
  const local = musicalProject();
  await database.initialize(local);
  const baseline = new Uint8Array(23646); baseline[0] = 3;
  const encoded = configurationToBytes(baseline, local);
  expect(encoded.unsupported).toEqual([]);
  const mapped = configurationFromBytes(encoded.bytes);
  expect(mapped.configuration.groups[0]!.switches.A.actionBindings).toBeUndefined();
  const raw = { id: 'fresh-baseline', sha256: 'synthetic-test', bytes: encoded.bytes, capturedAt: 1,
    identity: { name: 'FootCtrlPlus_016', manufacturer: null, model: null, firmware: null } };
  const observed = { ...mapped, rawBackup: raw, readAt: 1 };
  const snapshot = { ...unavailableHardware.getSnapshot(), status: 'connected' as const, identity: raw.identity,
    selection: { inputId: 'in', outputId: 'out' }, capabilities: { read: true, write: false, preview: false, restore: false },
    observed, baseline: raw, backupSafety: { baselineId: raw.id, sha256: raw.sha256, method: 'stored' as const } };
  const service = { ...unavailableHardware, getSnapshot: () => snapshot, acknowledgeBackup: async () => {} };
  render(<App hardware={service} />);
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Chocolate Plus', exact: true })).toBeTruthy());
  expect(screen.queryByRole('button', { name: 'Continue', exact: true })).toBeNull();
  await waitFor(async () => expect((await database.drafts.get('current'))?.revision).toBe(1));
  const restored = (await database.drafts.get('current'))!.configuration;
  expect(restored.groups[0]!.switches.A.actionBindings).toEqual(local.groups[0]!.switches.A.actionBindings);
  expect(restored.destinations).toEqual(local.destinations);
});

it('compares physical group positions once and ignores local names in device review', () => {
  const after = musicalProject();
  const before = structuredClone(after);
  before.groups[0]!.id = 'read-device-group-1';
  for (const pedal of Object.values(before.groups[0]!.switches)) { pedal.label = 'Read label'; delete pedal.actionBindings; }
  before.groups[0]!.switches.A.behavior = 'single';
  before.groups[0]!.switches.A.secondaryMessages = [];
  render(<MusicalReview device before={before} after={after} />);
  expect(screen.getAllByRole('heading', { name: /Group 1 \/ Pedal/ })).toHaveLength(1);
  expect(screen.getByText('On controller')).toBeTruthy();
  expect(screen.getByText('After saving')).toBeTruthy();
});

it('distinguishes restored controller mode from the retained local draft without replacing it', async () => {
  const bytes = new Uint8Array(23646); bytes[0] = 10;
  const mapped = configurationFromBytes(bytes);
  await database.initialize(mapped.configuration);
  const raw = { id: 'before-restore', sha256: 'synthetic-keyboard', bytes, capturedAt: 1,
    identity: { name: 'FootCtrlPlus_016', manufacturer: null, model: null, firmware: null } };
  let snapshot: HardwareSnapshot = { ...unavailableHardware.getSnapshot(), status: 'connected', identity: raw.identity,
    selection: { inputId: 'in', outputId: 'out' }, capabilities: { read: true, write: false, preview: false, restore: false },
    observed: { ...mapped, rawBackup: raw, readAt: 1 }, baseline: raw,
    backupSafety: { baselineId: raw.id, sha256: raw.sha256, method: 'stored' } };
  const listeners = new Set<() => void>();
  const service = { ...unavailableHardware, getSnapshot: () => snapshot, subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; }, acknowledgeBackup: async () => {} };
  render(<App hardware={service} />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Operating mode: Custom keyboard mode' })).toBeTruthy());
  const restoredBytes = new Uint8Array(23646);
  act(() => {
    snapshot = { ...snapshot, observed: { ...configurationFromBytes(restoredBytes), rawBackup: { ...raw, id: 'restored', bytes: restoredBytes }, readAt: 2 } };
    for (const listener of listeners) listener();
  });
  expect(screen.getByText(/On Chocolate: Change presets \(PC\) → Editing: Custom keyboard mode/)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Operating mode: Custom keyboard mode' })).toBeTruthy();
  expect((await database.drafts.get('current'))!.configuration.controller!.mode).toBe(10);
});
