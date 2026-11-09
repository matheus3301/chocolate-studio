// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { App } from '../src/App.js';
import { initializeLanguage } from '../src/i18n.js';
import { database } from '../src/storage.js';
import { workbenchConnectionEn as connection } from '../src/workbench-connection-i18n.js';
import { workbenchFixture } from './workbench-fixture.js';

beforeAll(() => {
  if (!HTMLDialogElement.prototype.showModal) HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  if (!HTMLDialogElement.prototype.close) HTMLDialogElement.prototype.close = function () { this.open = false; };
});
beforeEach(async () => {
  await initializeLanguage('en'); await database.open();
  vi.stubGlobal('navigator', { permissions: { query: async () => ({ state: 'prompt' }) } });
});
afterEach(async () => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); await database.delete(); });

it('protects an inactive Advanced edit recovered in PC mode and keeps it after rejecting the device read', async () => {
  const value = workbenchFixture(true, 0);
  const saved = await database.initialize(value.configuration);
  const local = structuredClone(value.configuration);
  local.groups[0]!.switches.A.actions = [{ gesture: 'press', messages: [{ type: 'pc', channel: 1, program: 42 }] }];
  const recovered = { ...saved, revision: saved.revision + 1, configuration: local, recoveryBaseline: value.configuration };
  await database.drafts.put(recovered);
  const replace = vi.spyOn(database, 'replace'); const write = vi.spyOn(value.service, 'write');
  render(<App hardware={value.service} />);
  await screen.findByRole('button', { name: 'Keep my edit' });
  expect(replace).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Keep my edit' }));
  await screen.findByRole('heading', { name: 'Chocolate Plus' });
  expect((await database.drafts.get('current'))!.configuration.groups[0]!.switches.A.actions).toEqual(local.groups[0]!.switches.A.actions);
  // Remounting Connection must not reinterpret the previously rejected cached read as new.
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Connected by USB' })); });
  expect(screen.getByRole('dialog', { name: 'Connection' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Keep my edit' })).toBeNull();
  expect(replace).not.toHaveBeenCalled(); expect(write).not.toHaveBeenCalled();
});

it('keeps cached-read connection tools open, but processes an explicitly requested fresh read', async () => {
  const value = workbenchFixture(true, 0);
  await database.initialize(value.configuration);
  const replace = vi.spyOn(database, 'replace'); const read = vi.spyOn(value.service, 'read'); const write = vi.spyOn(value.service, 'write');
  render(<App hardware={value.service} />);
  await screen.findByRole('button', { name: 'Connected by USB' });
  expect(replace).toHaveBeenCalledTimes(1); replace.mockClear();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Connected by USB' })); });
  const dialog = screen.getByRole('dialog', { name: 'Connection' });
  expect(replace).not.toHaveBeenCalled(); expect(read).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByText(connection.help));
  fireEvent.click(within(dialog).getByRole('button', { name: connection.readAgain }));
  await waitFor(() => expect(replace).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(read).toHaveBeenCalledTimes(1); expect(write).not.toHaveBeenCalled();
});

it('adopts a conflicting read only on explicit choice and keeps the inactive local edit in a recovery copy', async () => {
  const value = workbenchFixture(true, 0);
  const saved = await database.initialize(value.configuration);
  const local = structuredClone(value.configuration);
  local.groups[0]!.switches.A.actions = [{ gesture: 'press', messages: [{ type: 'pc', channel: 1, program: 42 }] }];
  const recovered = { ...saved, revision: saved.revision + 1, configuration: local, recoveryBaseline: value.configuration };
  await database.drafts.put(recovered);
  const replace = vi.spyOn(database, 'replace'); const write = vi.spyOn(value.service, 'write');
  render(<App hardware={value.service} />);
  const useRead = await screen.findByRole('button', { name: 'Open the Chocolate configuration' });
  expect(replace).not.toHaveBeenCalled();
  fireEvent.click(useRead);
  await screen.findByRole('heading', { name: 'Chocolate Plus' });
  expect(replace).toHaveBeenCalledTimes(1);
  expect((await database.drafts.get('current'))!.configuration.groups[0]!.switches.A.actions).toEqual([]);
  const copies = await database.backups.toArray();
  expect(copies.some(copy => copy.configuration.groups[0]!.switches.A.actions[0]?.messages[0]?.type === 'pc' &&
    copy.configuration.groups[0]!.switches.A.actions[0]?.messages[0]?.program === 42)).toBe(true);
  expect(write).not.toHaveBeenCalled();
});
