// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONFIGURATION_LIMITS, SWITCH_IDS, exportConfiguration, studioConfigurationSchema } from '@chocolate-studio/midi';
import type { StudioConfiguration } from '@chocolate-studio/midi';
import { App } from '../src/App.js';
import { initialConfiguration, sameConfiguration, setMessages } from '../src/editor.js';
import { en, i18n, initializeLanguage, pt } from '../src/i18n.js';
import { database } from '../src/storage.js';
import { useStudio } from '../src/useStudio.js';
import { unavailableHardware } from '../src/hardware.js';
import type { HardwareService, HardwareSnapshot } from '../src/hardware.js';

function pendingFile(text: Promise<string>): File {
  return { size: 100, text: () => text } as File;
}
async function ready(configuration = initialConfiguration('en'), hardware?: HardwareService) {
  await database.initialize(configuration);
  const rendered = render(<App {...(hardware ? { hardware } : {})} />);
  await waitFor(() => expect((screen.getByLabelText(i18n.t('projectName')) as HTMLInputElement).disabled).toBe(false));
  return rendered;
}
function fullConfiguration(): StudioConfiguration {
  const configuration = initialConfiguration('en');
  const first = configuration.groups[0]!;
  configuration.groups = Array.from({ length: 32 }, (_, index) => {
    const group = structuredClone(first);
    group.id = `group-${index + 1}`;
    group.name = `Group ${index + 1}`;
    for (const id of SWITCH_IDS) {
      group.switches[id].actions = [{ gesture: 'press', messages: Array.from({ length: 32 }, (_, program) => ({ type: 'pc', channel: 1, program })) }];
    }
    return group;
  });
  configuration.presets = [{ id: 'preset-99', name: 'Solo', channel: 3, program: 99 }];
  return studioConfigurationSchema.parse(configuration);
}

beforeAll(async () => {
  await initializeLanguage('en');
  // jsdom does not supply the browser's modal presentation/focus implementation.
  if (!HTMLDialogElement.prototype.showModal) HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  if (!HTMLDialogElement.prototype.close) HTMLDialogElement.prototype.close = function () { this.open = false; };
});
beforeEach(async () => { await i18n.changeLanguage('en'); await database.open(); });
afterEach(async () => { cleanup(); vi.restoreAllMocks(); await database.delete(); });

it('blocks name edits during initial loading and saving, then permits editing after completion', async () => {
  const loading = Promise.withResolvers<void>();
  const initialize = database.initialize.bind(database);
  vi.spyOn(database, 'initialize').mockImplementation(async (configuration) => { await loading.promise; return initialize(configuration); });
  render(<App />);
  const user = userEvent.setup();
  const name = screen.getByLabelText(en.projectName) as HTMLInputElement;
  const original = name.value;
  expect(name.disabled).toBe(true);
  await user.type(name, 'lost name');
  expect(name.value).toBe(original);
  await act(async () => { loading.resolve(); });
  await waitFor(() => expect(name.disabled).toBe(false));
  fireEvent.change(name, { target: { value: 'Clean set' } });
  const saving = Promise.withResolvers<void>();
  const save = database.save.bind(database);
  vi.spyOn(database, 'save').mockImplementation(async (configuration, revision) => { await saving.promise; return save(configuration, revision); });
  await user.click(screen.getByRole('button', { name: en.save }));
  expect(name.disabled).toBe(true);
  await user.type(name, 'lost while saving');
  expect(name.value).toBe('Clean set');
  await act(async () => { saving.resolve(); });
  await waitFor(() => expect(name.disabled).toBe(false));
  expect((await database.drafts.get('current'))?.configuration.name).toBe('Clean set');
});

