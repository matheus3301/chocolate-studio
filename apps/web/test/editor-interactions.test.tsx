// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONFIGURATION_LIMITS, SWITCH_IDS, exportConfiguration, studioConfigurationSchema } from '@chocolate-studio/midi';
import type { StudioConfiguration } from '@chocolate-studio/midi';
import { workbenchConnectionEn, workbenchConnectionPt } from '../src/workbench-connection-i18n.js';
import { App } from '../src/App.js';
import { initialConfiguration, sameConfiguration, setMessages } from '../src/editor.js';
import { en, i18n, initializeLanguage, pt } from '../src/i18n.js';
import { database } from '../src/storage.js';
import { useStudio } from '../src/useStudio.js';

function pendingFile(text: Promise<string>): File {
  return { size: 100, text: () => text } as File;
}
async function ready(configuration = initialConfiguration('en')) {
  await database.initialize(configuration);
  const rendered = render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: i18n.t('offline', { ns: 'workbenchConnection' }) }));
  return rendered;
}
function openFiles() {
  const summary = screen.getByText(i18n.t('file', { ns: 'workbench' }), { selector: 'summary' });
  if (!summary.parentElement?.hasAttribute('open')) fireEvent.click(summary);
}
function openPresets() {
  fireEvent.click(screen.getByRole('button', { name: i18n.t('managePresets', { ns: 'workbenchEditor' }) }));
}
function openDestinations() {
  fireEvent.click(screen.getByRole('button', { name: i18n.t('manageEquipment', { ns: 'workbenchEditor' }) }));
}

