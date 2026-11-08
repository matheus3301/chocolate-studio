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
import { groupProgramRange } from '../src/guided-navigation.js';
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

describe('generic musical action forms', () => {
  it('removes irrelevant parameters and applies a no-parameter action without retaining the preset command', async () => {
    const rendered = showEditor(fixture());
    const user = userEvent.setup();
    await user.selectOptions(tapForm().getByLabelText(i18n.t('guided.action')), 'select-preset');
    const preset = tapForm().getByRole('spinbutton', { name: profile.actions.find((action) => action.id === 'select-preset')!.parameters['preset-number']!.label.en });
    fireEvent.change(preset, { target: { value: '17' } });
    await user.selectOptions(tapForm().getByLabelText(i18n.t('guided.action')), 'tuner-enter');
    expect(tapForm().queryByRole('spinbutton')).toBeNull();
    await user.click(tapForm().getByRole('button', { name: i18n.t('guided.applyAction') }));
    const pedal = rendered.current().groups[0]!.switches.A;
    expect(pedal.actions[0]!.messages).toEqual([{ type: 'cc', channel: 3, controller: 69, value: 127, destinationId: 'stage-unit' }]);
    expect(pedal.actionBindings!.primary!.parameters).toEqual({});
  });

  it('renders a second data-only profile with its own parameter range, vocabulary, and byte mapping', async () => {
    // Synthetic renderer fixture, not manufacturer or hardware evidence.
    const synthetic: EquipmentProfile = structuredClone(profile);
    synthetic.modelId = 'test.scene-unit';
    synthetic.label = { en: 'Scene unit', 'pt-BR': 'Unidade de cenas' };
    const action = structuredClone(profile.actions[0]!);
    action.id = 'choose-scene'; action.label = { en: 'Choose scene', 'pt-BR': 'Escolher cena' };
    action.parameters = { scene: { type: 'integer', label: { en: 'Scene', 'pt-BR': 'Cena' }, minimum: 10, maximum: 12, initial: 10 } };
    action.messages = [{ type: 'pc', channel: 'destination', program: { parameter: 'scene', offset: -5 } }];
    synthetic.actions = [action];
    const rendered = showEditor(fixture(synthetic), { profiles: [profile, synthetic] });
    await userEvent.setup().selectOptions(tapForm().getByLabelText(i18n.t('guided.action')), 'choose-scene');
    const input = tapForm().getByRole('spinbutton', { name: 'Scene' }) as HTMLInputElement;
    expect([input.min, input.max]).toEqual(['10', '12']);
    fireEvent.change(input, { target: { value: '12' } });
    await userEvent.setup().click(tapForm().getByRole('button', { name: i18n.t('guided.applyAction') }));
    expect(rendered.current().groups[0]!.switches.A.actions[0]!.messages).toEqual([{ type: 'pc', channel: 3, program: 7, destinationId: 'stage-unit' }]);
    expect(screen.getByText(/Stage unit · Choose scene/)).toBeTruthy();
  });

  it('changes an existing musical parameter without asking to replace the ordinary bound sequence', async () => {
    const rendered = showEditor(boundFixture());
    fireEvent.change(tapForm().getByRole('spinbutton'), { target: { value: '2' } });
    await userEvent.setup().click(tapForm().getByRole('button', { name: i18n.t('guided.applyAction') }));
    expect(rendered.confirm).not.toHaveBeenCalled();
    expect(rendered.current().groups[0]!.switches.A.actions[0]!.messages[0]).toMatchObject({ type: 'pc', program: 1, channel: 3 });
  });

  it('retains alternate/multi-message/extra gestures until explicit conversion and keeps other sequences and switches', async () => {
    const configuration = fixture();
    const group = configuration.groups[0]!;
    group.switches.A = { label: 'A', behavior: 'alternate', actions: [{ gesture: 'press', messages: [{ type: 'pc', channel: 2, program: 7 }, { type: 'cc', channel: 2, controller: 11, value: 0 }] }, { gesture: 'release', messages: [{ type: 'pc', channel: 2, program: 9 }] }], secondaryMessages: [{ type: 'cc', channel: 2, controller: 69, value: 0 }] };
    const original = structuredClone(configuration);
    const rendered = showEditor(configuration);
    const form = within(screen.getByRole('form', { name: i18n.t('guided.primarySequence') }));
    await userEvent.setup().selectOptions(form.getByLabelText(i18n.t('guided.action')), 'select-preset');
    await userEvent.setup().click(form.getByRole('button', { name: i18n.t('guided.applyAction') }));
    expect(rendered.current()).toEqual(original);
    expect(rendered.confirm).toHaveBeenCalledTimes(1);
    act(() => rendered.confirm.mock.calls[0]![2]());
    const changed = rendered.current().groups[0]!;
    expect(changed.switches.A.behavior).toBe('shortLong');
    expect(changed.switches.A.actions.map((entry) => entry.gesture)).toEqual(['press']);
    expect(changed.switches.A.secondaryMessages).toEqual(original.groups[0]!.switches.A.secondaryMessages);
    expect(changed.switches.B).toEqual(original.groups[0]!.switches.B);
  });

  it('keeps rejected action edits pending and does not report success or replace accepted configuration', async () => {
    const configuration = boundFixture();
    const rendered = showEditor(configuration, { onChange: () => false });
    fireEvent.change(tapForm().getByRole('spinbutton'), { target: { value: '9' } });
    await userEvent.setup().click(tapForm().getByRole('button', { name: i18n.t('guided.applyAction') }));
    expect(rendered.current()).toEqual(configuration);
    expect(rendered.pending.mock.calls.at(-1)).toEqual([true]);
    expect(screen.getByRole('alert')).toBeTruthy();
  });
});

