// @vitest-environment jsdom
import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { SWITCH_IDS, applyEquipmentAction, createDefaultConfiguration, equipmentProfiles } from '@chocolate-studio/midi';
import type { EquipmentProfile, StudioConfiguration, SwitchId } from '@chocolate-studio/midi';
import { EquipmentStep } from '../src/EquipmentStep.js';
import { GuidedEditor } from '../src/GuidedEditor.js';
import type { GuidedEditorProps } from '../src/GuidedEditor.js';
import { Destinations } from '../src/EditorViews.js';
import { i18n, initializeLanguage } from '../src/i18n.js';

const profile = equipmentProfiles[0]!;
function fixture(selected = profile): StudioConfiguration {
  const configuration = createDefaultConfiguration();
  configuration.destinations = [{ id: 'stage-unit', name: 'Stage unit', channel: 3, profile: { modelId: selected.modelId, profileVersion: selected.profileVersion } }];
  const group = configuration.groups[0]!;
  for (const id of SWITCH_IDS) group.switches[id] = { label: id, behavior: 'single', actions: [], secondaryMessages: [] };
  return configuration;
}
function boundFixture(): StudioConfiguration {
  const configuration = fixture();
  return applyEquipmentAction(configuration, configuration.groups[0]!.id, 'A', 'primary', {
    modelId: profile.modelId, profileVersion: profile.profileVersion, destinationId: 'stage-unit', actionId: 'select-preset', parameters: { 'preset-number': 1 },
  });
}
function showEditor(initial: StudioConfiguration, overrides: Partial<GuidedEditorProps> = {}) {
  let current = initial;
  const confirm = vi.fn();
  const pending = vi.fn();
  function Harness() {
    const [configuration, setConfiguration] = useState(initial);
    const [groupId, onGroup] = useState(initial.groups[0]!.id);
    const [switchId, onSwitch] = useState<SwitchId>('A');
    return <GuidedEditor {...overrides} configuration={configuration} groupId={groupId} onGroup={onGroup} switchId={switchId} onSwitch={onSwitch} onChange={(next) => {
      if (overrides.onChange?.(next) === false) return false;
      current = next;
      setConfiguration(next);
      return true;
    }} confirm={overrides.confirm ?? confirm} onPendingChange={overrides.onPendingChange ?? pending} />;
  }
  return { ...render(<Harness />), current: () => current, confirm, pending };
}
function tapForm() { return within(screen.getByRole('form', { name: i18n.t('guided.onTap') })); }

