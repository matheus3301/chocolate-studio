// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { StrictMode } from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { CONFIGURATION_LIMITS, exportConfiguration } from '@chocolate-studio/midi';
import { initialConfiguration, setMessages } from '../src/editor.js';
import { initializeLanguage } from '../src/i18n.js';
import { RECOVERY_DEBOUNCE_MS } from '../src/recovery.js';
import { database } from '../src/storage.js';
import { useStudio } from '../src/useStudio.js';

beforeAll(async () => { await initializeLanguage('en'); });
beforeEach(async () => { await database.open(); });
afterEach(async () => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); await database.delete(); });

it('debounces automatic persistence without blocking fields and keeps an edit made while saving', async () => {
  const { result } = renderHook(() => useStudio());
  await waitFor(() => expect(result.current.loading).toBe(false));
  const initial = result.current.configuration;
  const gate = Promise.withResolvers<void>();
  const started = Promise.withResolvers<void>();
  const save = database.save.bind(database);
  vi.spyOn(database, 'save').mockImplementationOnce(async (...args) => {
    started.resolve(); await gate.promise; return save(...args);
  });
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const first = setMessages(initial, initial.groups[0]!.id, 'A', 'secondary', [{ type: 'cc', channel: 16, controller: 80, value: 127 }]);
  act(() => { result.current.setConfiguration(first); });
  await act(async () => { await vi.advanceTimersByTimeAsync(RECOVERY_DEBOUNCE_MS - 1); });
  expect((await database.drafts.get('current'))?.configuration).toEqual(initial);
  await act(async () => { await vi.advanceTimersByTimeAsync(1); await started.promise; });
  expect(result.current.localSaving).toBe(true);
  expect(result.current.busy).toBe(false);
  const latest = setMessages(first, initial.groups[0]!.id, 'B', 'primary', [{ type: 'pc', channel: 3, program: 99 }]);
  act(() => { expect(result.current.setConfiguration(latest)).toBe(true); });
  await act(async () => { gate.resolve(); });
  await act(async () => { await vi.advanceTimersByTimeAsync(RECOVERY_DEBOUNCE_MS); });
  vi.useRealTimers();
  await waitFor(() => expect(result.current.dirty).toBe(false));
  expect(result.current.configuration).toEqual(latest);
  expect(result.current.hasRecoveryDraft).toBe(true);
  const reloaded = renderHook(() => useStudio());
  await waitFor(() => expect(reloaded.result.current.loading).toBe(false));
  expect(reloaded.result.current.configuration).toEqual(latest);
});

it('flushes a not-yet-debounced valid edit on component unmount', async () => {
  const { result, unmount } = renderHook(() => useStudio());
  await waitFor(() => expect(result.current.loading).toBe(false));
  const change = structuredClone(result.current.configuration);
  change.name = 'Unmounted recovery';
  act(() => { result.current.setConfiguration(change); });
  unmount();
  await waitFor(async () => expect((await database.drafts.get('current'))?.configuration).toEqual(change));
});

it('preserves an edit during initial loading under StrictMode and rejects dangerous replacement input', async () => {
  const gate = Promise.withResolvers<void>();
  const initialize = database.initialize.bind(database);
  vi.spyOn(database, 'initialize').mockImplementation(async (...args) => { await gate.promise; return initialize(...args); });
  const { result } = renderHook(() => useStudio(), { wrapper: StrictMode });
  const change = structuredClone(result.current.configuration);
  change.name = 'Typed before loading finished';
  act(() => { result.current.setConfiguration(change); });
  await act(async () => { gate.resolve(); });
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.configuration).toEqual(change);
  const invalid = structuredClone(change);
  invalid.groups[0]!.switches.A.actions[0]!.messages[0]!.channel = 17;
  await act(async () => { expect(await result.current.adoptRead(invalid)).toBe(false); });
  expect(result.current.configuration).toEqual(change);
  expect(result.current.notice).toBe('invalidDraft');
  await act(async () => { await result.current.save(); });
  expect((await database.drafts.get('current'))?.configuration).toEqual(change);
});

it('invalidates a pending import on adoption and does not parse an oversized file', async () => {
  const { result } = renderHook(() => useStudio());
  await waitFor(() => expect(result.current.loading).toBe(false));
  const pending = Promise.withResolvers<string>();
  let importing!: Promise<void>;
  act(() => { importing = result.current.importProject({ size: 100, text: () => pending.promise } as File); });
  const read = structuredClone(result.current.configuration);
  read.name = 'Read from device';
  await act(async () => { expect(await result.current.adoptRead(read)).toBe(true); });
  await act(async () => { pending.resolve(exportConfiguration(initialConfiguration('en'))); await importing; });
  expect(result.current.incoming).toBeNull();
  expect(result.current.hasRecoveryDraft).toBe(false);
  const text = vi.fn();
  await act(async () => { await result.current.importProject({ size: CONFIGURATION_LIMITS.jsonBytes + 1, text } as unknown as File); });
  expect(text).not.toHaveBeenCalled();
  expect(result.current.notice).toBe('fileTooLarge');
  expect(result.current.configuration).toEqual(read);
});