describe('pending action navigation', () => {
  it('guards local switch/group navigation and only discards after confirmation', async () => {
    const configuration = fixture();
    const second = structuredClone(configuration.groups[0]!); second.id = 'second-group'; second.name = 'Second'; configuration.groups.push(second);
    const rendered = showEditor(configuration);
    await userEvent.setup().selectOptions(tapForm().getByLabelText(i18n.t('guided.action')), 'select-preset');
    await userEvent.setup().click(screen.getByRole('button', { name: i18n.t('guided.nextChoices') }));
    expect((screen.getByLabelText(i18n.t('guided.goToChoices')) as HTMLSelectElement).value).toBe(configuration.groups[0]!.id);
    act(() => rendered.confirm.mock.calls[0]![2]());
    expect((screen.getByLabelText(i18n.t('guided.goToChoices')) as HTMLSelectElement).value).toBe('second-group');
    expect(rendered.pending.mock.calls.at(-1)).toEqual([false]);
    await userEvent.setup().selectOptions(tapForm().getByLabelText(i18n.t('guided.action')), 'tuner-enter');
    await userEvent.setup().click(screen.getByRole('button', { name: i18n.t('guided.editChoice', { choice: 'B' }) }));
    expect(screen.getByRole('heading', { name: i18n.t('editingSwitch', { switch: 'A' }) })).toBeTruthy();
    expect(rendered.current().groups[1]!.switches.A.actions).toEqual([]);
    act(() => rendered.confirm.mock.calls[1]![2]());
    expect(screen.getByRole('heading', { name: i18n.t('editingSwitch', { switch: 'B' }) })).toBeTruthy();
  });

  it('aggregates tap/hold forms so applying one cannot clear the other, and compiles hold as shortLong secondary', async () => {
    const rendered = showEditor(fixture());
    const user = userEvent.setup();
    await user.selectOptions(tapForm().getByLabelText(i18n.t('guided.action')), 'select-preset');
    await user.click(screen.getByRole('button', { name: i18n.t('guided.addHold') }));
    const hold = within(screen.getByRole('form', { name: i18n.t('guided.onHold') }));
    await user.selectOptions(hold.getByLabelText(i18n.t('guided.action')), 'select-preset');
    fireEvent.change(hold.getByRole('spinbutton'), { target: { value: '2' } });
    await user.click(tapForm().getByRole('button', { name: i18n.t('guided.applyAction') }));
    expect(rendered.pending.mock.calls.at(-1)).toEqual([true]);
    await user.click(hold.getByRole('button', { name: i18n.t('guided.applyAction') }));
    const selected = rendered.current().groups[0]!.switches.A;
    expect(selected.behavior).toBe('shortLong');
    expect(selected.actions.map((entry) => entry.gesture)).toEqual(['press']);
    expect(selected.actions[0]!.messages[0]).toMatchObject({ type: 'pc', program: 0 });
    expect(selected.secondaryMessages![0]).toMatchObject({ type: 'pc', program: 1 });
    expect(rendered.pending.mock.calls.at(-1)).toEqual([false]);
    rendered.unmount();
    expect(rendered.pending.mock.calls.at(-1)).toEqual([false]);
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

  it('navigates only actual stored groups and does not conflate raw0/pcDisplay=false with advanced assignment numbers', async () => {
    const configuration = fixture();
    for (let groupIndex = 0; groupIndex < 3; groupIndex++) {
      if (groupIndex) { const next = structuredClone(configuration.groups[0]!); next.id = `stored-${groupIndex}`; next.name = `Stored ${groupIndex}`; configuration.groups.push(next); }
      for (const [index, id] of SWITCH_IDS.entries()) configuration.groups[groupIndex]!.switches[id].actions = [{ gesture: 'press', messages: [{ type: 'pc', channel: 1, program: groupIndex * 4 + index }] }];
    }
    const rendered = showEditor(configuration, { modeMetadata: { rawMode: 0, modeKind: 'program-change', displayStyle: 'pc-number', pcDisplayEnabled: false } });
    expect(screen.getByText(i18n.t('guided.programChangeMode'))).toBeTruthy();
    expect(screen.queryByText(i18n.t('guided.numbersOnChocolate'))).toBeNull();
    expect(within(screen.getByLabelText(i18n.t('guided.goToChoices'))).getAllByRole('option').map((entry) => entry.textContent)).toEqual(configuration.groups.map((group) => group.name));
    await userEvent.setup().click(screen.getByRole('button', { name: i18n.t('guided.nextChoices') }));
    expect((screen.getByLabelText(i18n.t('guided.goToChoices')) as HTMLSelectElement).value).toBe('stored-1');
    expect(rendered.current()).toEqual(configuration);
    expect(groupProgramRange(configuration.groups[1]!)).toBe('004–007');
    configuration.groups[1]!.switches.C.secondaryMessages = [{ type: 'pc', channel: 1, program: 90 }];
    expect(groupProgramRange(configuration.groups[1]!)).toBeUndefined();
  });
});