describe('import review generation', () => {
  it('does not reopen a cancelled newer review when an older file finishes reading', async () => {
    const { result } = renderHook(() => useStudio());
    await waitFor(() => expect(result.current.loading).toBe(false));
    const older = Promise.withResolvers<string>();
    let oldRead!: Promise<void>;
    act(() => { oldRead = result.current.importProject(pendingFile(older.promise)); });
    const latest = initialConfiguration('en');
    latest.name = 'Latest selection';
    await act(async () => { await result.current.importProject(pendingFile(Promise.resolve(exportConfiguration(latest)))); });
    expect(result.current.incoming?.name).toBe('Latest selection');
    act(() => result.current.setIncoming(null));
    await act(async () => { older.resolve(exportConfiguration(initialConfiguration('pt-BR'))); await oldRead; });
    expect(result.current.incoming).toBeNull();
    expect(result.current.notice).toBeNull();
  });

  it('ignores an obsolete file read failure after a backup review replaces it', async () => {
    const { result } = renderHook(() => useStudio());
    await waitFor(() => expect(result.current.loading).toBe(false));
    const older = Promise.withResolvers<string>();
    let oldRead!: Promise<void>;
    act(() => { oldRead = result.current.importProject(pendingFile(older.promise)); });
    const backup = initialConfiguration('en');
    backup.name = 'Backup review';
    act(() => result.current.setIncoming(backup));
    await act(async () => { older.reject(new Error('File read failed')); await oldRead; });
    expect(result.current.incoming?.name).toBe('Backup review');
    expect(result.current.notice).toBeNull();
  });
});

