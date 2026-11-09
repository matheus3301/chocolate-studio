// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { App } from '../src/App.js';
import { initializeLanguage } from '../src/i18n.js';
import { database } from '../src/storage.js';

beforeAll(()=>{
  if (!HTMLDialogElement.prototype.showModal) HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  if (!HTMLDialogElement.prototype.close) HTMLDialogElement.prototype.close=function(){this.open=false;};
});
beforeEach(async()=>{await initializeLanguage('en');await database.open();});
afterEach(async()=>{cleanup();await database.delete();});

it('exposes language directly and leaves the editor and valid local changes intact when switching it',async()=>{
  render(<App/>);
  await waitFor(()=>expect(screen.getByRole('button',{name:'Edit offline',exact:true})).toBeTruthy());
  fireEvent.click(screen.getByRole('button',{name:'Edit offline',exact:true}));
  await waitFor(()=>expect(screen.getByRole('heading',{name:'Chocolate Plus',exact:true})).toBeTruthy());
  fireEvent.click(screen.getByRole('button',{name:/Operating mode: Custom MIDI actions/}));
  fireEvent.change(screen.getByRole('combobox',{name:'Operating mode',exact:true}),{target:{value:'10'}});
  fireEvent.click(screen.getByRole('button',{name:'Use this mode',exact:true}));
  const language=screen.getByRole('combobox',{name:'Language',exact:true});
  fireEvent.change(language,{target:{value:'pt-BR'}});
  await waitFor(()=>expect(screen.getByRole('combobox',{name:'Idioma',exact:true})).toBeTruthy());
  expect(screen.getByRole('heading',{name:'Chocolate Plus',exact:true})).toBeTruthy();
  expect(screen.queryByRole('button',{name:'Conectar Chocolate',exact:true})).toBeNull();
  await waitFor(async()=>expect((await database.preferences.get('locale'))?.value).toBe('pt-BR'));
  expect(screen.queryByLabelText('Nome do pedalboard')).toBeNull();
  expect(screen.getByText('Teclado personalizado',{selector:'strong'})).toBeTruthy();
  await waitFor(async()=>expect((await database.drafts.get('current'))?.configuration.controller?.mode).toBe(10));
});

it('keeps all operating modes selectable without a mandatory setup sequence and never adopts a cancelled mode',async()=>{
  render(<App/>);
  await waitFor(()=>expect(screen.getByRole('button',{name:'Edit offline',exact:true})).toBeTruthy());
  fireEvent.click(screen.getByRole('button',{name:'Edit offline',exact:true}));
  fireEvent.click(screen.getByRole('button',{name:/Operating mode: Custom MIDI actions/}));
  const select=screen.getByRole('combobox',{name:'Operating mode',exact:true});
  expect((select as HTMLSelectElement).options).toHaveLength(13);
  fireEvent.change(select,{target:{value:'10'}});
  fireEvent.click(screen.getByRole('button',{name:'Cancel',exact:true}));
  expect(screen.getByRole('button',{name:/Operating mode: Custom MIDI actions/})).toBeTruthy();
  expect(screen.queryByRole('dialog')).toBeNull();
});