beforeAll(async () => { await initializeLanguage('en'); });
beforeEach(async () => { await i18n.changeLanguage('en'); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('direct equipment actions', () => {
  it('does not commit untouched assignments, selection or language changes', async () => {
    const changed = vi.fn();
    const configuration = boundFixture();
    const rendered = showEditor(configuration, { onChange: changed });
    fireEvent.click(screen.getByRole('button', { name: i18n.t('guided.editChoice', { choice: 'B' }) }));
    fireEvent.click(screen.getByRole('button', { name: i18n.t('guided.editChoice', { choice: 'A' }) }));
    await act(async () => { await i18n.changeLanguage('pt-BR'); });
    expect(changed).not.toHaveBeenCalled();
    expect(rendered.current()).toEqual(configuration);
  });

  it('automatically commits valid parameters without remounting the focused field', async () => {
    const rendered = showEditor(boundFixture());
    const input = tapForm().getByRole('spinbutton');
    input.focus();
    fireEvent.change(input, { target: { value: '2' } });
    expect(rendered.current().groups[0]!.switches.A.actions[0]!.messages[0]).toMatchObject({ type: 'pc', program: 1, channel: 3 });
    expect(document.activeElement).toBe(input);
    expect(tapForm().getByRole('spinbutton')).toBe(input);
    fireEvent.change(input, { target: { value: '24' } });
    expect(rendered.current().groups[0]!.switches.A.actionBindings!.primary!.parameters).toEqual({ 'preset-number': 24 });
    expect(rendered.confirm).not.toHaveBeenCalled();
  });

  it('replaces a bound action immediately and removes irrelevant parameters', async () => {
    const rendered = showEditor(boundFixture());
    await userEvent.setup().selectOptions(tapForm().getByLabelText(i18n.t('guided.action')), 'tuner-enter');
    expect(tapForm().queryByRole('spinbutton')).toBeNull();
    expect(rendered.current().groups[0]!.switches.A.actions[0]!.messages).toEqual([{ type: 'cc', channel: 3, controller: 69, value: 127, destinationId: 'stage-unit' }]);
    expect(rendered.current().groups[0]!.switches.A.actionBindings!.primary!.parameters).toEqual({});
  });

  it('uses multiple destination profiles and their own localized vocabulary, limits and MIDI mapping', async () => {
    // Synthetic renderer fixture, not manufacturer or hardware evidence.
    const synthetic: EquipmentProfile = structuredClone(profile);
    synthetic.modelId = 'test.scene-unit';
    synthetic.label = { en: 'Scene unit', 'pt-BR': 'Unidade de cenas' };
    const action = structuredClone(profile.actions[0]!);
    action.id = 'choose-scene'; action.label = { en: 'Choose scene', 'pt-BR': 'Escolher cena' };
    action.parameters = { scene: { type: 'integer', label: { en: 'Scene', 'pt-BR': 'Cena' }, minimum: 10, maximum: 12, initial: 10 } };
    action.messages = [{ type: 'pc', channel: 'destination', program: { parameter: 'scene', offset: -5 } }];
    synthetic.actions = [action];
    const configuration = fixture();
    configuration.destinations.push({ id: 'scene-unit', name: 'Other unit', channel: 8, profile: { modelId: synthetic.modelId, profileVersion: synthetic.profileVersion } });
    const changed = vi.fn();
    const rendered = showEditor(configuration, { profiles: [profile, synthetic], onChange: changed });
    await userEvent.setup().selectOptions(tapForm().getByLabelText(i18n.t('guided.device')), 'scene-unit');
    expect(changed).not.toHaveBeenCalled();
    await userEvent.setup().selectOptions(tapForm().getByLabelText(i18n.t('guided.action')), 'choose-scene');
    const input = tapForm().getByRole('spinbutton', { name: 'Scene' }) as HTMLInputElement;
    expect([input.min, input.max]).toEqual(['10', '12']);
    fireEvent.change(input, { target: { value: '12' } });
    expect(rendered.current().groups[0]!.switches.A.actions[0]!.messages).toEqual([{ type: 'pc', channel: 8, program: 7, destinationId: 'scene-unit' }]);
    await act(async () => { await i18n.changeLanguage('pt-BR'); });
    expect(screen.getByRole('spinbutton', { name: 'Cena' })).toBe(input);
    expect(screen.getByRole('option', { name: 'Escolher cena' })).toBeTruthy();
  });

  it('preserves raw messages, unknown intent, behavior and extra gestures until explicit replacement', async () => {
    const configuration = boundFixture();
    const pedal = configuration.groups[0]!.switches.A;
    pedal.actionBindings!.primary!.profileVersion = '99.0.0';
    pedal.behavior = 'alternate';
    pedal.actions[0]!.messages.push({ type: 'cc', channel: 2, controller: 11, value: 0 });
    pedal.actions.push({ gesture: 'release', messages: [{ type: 'pc', channel: 2, program: 9 }] });
    pedal.secondaryMessages = [{ type: 'cc', channel: 2, controller: 69, value: 0 }];
    const original = structuredClone(configuration);
    const rendered = showEditor(configuration);
    expect(rendered.current()).toEqual(original);
    const form = within(screen.getByRole('form', { name: 'First tap' }));
    expect((form.getByLabelText(i18n.t('guided.action')) as HTMLSelectElement).value).toBe('');
    await userEvent.setup().selectOptions(form.getByLabelText(i18n.t('guided.action')), 'select-preset');
    expect(rendered.current()).toEqual(original);
    act(() => rendered.confirm.mock.calls[0]![2]());
    const changed = rendered.current().groups[0]!.switches.A;
    expect(changed.behavior).toBe('alternate');
    expect(changed.actions[1]).toEqual(original.groups[0]!.switches.A.actions[1]);
    expect(changed.secondaryMessages).toEqual(original.groups[0]!.switches.A.secondaryMessages);
    expect(rendered.current().groups[0]!.switches.B).toEqual(original.groups[0]!.switches.B);
  });

  it('retains incomplete numeric text across blur, switches, gestures and groups without committing it', () => {
    const configuration = boundFixture();
    configuration.groups[0]!.switches.A.behavior = 'shortLong';
    const second = structuredClone(configuration.groups[0]!); second.id = 'second-group'; second.name = 'Second'; configuration.groups.push(second);
    const rendered = showEditor(configuration);
    fireEvent.change(tapForm().getByRole('spinbutton'), { target: { value: '' } });
    fireEvent.blur(tapForm().getByRole('spinbutton'));
    expect((tapForm().getByRole('spinbutton') as HTMLInputElement).value).toBe('');
    expect(rendered.pending.mock.calls.at(-1)).toEqual([true]);
    fireEvent.click(screen.getByRole('button', { name: i18n.t('guided.onHold') }));
    fireEvent.click(screen.getByRole('button', { name: i18n.t('guided.editChoice', { choice: 'B' }) }));
    fireEvent.click(screen.getByRole('button', { name: i18n.t('guided.nextChoices') }));
    expect(rendered.current()).toEqual(configuration);
    fireEvent.click(screen.getByRole('button', { name: /Group 1.*A.*Incomplete fields/ }));
    expect((tapForm().getByRole('spinbutton') as HTMLInputElement).value).toBe('');
    fireEvent.change(tapForm().getByRole('spinbutton'), { target: { value: '3' } });
    expect(rendered.current().groups[0]!.switches.A.actions[0]!.messages[0]).toMatchObject({ type: 'pc', program: 2 });
    expect(rendered.pending.mock.calls.at(-1)).toEqual([false]);
    expect(rendered.confirm).not.toHaveBeenCalled();
  });

  it('keeps rejected edits pending and accepted MIDI unchanged', () => {
    const configuration = boundFixture();
    const rendered = showEditor(configuration, { onChange: () => false });
    fireEvent.change(tapForm().getByRole('spinbutton'), { target: { value: '9' } });
    expect(rendered.current()).toEqual(configuration);
    expect(rendered.pending.mock.calls.at(-1)).toEqual([true]);
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('commits hold edits into the secondary sequence and summarizes both gestures', async () => {
    const rendered = showEditor(boundFixture());
    fireEvent.click(screen.getByRole('button', { name: i18n.t('guided.addHold') }));
    const hold = within(screen.getByRole('form', { name: i18n.t('guided.onHold') }));
    await userEvent.setup().selectOptions(hold.getByLabelText(i18n.t('guided.action')), 'select-preset');
    fireEvent.change(hold.getByRole('spinbutton'), { target: { value: '2' } });
    const selected = rendered.current().groups[0]!.switches.A;
    expect(selected.behavior).toBe('shortLong');
    expect(selected.actions[0]!.messages[0]).toMatchObject({ type: 'pc', program: 0 });
    expect(selected.secondaryMessages![0]).toMatchObject({ type: 'pc', program: 1 });
    const summary = screen.getByRole('button', { name: 'Select switch A' }).closest('.controller-assignment')!;
    expect(summary.textContent).toContain(i18n.t('guided.onTap'));
    expect(summary.textContent).toContain(i18n.t('guided.onHold'));
    expect(summary.textContent).toContain(' · 2');
  });

  it('retains manual invalid fields and preserves the opposite sequence during raw MIDI edits', () => {
    const configuration = fixture();
    configuration.destinations = [];
    configuration.groups[0]!.switches.A = { label: 'A', behavior: 'momentary', actions: [{ gesture: 'press', messages: [{ type: 'pc', channel: 4, program: 7, bank: { msb: 9 } }] }], secondaryMessages: [{ type: 'cc', channel: 4, controller: 64, value: 0 }] };
    const rendered = showEditor(configuration);
    const input = screen.getByLabelText(i18n.t('program'));
    fireEvent.change(input, { target: { value: '' } }); fireEvent.blur(input);
    expect(rendered.current()).toEqual(configuration);
    fireEvent.change(input, { target: { value: '12' } });
    expect(rendered.current().groups[0]!.switches.A.actions[0]!.messages[0]).toEqual({ type: 'pc', channel: 4, program: 12, bank: { msb: 9 } });
    expect(rendered.current().groups[0]!.switches.A.secondaryMessages).toEqual(configuration.groups[0]!.switches.A.secondaryMessages);
  });

  it('adds equipment inside the inspector without replacing the existing action', async () => {
    const configuration = boundFixture();
    const rendered = showEditor(configuration);
    fireEvent.click(screen.getByRole('button', { name: 'Add equipment' }));
    await userEvent.setup().selectOptions(screen.getByLabelText('Equipment profile'), `${profile.modelId}@${profile.profileVersion}`);
    fireEvent.change(screen.getByLabelText('Equipment name'), { target: { value: 'Second destination' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'MIDI channel' }), { target: { value: '9' } });
    fireEvent.click(within(screen.getByLabelText('Equipment name').closest('.workbench-add-equipment') as HTMLElement).getByRole('button', { name: 'Add equipment' }));
    expect(rendered.current().destinations.find(entry => entry.name === 'Second destination')).toMatchObject({ channel: 9 });
    expect(rendered.current().groups).toEqual(configuration.groups);
  });

  it('invalidates a raw replacement decision when the action parameters change', async () => {
    const configuration = fixture();
    configuration.groups[0]!.switches.A.actions = [{ gesture: 'press', messages: [{ type: 'pc', channel: 3, program: 9 }] }];
    const rendered = showEditor(configuration);
    await userEvent.setup().selectOptions(tapForm().getByLabelText(i18n.t('guided.action')), 'select-preset');
    fireEvent.change(tapForm().getByRole('spinbutton'), { target: { value: '2' } });
    act(() => rendered.confirm.mock.calls[0]![2]());
    expect(rendered.current()).toEqual(configuration);
    act(() => rendered.confirm.mock.calls[1]![2]());
    expect(rendered.current().groups[0]!.switches.A.actions[0]!.messages).toEqual([{ type: 'pc', channel: 3, program: 1, destinationId: 'stage-unit' }]);
  });

  it('keeps rejected labels visible and recoverable inside optional switch settings across navigation and language changes', async () => {
    const rendered = showEditor(boundFixture(), { onChange: next => next.groups[0]!.switches.A.label !== 'Rejected' });
    const user = userEvent.setup();
    const summary = screen.getByText('Switch name and behavior', { selector: 'summary' });
    const details = summary.parentElement as HTMLDetailsElement;
    expect(details.open).toBe(false);
    await user.click(summary);
    fireEvent.change(screen.getByRole('textbox', { name: i18n.t('label') }), { target: { value: 'Rejected' } });
    expect(rendered.current().groups[0]!.switches.A.label).toBe('A');
    expect(rendered.pending.mock.calls.at(-1)).toEqual([true]);
    await user.click(summary);
    expect(details.open).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: /Group 1.*A.*Incomplete fields/ }));
    expect(details.open).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: i18n.t('guided.editChoice', { choice: 'B' }) }));
    await act(async () => { await i18n.changeLanguage('pt-BR'); });
    await user.click(screen.getByText('Nome e comportamento do botão', { selector: 'summary' }));
    fireEvent.click(screen.getByRole('button', { name: /Group 1.*A.*Campos incompletos/ }));
    const label = screen.getByRole('textbox', { name: i18n.t('label') }) as HTMLInputElement;
    expect(details.open).toBe(true);
    expect(label.value).toBe('Rejected');
    fireEvent.change(label, { target: { value: 'Accepted' } });
    expect(rendered.current().groups[0]!.switches.A.label).toBe('Accepted');
    expect(rendered.pending.mock.calls.at(-1)).toEqual([false]);
    fireEvent.change(screen.getByRole('combobox', { name: i18n.t('behavior') }), { target: { value: 'alternate' } });
    expect(rendered.current().groups[0]!.switches.A.behavior).toBe('alternate');
    expect(rendered.current().groups[0]!.switches.A.actions[0]!.messages[0]).toMatchObject({ type: 'pc', program: 0 });
  });
});