function fullConfiguration(): StudioConfiguration {
  const configuration = initialConfiguration('en');
  configuration.controller = { mode: 3 };
  const first = configuration.groups[0]!;
  // Leave an eighth group available: duplication must hit the message budget, not the group limit.
  configuration.groups = Array.from({ length: 7 }, (_, index) => {
    const group = structuredClone(first);
    group.id = `group-${index + 1}`;
    group.name = `Group ${index + 1}`;
    for (const id of SWITCH_IDS) {
      group.switches[id].behavior = 'shortLong';
      group.switches[id].actions = (['press', 'release', 'longPress', 'doublePress'] as const).map(gesture => ({
        gesture, messages: Array.from({ length: 32 }, (_, program) => ({ type: 'pc', channel: 1, program })),
      }));
    }
    return group;
  });
  let remaining = CONFIGURATION_LIMITS.totalMessages - 7 * 4 * 4 * 32;
  for (const group of configuration.groups) for (const id of SWITCH_IDS) {
    if (group === configuration.groups[0] && id === 'A') continue;
    const length = Math.min(remaining, 32);
    remaining -= length;
    if (length) group.switches[id].secondaryMessages = Array.from({ length }, (_, program) => ({ type: 'pc', channel: 1, program }));
  }
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

it('waits for initialization, then keeps valid fields editable during automatic local saving', async () => {
  const loading = Promise.withResolvers<void>();
  const initialize = database.initialize.bind(database);
  vi.spyOn(database, 'initialize').mockImplementation(async (...args) => { await loading.promise; return initialize(...args); });
  render(<App />);
  expect(screen.queryByLabelText(en.program)).toBeNull();
  await act(async () => { loading.resolve(); });
  fireEvent.click(await screen.findByRole('button', { name: workbenchConnectionEn.offline }));
  const saving = Promise.withResolvers<void>();
  const started = Promise.withResolvers<void>();
  const save = database.save.bind(database);
  vi.spyOn(database, 'save').mockImplementationOnce(async (...args) => {
    started.resolve(); await saving.promise; return save(...args);
  });
  const program = screen.getAllByLabelText(en.program)[0] as HTMLInputElement;
  fireEvent.change(program, { target: { value: '17' } });
  await act(async () => { await started.promise; });
  expect(program.matches(':disabled')).toBe(false);
  fireEvent.change(program, { target: { value: '42' } });
  expect(program.value).toBe('42');
  await act(async () => { saving.resolve(); });
  await waitFor(async () => expect((await database.drafts.get('current'))?.configuration.groups[0]?.switches.A.actions[0]?.messages[0]).toMatchObject({ program: 42 }));
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
  it.each(['add', 'duplicate', 'preset'] as const)('rejects %s growth at 4096 without replacing the valid recovery snapshot', async (operation) => {
    const configuration = fullConfiguration();
    await ready(configuration);
    fireEvent.click(screen.getByRole('button', { name: i18n.t('guided.onHold') }));
    if (operation === 'add') {
      fireEvent.click(screen.getByRole('button', { name: en.addPc }));
    } else if (operation === 'duplicate') {
      fireEvent.click(screen.getByText(i18n.t('settings', { ns: 'workbenchEditor' }), { selector: 'summary' }));
      fireEvent.click(screen.getByRole('button', { name: en.duplicateGroup }));
    } else {
      openPresets();
      const library = screen.getByRole('dialog');
      fireEvent.click(within(library).getByRole('button', { name: en.usePreset }));
      fireEvent.click(within(screen.getByRole('dialog', { name: en.confirmPreset })).getByRole('button', { name: en.usePreset }));
      fireEvent.click(within(library).getByRole('button', { name: en.close }));
    }
    expect(screen.getAllByRole('alert').some(alert => alert.textContent?.includes(en.limitReached))).toBe(true);
    expect(screen.getByRole('button', { name: i18n.t('guided.onHold') }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText(en.noMessages)).toBeTruthy();
    expect((await database.drafts.get('current'))?.configuration).toEqual(configuration);
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
      group.switches[id].actions = [];
      delete group.switches[id].secondaryMessages;
      for (const gesture of ['press', 'release', 'longPress', 'doublePress'] as const) {
        const length = Math.min(remaining, 32);
        remaining -= length;
        if (length) group.switches[id].actions.push({
          gesture,
          messages: Array.from({ length }, () => ({ type: 'pc', channel: 16, program: 127, bank: { msb: 127, lsb: 127 }, destinationId })),
        });
      }
    }
    for (const group of configuration.groups) for (const id of SWITCH_IDS) {
      if (group === configuration.groups[0] && id === 'A') continue;
      const length = Math.min(remaining, 32);
      remaining -= length;
      if (length) group.switches[id].secondaryMessages = Array.from({ length }, () => ({ type: 'pc', channel: 16, program: 127, bank: { msb: 127, lsb: 127 }, destinationId }));
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
  fireEvent.click(screen.getByRole('button', { name: i18n.t('guided.onHold') }));
  fireEvent.click(screen.getByRole('button', { name: en.addPc }));
  expect(screen.getAllByRole('alert').some(alert => alert.textContent?.includes(en.limitReached))).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: i18n.t('discard', { ns: 'workbenchEditor' }) }));
  fireEvent.click(screen.getByRole('button', { name: i18n.t('guided.onTap') }));
  const program = screen.getAllByLabelText(en.program)[0] as HTMLInputElement;
  fireEvent.change(program, { target: { value: '127' } });
  fireEvent.blur(program);
  expect(program.value).toBe('0');
  expect(screen.getAllByRole('alert').some(alert => alert.textContent?.includes(en.limitReached))).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: i18n.t('discard', { ns: 'workbenchEditor' }) }));
  openDestinations();
  const name = screen.getByLabelText(en.destinationName) as HTMLInputElement;
  fireEvent.change(name, { target: { value: 'é'.repeat(128) } });
  fireEvent.blur(name);
  expect(name.value).toBe(configuration.destinations[0]!.name);
  const persisted = (await database.drafts.get('current'))!.configuration;
  expect(persisted.groups[0]!.switches.A.actions[0]!.messages[0]).toMatchObject({ type: 'pc', program: 0 });
  expect(persisted.groups[0]!.switches.A.secondaryMessages).toBeUndefined();
  expect(encoder.encode(exportConfiguration(persisted)).byteLength).toBe(maximum - 1);
});