describe('aggregate message capacity', () => {
  it.each(['add', 'duplicate', 'preset'] as const)('rejects %s growth at 4096 without making the draft unsaveable', async (operation) => {
    await ready(fullConfiguration());
    fireEvent.click(screen.getByRole('button', { name: en.secondary }));
    if (operation === 'add') {
      fireEvent.click(screen.getByRole('button', { name: en.addPc }));
    } else if (operation === 'duplicate') {
      fireEvent.click(screen.getByText(en.groupName, { selector: 'summary' }));
      fireEvent.click(screen.getByRole('button', { name: en.duplicateGroup }));
    } else {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${en.presets}`) }));
      fireEvent.click(screen.getByRole('button', { name: en.usePreset }));
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: en.usePreset }));
      fireEvent.click(screen.getByRole('button', { name: en.board }));
    }
    expect(screen.getByRole('alert').textContent).toContain(en.limitReached);
    expect((screen.getByRole('button', { name: en.save }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('button', { name: en.secondary }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText(en.noMessages)).toBeTruthy();
  });
});

it('rejects JSON byte overflow and restores accepted numeric/name displays at the valid byte boundary', async () => {
  const configuration = fullConfiguration();
  configuration.name = 'Música';
  const destinationId = 'd'.repeat(64);
  configuration.destinations[0]!.id = destinationId;
  function setCount(count: number) {
    let remaining = count;
    for (const group of configuration.groups) for (const id of SWITCH_IDS) {
      const length = Math.min(remaining, 32);
      remaining -= length;
      group.switches[id].actions = length ? [{
        gesture: 'press',
        messages: Array.from({ length }, () => ({ type: 'pc', channel: 16, program: 127, bank: { msb: 127, lsb: 127 }, destinationId })),
      }] : [];
    }
  }
  const encoder = new TextEncoder();
  const maximum = CONFIGURATION_LIMITS.jsonBytes;
  let low = 0;
  let high = CONFIGURATION_LIMITS.totalMessages;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    setCount(middle);
    if (encoder.encode(JSON.stringify(configuration, null, 2) + '\\n').byteLength < maximum) low = middle;
    else high = middle - 1;
  }
  setCount(low);
  const firstMessage = configuration.groups[0]!.switches.A.actions[0]!.messages[0]!;
  if (firstMessage.type === 'pc') firstMessage.program = 0;
  let padding = maximum - 1 - encoder.encode(exportConfiguration(configuration)).byteLength;
  for (const named of [configuration, ...configuration.destinations, ...configuration.groups]) {
    const append = Math.min(padding, CONFIGURATION_LIMITS.nameLength - named.name.length);
    named.name += 'x'.repeat(append);
    padding -= append;
  }
  expect(padding).toBe(0);
  expect(low).toBeLessThan(CONFIGURATION_LIMITS.totalMessages);
  expect(encoder.encode(exportConfiguration(configuration)).byteLength).toBe(maximum - 1);
  await ready(configuration);
  fireEvent.click(screen.getByRole('button', { name: en.secondary }));
  fireEvent.click(screen.getByRole('button', { name: en.addPc }));
  expect(screen.getByRole('alert').textContent).toContain(en.limitReached);
  fireEvent.click(screen.getByRole('button', { name: en.primary }));
  const program = screen.getAllByLabelText(en.program)[0] as HTMLInputElement;
  fireEvent.change(program, { target: { value: '127' } });
  fireEvent.blur(program);
  expect(program.value).toBe('0');
  const name = screen.getByLabelText(en.projectName) as HTMLInputElement;
  fireEvent.change(name, { target: { value: 'é'.repeat(128) } });
  fireEvent.blur(name);
  expect(name.value).toBe(configuration.name);
  expect((screen.getByRole('button', { name: en.save }) as HTMLButtonElement).disabled).toBe(true);
  const persisted = (await database.drafts.get('current'))!.configuration;
  expect(persisted.groups[0]!.switches.A.actions[0]!.messages[0]).toMatchObject({ type: 'pc', program: 0 });
  expect(persisted.groups[0]!.switches.A.secondaryMessages).toBeUndefined();
  expect(encoder.encode(exportConfiguration(persisted)).byteLength).toBe(maximum - 1);
});

it('returns to Bank A after removing the selected additional gesture and adds subsequent messages there', async () => {
  const configuration = initialConfiguration('en');
  configuration.groups[0]!.switches.A.actions.push({ gesture: 'release', messages: [{ type: 'cc', channel: 2, controller: 69, value: 127 }] });
  await ready(configuration);
  fireEvent.change(screen.getByLabelText(en.additionalGesture), { target: { value: 'release' } });
  fireEvent.click(screen.getByRole('button', { name: en.remove }));
  expect(screen.queryByLabelText(en.additionalGesture)).toBeNull();
  expect(screen.getByRole('button', { name: en.primary }).getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(screen.getByRole('button', { name: en.addCc }));
  fireEvent.click(screen.getByRole('button', { name: en.save }));
  await waitFor(() => expect((screen.getByRole('button', { name: en.save }) as HTMLButtonElement).disabled).toBe(true));
  const actions = (await database.drafts.get('current'))!.configuration.groups[0]!.switches.A.actions;
  expect(actions.map((action) => action.gesture)).toEqual(['press']);
  expect(actions[0]!.messages.map((message) => message.type)).toEqual(['pc', 'cc']);
});

it.each(['en', 'pt-BR'] as const)('names actual confirmation actions in %s and performs only the confirmed operation', async (locale) => {
  await i18n.changeLanguage(locale);
  const copy = locale === 'en' ? en : pt;
  const configuration = initialConfiguration(locale);
  const second = structuredClone(configuration.groups[0]!);
  second.id = 'group-2';
  second.name = 'Second group';
  configuration.groups.push(second);
  configuration.presets.push({ id: 'preset-solo', name: 'Solo', channel: 2, program: 99 });
  await database.snapshot(configuration, 'Before rehearsal');
  await ready(configuration);
  fireEvent.click(screen.getByText(copy.groupName, { selector: 'summary' }));
  fireEvent.click(screen.getByRole('button', { name: copy.removeGroup }));
  let dialog = screen.getByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: copy.cancel }));
  expect(screen.getByRole('button', { name: /Second group$/ })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: copy.removeGroup }));
  dialog = screen.getByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: copy.removeGroup }));
  fireEvent.click(screen.getByRole('button', { name: copy.backups }));
  fireEvent.click(screen.getByRole('button', { name: copy.delete }));
  dialog = screen.getByRole('dialog');
  expect(await database.backups.count()).toBe(1);
  fireEvent.click(within(dialog).getByRole('button', { name: copy.delete }));
  await waitFor(async () => expect(await database.backups.count()).toBe(0));
  await waitFor(() => expect((screen.getByLabelText(copy.projectName) as HTMLInputElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${copy.presets}`) }));
  fireEvent.click(screen.getByRole('button', { name: copy.usePreset }));
  dialog = screen.getByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: copy.usePreset }));
  fireEvent.click(screen.getByRole('button', { name: copy.save }));
  await waitFor(() => expect((screen.getByRole('button', { name: copy.save }) as HTMLButtonElement).disabled).toBe(true));
  const stored = (await database.drafts.get('current'))!.configuration;
  expect(stored.groups.map((group) => group.id)).toEqual(['group-2']);
  expect(stored.groups[0]!.switches.A.actions[0]!.messages[0]).toEqual({ type: 'pc', channel: 2, program: 99 });
});