describe('equipment instances and stored navigation', () => {
  it('creates a separate destination when changing a bound channel instead of invalidating existing actions', async () => {
    const configuration = boundFixture();
    const changed = vi.fn(); const complete = vi.fn();
    render(<EquipmentStep configuration={configuration} onChange={changed} onComplete={complete} destinationId="stage-unit" />);
    fireEvent.change(screen.getByRole('spinbutton', { name: i18n.t('defaultChannel') }), { target: { value: '8' } });
    await userEvent.setup().click(screen.getByRole('button', { name: i18n.t('guided.editSwitches') }));
    const next = changed.mock.calls[0]![0] as StudioConfiguration;
    expect(next.destinations.find((entry) => entry.id === 'stage-unit')!.channel).toBe(3);
    expect(next.groups).toEqual(configuration.groups);
    const destination = next.destinations.find((entry) => entry.id !== 'stage-unit')!;
    expect(destination.channel).toBe(8);
    expect(destination.profile).toEqual(configuration.destinations[0]!.profile);
    expect(complete).toHaveBeenCalledWith(destination.id);
  });

  it('does not advance after rejected equipment mutation and prevents stale bound channel edits in destination tools', async () => {
    const configuration = boundFixture();
    const complete = vi.fn();
    const mounted = render(<EquipmentStep configuration={configuration} onChange={() => false} onComplete={complete} destinationId="stage-unit" />);
    await userEvent.setup().click(screen.getByRole('button', { name: i18n.t('guided.editSwitches') }));
    expect(complete).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toBeTruthy();
    mounted.unmount();
    render(<Destinations configuration={configuration} onChange={() => true} />);
    expect((screen.getByRole('spinbutton', { name: i18n.t('defaultChannel') }) as HTMLInputElement).closest('fieldset')!.disabled).toBe(true);
  });

});
