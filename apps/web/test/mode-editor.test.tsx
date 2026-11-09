// @vitest-environment jsdom
import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { createDefaultConfiguration, exportConfiguration, importConfiguration } from '@chocolate-studio/midi';
import type { StudioConfiguration } from '@chocolate-studio/midi';
import { applyFcpPatches, decodeFcp } from '@chocolate-studio/chocolate-layout';
import { configurationFromBytes, configurationToBytes } from '../src/hardware-mapping.js';
import { InterfaceEditor } from '../src/InterfaceEditor.js';
import { Destinations, Presets } from '../src/EditorViews.js';
import { applyEquipmentAction, equipmentProfiles } from '@chocolate-studio/midi';
import { ModeStep } from '../src/ModeStep.js';
import { ModeEditor } from '../src/ModeEditor.js';
import { i18n, initializeLanguage } from '../src/i18n.js';

beforeAll(async () => { await initializeLanguage('en'); });
beforeEach(async () => { await i18n.changeLanguage('en'); });
afterEach(cleanup);

it('keeps the read mode until explicit selection and changes only mode when choosing another use', () => {
  const configuration = createDefaultConfiguration();
  configuration.controller = { mode: 0, channelIndex: 5, pcMaxGroupIndex: 31, customCommandA: 72 };
  const changed = vi.fn(); const complete = vi.fn();
  render(<ModeStep configuration={configuration} currentMode={0} onChange={changed} onComplete={complete} onBack={() => {}} />);
  expect((screen.getByLabelText('Operating mode') as HTMLSelectElement).value).toBe('0');
  expect(changed).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Operating mode'), { target: { value: '11' } });
  expect(changed).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Use this mode' }));
  const next = changed.mock.calls[0]![0] as StudioConfiguration;
  expect(next).toEqual({ ...configuration, controller: { ...configuration.controller, mode: 11 } });
  expect(complete).toHaveBeenCalledWith(11);
  const imported = importConfiguration(exportConfiguration(next));
  expect(imported.success && imported.data.controller?.mode).toBe(11);
});