it('returns to Bank A after removing the selected additional gesture and adds subsequent messages there', async () => {
  const configuration = initialConfiguration('en');
  configuration.groups[0]!.switches.A.actions.push({ gesture: 'release', messages: [{ type: 'cc', channel: 2, controller: 69, value: 127 }] });
  await ready(configuration);
  fireEvent.click(screen.getByRole('button', { name: en.release }));
  fireEvent.click(screen.getByRole('button', { name: en.remove }));
  expect(screen.queryByRole('button', { name: en.release })).toBeNull();
  expect(screen.getByRole('button', { name: i18n.t('guided.onTap') }).getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(screen.getByRole('button', { name: en.addCc }));
  await waitFor(async () => expect((await database.drafts.get('current'))?.configuration.groups[0]?.switches.A.actions.map(action => action.gesture)).toEqual(['press']));
  const actions = (await database.drafts.get('current'))!.configuration.groups[0]!.switches.A.actions;
  expect(actions.map((action) => action.gesture)).toEqual(['press']);
  expect(actions[0]!.messages.map((message) => message.type)).toEqual(['pc', 'cc']);
});

it.each(['en', 'pt-BR'] as const)('cancels destructive actions and applies only confirmed group, recovery and preset changes in %s', async (locale) => {
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
  fireEvent.click(screen.getByText(i18n.t('settings', { ns: 'workbenchEditor' }), { selector: 'summary' }));
  fireEvent.click(screen.getByRole('button', { name: copy.removeGroup }));
  let dialog = screen.getByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: copy.cancel }));
  expect(screen.getByRole('option', { name: 'Second group' })).toBeTruthy();
  expect((screen.getByLabelText(i18n.t('guided.goToChoices')) as HTMLSelectElement).value).toBe(configuration.groups[0]!.id);
  fireEvent.click(screen.getByRole('button', { name: copy.removeGroup }));
  dialog = screen.getByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: copy.removeGroup }));
  openFiles(); fireEvent.click(screen.getByRole('button', { name: i18n.t('recovery', { ns: 'workbench' }) }));
  const recovery = screen.getByRole('dialog', { name: i18n.t('recovery', { ns: 'workbench' }) });
  fireEvent.click(within(recovery).getByRole('button', { name: copy.delete }));
  dialog = screen.getByRole('dialog', { name: copy.deleteBackup });
  expect(await database.backups.count()).toBe(1);
  fireEvent.click(within(dialog).getByRole('button', { name: copy.delete }));
  await waitFor(async () => expect(await database.backups.count()).toBe(0));
  await waitFor(() => expect(screen.getAllByLabelText(copy.program)[0]!.matches(':disabled')).toBe(false));
  fireEvent.click(within(recovery).getByRole('button', { name: copy.close }));
  openPresets();
  const library = screen.getByRole('dialog');
  fireEvent.click(within(library).getByRole('button', { name: copy.usePreset }));
  dialog = screen.getByRole('dialog', { name: copy.confirmPreset });
  fireEvent.click(within(dialog).getByRole('button', { name: copy.usePreset }));
  await waitFor(async () => expect((await database.drafts.get('current'))?.configuration.groups[0]?.switches.A.actions[0]?.messages[0]).toEqual({ type: 'pc', channel: 2, program: 99 }));
  const stored = (await database.drafts.get('current'))!.configuration;
  expect(stored.groups.map((group) => group.id)).toEqual(['group-2']);
  expect(stored.groups[0]!.switches.A.actions[0]!.messages[0]).toEqual({ type: 'pc', channel: 2, program: 99 });
});

it.each(['en', 'pt-BR'] as const)('keeps edits through direct language changes and connection tools, with file proxies skipped by the keyboard in %s', async (locale) => {
  await i18n.changeLanguage(locale);
  const copy = locale === 'en' ? en : pt;
  await ready(initialConfiguration(locale));
  const user = userEvent.setup();
  fireEvent.change(screen.getByLabelText(copy.label), { target: { value: 'Keyboard set' } });
  const jsonInput = screen.getByLabelText(copy.import) as HTMLInputElement;
  const language = screen.getByLabelText(i18n.t('language', { ns: 'workbench' }));
  language.focus();
  await user.tab();
  expect(document.activeElement).not.toBe(jsonInput);
  const nextLocale = locale === 'en' ? 'pt-BR' : 'en';
  fireEvent.change(language, { target: { value: nextLocale } });
  await waitFor(() => expect(i18n.language).toBe(nextLocale));
  const nextCopy = nextLocale === 'en' ? en : pt;
  const connectionCopy = nextLocale === 'en' ? workbenchConnectionEn : workbenchConnectionPt;
  expect((screen.getByLabelText(nextCopy.label) as HTMLInputElement).value).toBe('Keyboard set');
  fireEvent.click(screen.getByRole('button', { name: i18n.t('offline', { ns: 'workbench' }) }));
  const dialog = screen.getByRole('dialog', { name: i18n.t('connection', { ns: 'workbench' }) });
  expect(within(dialog).getByRole('button', { name: connectionCopy.offline })).toBeTruthy();
  fireEvent.click(within(dialog).getByRole('button', { name: nextCopy.close }));
  expect((screen.getByLabelText(nextCopy.label) as HTMLInputElement).value).toBe('Keyboard set');
  await waitFor(async () => expect((await database.drafts.get('current'))?.configuration.groups[0]?.switches.A.label).toBe('Keyboard set'));
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
  const started = Promise.withResolvers<void>();
  const save = database.save.bind(database);
  vi.spyOn(database, 'save').mockImplementationOnce(async (...args) => { started.resolve(); await waiting.promise; return save(...args); });
  const beforeSave = structuredClone(edited);
  beforeSave.name = 'Before slow save';
  act(() => { result.current.setConfiguration(beforeSave); });
  let saving!: Promise<void>;
  act(() => { saving = result.current.save(); });
  await act(async () => { await started.promise; });
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
  await act(async () => { await result.current.save(); });
});