it.each(['en', 'pt-BR'] as const)('keeps file proxies out of keyboard navigation and connects the header shortcut in %s', async (locale) => {
  await i18n.changeLanguage(locale);
  const copy = locale === 'en' ? en : pt;
  await ready(initialConfiguration(locale));
  const user = userEvent.setup();
  fireEvent.change(screen.getByLabelText(copy.projectName), { target: { value: 'Keyboard set' } });
  const jsonInput = screen.getByLabelText(copy.import) as HTMLInputElement;
  screen.getByRole('button', { name: copy.save }).focus();
  await user.tab();
  expect(document.activeElement).not.toBe(jsonInput);
  fireEvent.click(screen.getByText(copy.rawBackup, { selector: 'summary' }));
  const rawInput = screen.getByLabelText(copy.importRaw) as HTMLInputElement;
  screen.getByRole('button', { name: copy.importRaw }).focus();
  await user.tab();
  expect(document.activeElement).not.toBe(rawInput);
  expect(document.activeElement).toBe(screen.getByRole('button', { name: copy.clear }));
  screen.getByRole('link', { name: copy.connectPedal }).focus();
  await user.keyboard('{Enter}');
  expect(document.activeElement).toBe(document.getElementById('hardware-panel'));
});

it.each(['en', 'pt-BR'] as const)('explains a pending MIDI permission request in %s and removes the hint after it settles', async (locale) => {
  await i18n.changeLanguage(locale);
  const copy = locale === 'en' ? en : pt;
  let snapshot: HardwareSnapshot = { ...unavailableHardware.getSnapshot(), status: 'requesting' };
  const hardware: HardwareService = { ...unavailableHardware, getSnapshot: () => snapshot };
  const rendered = await ready(initialConfiguration(locale), hardware);
  expect(screen.getByText(copy['hardware.requestingPermission']).getAttribute('role')).toBe('status');
  expect((screen.getByRole('button', { name: copy.requestPorts }) as HTMLButtonElement).disabled).toBe(true);
  snapshot = { ...snapshot, status: 'disconnected' };
  rendered.rerender(<App hardware={hardware} />);
  expect(screen.queryByText(copy['hardware.requestingPermission'])).toBeNull();
  expect((screen.getByRole('button', { name: copy.requestPorts }) as HTMLButtonElement).disabled).toBe(false);
});

it('treats parsed key order as saved while preserving later edits during an asynchronous save', async () => {
  const { result } = renderHook(() => useStudio());
  await waitFor(() => expect(result.current.loading).toBe(false));
  const edited = setMessages(result.current.configuration, result.current.configuration.groups[0]!.id, 'A', 'secondary', [{ type: 'cc', channel: 1, controller: 69, value: 127 }]);
  edited.groups[0]!.switches.A.label = 'Clean';
  edited.groups[0]!.switches.A.behavior = 'alternate';
  const primary = edited.groups[0]!.switches.A.actions[0]!.messages[0]!;
  if (primary.type !== 'pc') throw new Error('Expected program');
  primary.program = 17;
  const parsed = studioConfigurationSchema.parse(edited);
  expect(sameConfiguration(edited, parsed)).toBe(true);
  act(() => { result.current.setConfiguration(edited); });
  await act(async () => { await result.current.save(); });
  expect(result.current.dirty).toBe(false);
  const waiting = Promise.withResolvers<void>();
  const save = database.save.bind(database);
  vi.spyOn(database, 'save').mockImplementation(async (configuration, revision) => { await waiting.promise; return save(configuration, revision); });
  const beforeSave = structuredClone(edited);
  beforeSave.name = 'Before slow save';
  act(() => { result.current.setConfiguration(beforeSave); });
  let saving!: Promise<void>;
  act(() => { saving = result.current.save(); });
  const laterEdit = structuredClone(beforeSave);
  laterEdit.name = 'Later edit';
  act(() => { result.current.setConfiguration(laterEdit); });
  await act(async () => { waiting.resolve(); await saving; });
  expect(result.current.configuration.name).toBe('Later edit');
  expect(result.current.saved?.configuration.name).toBe('Before slow save');
  expect(result.current.dirty).toBe(true);
  const reordered = structuredClone(edited);
  reordered.groups[0]!.switches.A.actions[0]!.messages.push({ type: 'cc', channel: 1, controller: 80, value: 0 });
  const reversed = structuredClone(reordered);
  reversed.groups[0]!.switches.A.actions[0]!.messages.reverse();
  expect(sameConfiguration(reordered, reversed)).toBe(false);
});