it('does not turn an unknown read mode into Advanced or accept it as a supported selection', () => {
  const configuration = createDefaultConfiguration(); configuration.controller = { mode: 250 };
  const changed = vi.fn();
  render(<ModeStep configuration={configuration} currentMode={250} onChange={changed} onComplete={() => {}} onBack={() => {}} />);
  expect((screen.getByLabelText('Operating mode') as HTMLSelectElement).value).toBe('250');
  expect((screen.getByRole('button', { name: 'Use this mode' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(screen.getByLabelText('Operating mode'), { target: { value: '0' } });
  fireEvent.click(screen.getByRole('button', { name: 'Use this mode' }));
  expect(changed.mock.calls[0]![0].controller.mode).toBe(0);
});

it('keeps the selected mode form open after a rejected draft mutation', () => {
  const complete = vi.fn();
  render(<ModeStep configuration={createDefaultConfiguration()} onChange={() => false} onComplete={complete} onBack={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: 'Use this mode' }));
  expect(complete).not.toHaveBeenCalled();
  expect(screen.getByRole('alert')).toBeTruthy();
});

it('edits fixed sequential CC settings without rewriting Advanced assignments or exposing action slots', () => {
  const configuration = createDefaultConfiguration(); configuration.controller = { mode: 1, channelIndex: 2, ccMaxGroupIndex: 31 };
  let accepted = configuration;
  function Harness() {
    const [current, setCurrent] = useState(configuration);
    return <ModeEditor configuration={current} onChange={next => { accepted = next; setCurrent(next); }} confirm={vi.fn()} />;
  }
  render(<Harness />);
  expect(screen.queryByRole('form')).toBeNull();
  fireEvent.change(screen.getByLabelText('MIDI channel'), { target: { value: '15' } });
  fireEvent.change(screen.getByLabelText('Last number'), { target: { value: '2' } });
  expect(accepted.controller).toEqual({ mode: 1, channelIndex: 15, ccMaxGroupIndex: 2 });
  expect(accepted.groups).toEqual(configuration.groups);
  expect(screen.getAllByRole('option').filter(option => option.parentElement === screen.getByLabelText('Preview group')).map(option => option.textContent)).toEqual(['000–003', '004–007', '008–011']);
});

it('keeps Advanced and Mix independent through mode selection and mixed MIDI editing, including stale fixed-mode drafts', () => {
  const baseline = applyFcpPatches(new Uint8Array(23646), [
    { kind: 'field', field: 'mode', value: 3 },
    { kind: 'message', location: { scope: 'advanced', groupIndex: 0, switchId: 'A', bank: 'A', slot: 0 }, message: { type: 'pc', channel: 2, program: 7 } },
    { kind: 'message', location: { scope: 'mixed', groupIndex: 0, switchId: 'A', bank: 'A', slot: 0 }, message: { type: 'pc', channel: 3, program: 11 } },
  ]).bytes;
  const read = configurationFromBytes(baseline).configuration;
  const selected = vi.fn();
  const choice = render(<ModeStep configuration={read} onChange={selected} onComplete={() => {}} onBack={() => {}} />);
  fireEvent.change(screen.getByLabelText('Operating mode'), { target: { value: '11' } });
  fireEvent.click(screen.getByRole('button', { name: 'Use this mode' }));
  const chosen = selected.mock.calls[0]![0] as StudioConfiguration;
  expect(configurationToBytes(baseline, chosen).bytes).toEqual(Uint8Array.from(baseline, (byte, index) => index === 0 ? 11 : byte));
  choice.unmount();
  let accepted = chosen;
  function Harness() {
    const [current, setCurrent] = useState(chosen);
    return <ModeEditor configuration={current} onChange={next => { accepted = next; setCurrent(next); }} confirm={vi.fn()} />;
  }
  const editor = render(<Harness />);
  fireEvent.change(screen.getByLabelText(i18n.t('program')), { target: { value: '25' } });
  expect(accepted.groups).toEqual(read.groups);
  expect(accepted.mixedGroups![0]!.switches.A.actions[0]!.messages[0]).toMatchObject({ type: 'pc', program: 25 });
  const encoded = configurationToBytes(baseline, accepted);
  expect(encoded.unsupported).toEqual([]);
  const decoded = decodeFcp(encoded.bytes);
  expect(decoded.advancedGroups[0]!.switches.A.bankA.records[0]!.message).toMatchObject({ type: 'pc', program: 7 });
  expect(decoded.mixedGroups[0]!.switches.A.bankA.records[0]!.message).toMatchObject({ type: 'pc', program: 25 });
  const restored = importConfiguration(exportConfiguration(accepted));
  expect(restored.success && restored.data.mixedGroups).toEqual(accepted.mixedGroups);
  editor.unmount();
  const fixed = structuredClone(read); fixed.controller!.mode = 0;
  fixed.groups[0]!.switches.A.actions[0]!.messages = [{ type: 'pc', channel: 16, program: 99 }];
  const fixedBaseline = Uint8Array.from(baseline, (byte, index) => index === 0 ? 0 : byte);
  selected.mockClear();
  render(<ModeStep configuration={fixed} onChange={selected} onComplete={() => {}} onBack={() => {}} />);
  fireEvent.change(screen.getByLabelText('Operating mode'), { target: { value: '11' } });
  fireEvent.click(screen.getByRole('button', { name: 'Use this mode' }));
  expect(configurationToBytes(fixedBaseline, selected.mock.calls[0]![0]).bytes).toEqual(Uint8Array.from(fixedBaseline, (byte, index) => index === 0 ? 11 : byte));
});

it('automatically commits valid keyboard edits without changing the stored initial group or dropping focus', () => {
  const configuration = configurationFromBytes(new Uint8Array(23646)).configuration;
  configuration.controller!.mode = 10;
  let accepted = configuration; const confirm = vi.fn(); const pending = vi.fn();
  function Harness() {
    const [current, setCurrent] = useState(configuration);
    return <ModeEditor configuration={current} onChange={next => { accepted = next; setCurrent(next); }} confirm={confirm} onPendingChange={pending} />;
  }
  render(<Harness />);
  expect(accepted).toEqual(configuration);
  fireEvent.change(screen.getByLabelText('Modifier'), { target: { value: '1' } });
  const keyField = screen.getByLabelText('Key');
  keyField.focus();
  fireEvent.change(keyField, { target: { value: '1' } });
  expect(document.activeElement).toBe(keyField);
  fireEvent.change(screen.getByLabelText('Group'), { target: { value: '1' } });
  expect(confirm).not.toHaveBeenCalled();
  expect(accepted.controller!.keyboardAssignments!.find(entry => entry.groupIndex === 0 && entry.switchId === 'A')!.combination).toEqual({ modifier1: 1, modifier2: 0, key: 1 });
  expect(pending.mock.calls.at(-1)).toEqual([false]);
  const plan = configurationToBytes(new Uint8Array(23646), accepted);
  expect(plan.unsupported).toEqual([]);
  expect(decodeFcp(plan.bytes).keyboardGroups[0]!.switches.A.combination).toEqual({ modifier1: 1, modifier2: 0, key: 1 });
  expect(accepted.controller!.keyboardGroupIndex).toBe(0);
});

it('applies dedicated external pedal endpoint values and clears only the selected slot', () => {
  const baseline = applyFcpPatches(new Uint8Array(23646), [
    { kind: 'interfaceAssignment', slot: 0, assignment: { channel: 2, data: 127, releaseValue: 3, pressValue: 4 } },
    { kind: 'interfaceAssignment', slot: 15, assignment: { channel: 16, data: 64, releaseValue: 0, pressValue: 127 } },
  ]).bytes;
  const configuration = configurationFromBytes(baseline).configuration;
  let accepted = configuration; const confirm = vi.fn();
  function Harness() {
    const [current, setCurrent] = useState(configuration);
    return <InterfaceEditor configuration={current} onChange={next => { accepted = next; setCurrent(next); }} confirm={confirm} onPendingChange={() => {}} />;
  }
  render(<Harness />);
  fireEvent.click(screen.getByText('Expression / external switch', { selector: 'summary' }));
  fireEvent.change(screen.getByLabelText('Pressed value'), { target: { value: '99' } });
  fireEvent.change(screen.getByLabelText('Assignment'), { target: { value: '15' } });
  expect(confirm).toHaveBeenCalledTimes(1);
  expect((screen.getByLabelText('Assignment') as HTMLSelectElement).value).toBe('0');
  fireEvent.click(screen.getByRole('button', { name: 'Apply settings' }));
  const applied = configurationToBytes(baseline, accepted);
  expect(applied.unsupported).toEqual([]);
  expect(decodeFcp(applied.bytes).interfaceBank.records[0]!.assignment).toEqual({ channel: 2, data: 127, releaseValue: 3, pressValue: 99 });
  expect(decodeFcp(applied.bytes).interfaceBank.records[15]!.assignment).toEqual({ channel: 16, data: 64, releaseValue: 0, pressValue: 127 });
  fireEvent.click(screen.getByRole('button', { name: 'Clear assignment' }));
  const cleared = configurationToBytes(baseline, accepted);
  const expected = baseline.slice(); expected[13] = 0;
  expect(cleared.bytes).toEqual(expected);
  expect(baseline[13]).toBe(1);
});

it('protects destinations used only by mixed musical bindings from removal or channel edits', () => {
  let mixed = createDefaultConfiguration();
  const profile = equipmentProfiles[0]!;
  mixed.destinations[0]!.profile = { modelId: profile.modelId, profileVersion: profile.profileVersion };
  mixed = applyEquipmentAction(mixed, mixed.groups[0]!.id, 'A', 'primary', { modelId: profile.modelId, profileVersion: profile.profileVersion, actionId: 'select-preset', parameters: { 'preset-number': 1 }, destinationId: mixed.destinations[0]!.id });
  const configuration = { ...mixed, groups: createDefaultConfiguration().groups, mixedGroups: mixed.groups.map(group => ({ ...group, id: 'mixed-only' })) };
  render(<Destinations configuration={configuration} onChange={vi.fn()} />);
  expect((screen.getByLabelText(i18n.t('defaultChannel')) as HTMLInputElement).closest('fieldset')!.disabled).toBe(true);
  expect((screen.getByRole('button', { name: i18n.t('remove') }) as HTMLButtonElement).disabled).toBe(true);
});

it('assigns library presets only to an explicit active mixed MIDI target and keeps fixed-mode libraries editable', () => {
  const baseline = applyFcpPatches(new Uint8Array(23646), [
    { kind: 'field', field: 'mode', value: 11 },
    { kind: 'message', location: { scope: 'advanced', groupIndex: 0, switchId: 'A', bank: 'A', slot: 0 }, message: { type: 'pc', channel: 1, program: 5 } },
    { kind: 'message', location: { scope: 'mixed', groupIndex: 2, switchId: 'B', bank: 'A', slot: 0 }, message: { type: 'pc', channel: 1, program: 9 } },
  ]).bytes;
  const configuration = configurationFromBytes(baseline).configuration;
  configuration.presets = [{ id: 'library-preset', name: 'Library preset', channel: 1, program: 44 }];
  const confirm = vi.fn(); let accepted = configuration;
  function Harness({ initial = configuration }: { initial?: StudioConfiguration }) {
    const [current, setCurrent] = useState(initial);
    return <Presets configuration={current} onChange={next => { accepted = next; setCurrent(next); return true; }} groupId={current.groups[0]!.id} switchId="A" sequence="primary" onGroup={() => {}} onSwitch={() => {}} onSequence={() => {}} confirm={confirm} />;
  }
  const view = render(<Harness />);
  expect((screen.getByRole('button', { name: i18n.t('usePreset') }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(screen.getByLabelText('Group'), { target: { value: configuration.mixedGroups![2]!.id } });
  fireEvent.change(screen.getByLabelText('Switch'), { target: { value: 'B' } });
  fireEvent.click(screen.getByRole('button', { name: i18n.t('usePreset') }));
  act(() => confirm.mock.calls[0]![2]());
  expect(accepted.groups).toEqual(configuration.groups);
  expect(accepted.mixedGroups![2]!.switches.B.actions[0]!.messages[0]).toMatchObject({ type: 'pc', program: 44 });
  expect(accepted.mixedGroups![0]!.switches.A).toEqual(configuration.mixedGroups![0]!.switches.A);
  const written = decodeFcp(configurationToBytes(baseline, accepted).bytes);
  expect(written.advancedGroups[0]!.switches.A.bankA.records[0]!.message).toMatchObject({ type: 'pc', program: 5 });
  expect(written.mixedGroups[2]!.switches.B.bankA.records[0]!.message).toMatchObject({ type: 'pc', program: 44 });
  view.unmount();
  const fixed = structuredClone(configuration); fixed.controller!.mode = 0;
  render(<Harness initial={fixed} />);
  expect((screen.getByRole('button', { name: i18n.t('usePreset') }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(screen.getByLabelText(i18n.t('presetName'), { selector: 'input:not([type=\"search\"])' }), { target: { value: 'Renamed library preset' } });
  expect(accepted.presets[0]!.name).toBe('Renamed library preset');
  expect(accepted.groups).toEqual(configuration.groups);
  expect(accepted.mixedGroups).toEqual(configuration.mixedGroups);
});

it.each(['en', 'pt-BR'] as const)('keeps duplicate modifiers pending with one specific inline error in %s', async locale => {
  await i18n.changeLanguage(locale);
  const configuration = configurationFromBytes(new Uint8Array(23646)).configuration;
  configuration.controller!.mode = 10;
  const changed = vi.fn(() => false); const pending = vi.fn();
  render(<ModeEditor configuration={configuration} onChange={changed} confirm={vi.fn()} onPendingChange={pending} />);
  fireEvent.change(screen.getByLabelText(i18n.t('modifier1', { ns: 'mode' })), { target: { value: '1' } });
  // Native options prevent ordinary duplicates; forced/stale values still get inline validation.
  fireEvent.change(screen.getByLabelText(i18n.t('modifier2', { ns: 'mode' })), { target: { value: '1' } });
  fireEvent.change(screen.getByLabelText(i18n.t('key', { ns: 'mode' })), { target: { value: '1' } });
  expect(changed).toHaveBeenCalledTimes(1);
  expect(pending.mock.calls.at(-1)).toEqual([true]);
  expect(screen.getAllByRole('alert')).toHaveLength(1);
  expect(screen.getByRole('alert').textContent).toMatch(locale === 'en' ? /different modifiers/ : /modificadores diferentes/);
  fireEvent.change(screen.getByLabelText(i18n.t('modifier2', { ns: 'mode' })), { target: { value: '2' } });
  expect(changed).toHaveBeenCalledTimes(2);
  expect(screen.getAllByRole('alert')).toHaveLength(1);
  expect(pending.mock.calls.at(-1)).toEqual([true]);
  expect(configuration.controller!.keyboardAssignments![0]!.combination).toEqual({ modifier1: 0, modifier2: 0, key: 0 });
  fireEvent.click(screen.getByRole('button', { name: i18n.t('discard', { ns: 'mode' }) }));
  expect(screen.queryByRole('alert')).toBeNull();
  expect(pending.mock.calls.at(-1)).toEqual([false]);
});

it('previews exact fixed PC numbers through 127 and edits only after a deliberate whole-controller mode change', () => {
  const configuration = createDefaultConfiguration();
  configuration.controller = { mode: 0, pcMaxGroupIndex: 31, channelIndex: 3, customCommandA: 72 };
  configuration.groups[0]!.switches.A = { label: 'Stored A', behavior: 'single', actions: [{ gesture: 'press', messages: [{ type: 'pc', channel: 6, program: 9, bank: { msb: 4 } }] }] };
  configuration.mixedGroups = [{ ...structuredClone(configuration.groups[0]!), id: 'independent-mix' }];
  let accepted = configuration;
  function Harness() {
    const [current, setCurrent] = useState(configuration);
    return <ModeEditor hideSettings configuration={current} onChange={next => { accepted = next; setCurrent(next); }} confirm={vi.fn()}
      onCustomize={() => { const next = { ...current, controller: { ...current.controller, mode: 3 } }; accepted = next; setCurrent(next); }} />;
  }
  render(<Harness />);
  fireEvent.change(screen.getByLabelText('Preview group'), { target: { value: '31' } });
  expect(screen.getAllByText('PC 124 · MIDI channel 4')).toHaveLength(2);
  fireEvent.click(screen.getByRole('button', { name: 'Switch D' }));
  expect(screen.getAllByText('PC 127 · MIDI channel 4')).toHaveLength(2);
  expect(accepted).toEqual(configuration);
  expect(screen.queryByLabelText(i18n.t('program'))).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Customize this switch' }));
  expect(accepted.groups).toEqual(configuration.groups);
  fireEvent.click(screen.getByRole('button', { name: i18n.t('guided.editChoice', { choice: 'A' }) }));
  fireEvent.change(screen.getByLabelText(i18n.t('program')), { target: { value: '20' } });
  expect(accepted.groups[0]!.switches.A.actions[0]!.messages[0]).toEqual({ type: 'pc', channel: 6, program: 20, bank: { msb: 4 } });
  expect(accepted.controller).toEqual({ ...configuration.controller, mode: 3 });
  expect(accepted.mixedGroups).toEqual(configuration.mixedGroups);
});

it.each([
  [5, 'Swipe up', 'Swipe right'],
  [6, 'Rewind', 'Loop'],
  [7, 'Up arrow', 'Right arrow'],
  [8, 'Page Up', 'Enter'],
  [9, 'Previous track', 'Volume up'],
] as const)('keeps the fixed functions of mode %s separate from stored MIDI assignments', (mode, first, last) => {
  const configuration = createDefaultConfiguration();
  configuration.controller = { mode };
  const changed = vi.fn();
  render(<ModeEditor configuration={configuration} onChange={changed} confirm={vi.fn()} hideSettings />);
  expect(screen.getAllByText(first)).toHaveLength(2);
  fireEvent.click(screen.getByRole('button', { name: 'Switch D' }));
  expect(screen.getAllByText(last)).toHaveLength(2);
  expect(changed).not.toHaveBeenCalled();
  expect(screen.queryByRole('spinbutton')).toBeNull();
});
