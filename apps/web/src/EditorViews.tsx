import { Fragment, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CONFIGURATION_LIMITS, SWITCH_IDS } from '@chocolate-studio/midi';
import type { MidiMessage, Preset, StudioConfiguration, SwitchBehavior, SwitchId } from '@chocolate-studio/midi';
import { applyPreset, destinationIsUsed, editGroup, setMessages } from './editor.js';
import type { Sequence } from './editor.js';
import { Empty, Icon, MessageFields, NameField, NumberField } from './components.js';
import { destinationHasBindings } from './guided-actions.js';

interface EditorProps {
  configuration: StudioConfiguration;
  onChange: (configuration: StudioConfiguration) => boolean;
  groupId: string;
  onGroup: (id: string) => void;
  switchId: SwitchId;
  onSwitch: (id: SwitchId) => void;
  sequence: Sequence;
  onSequence: (sequence: Sequence) => void;
  confirm: (title: string, label: string, action: () => void) => void;
  inspectorOnly?: boolean;
}

export function Pedalboard(props: EditorProps) {
  const { configuration, onChange, groupId, onGroup, switchId, onSwitch, sequence, onSequence, confirm } = props;
  const { t } = useTranslation();
  const controllerId = useId();
  const group = configuration.groups.find((entry) => entry.id === groupId) ?? configuration.groups[0]!;
  const pedal = group.switches[switchId];
  const messages = sequence === 'secondary' ? pedal.secondaryMessages ?? [] : sequence === 'primary' ? pedal.actions[0]?.messages ?? [] : pedal.actions.find((action) => action.gesture === sequence)?.messages ?? [];
  function updateMessages(next: MidiMessage[]) {
    const updated = setMessages(configuration, group.id, switchId, sequence, next);
    if (!onChange(updated)) return;
    if (!next.length && sequence !== 'primary' && sequence !== 'secondary') onSequence('primary');
  }
  function addMessage(type: 'pc' | 'cc') {
    const destination = configuration.destinations[0];
    const base = { channel: destination?.channel ?? 1, ...(destination ? { destinationId: destination.id } : {}) };
    updateMessages([...messages, type === 'pc' ? { ...base, type, program: 0 } : { ...base, type, controller: 0, value: 0 }]);
  }
  function addGroup(duplicate: boolean) {
    const next = structuredClone(configuration);
    const added = structuredClone(duplicate ? group : configuration.groups[0]!);
    added.id = crypto.randomUUID();
    added.name = `${t('newGroup')} ${configuration.groups.length + 1}`;
    if (!duplicate) for (const key of SWITCH_IDS) added.switches[key] = { label: key, actions: [], behavior: 'single', secondaryMessages: [] };
    next.groups.push(added);
    if (!onChange(next)) return;
    onGroup(added.id);
    onSequence('primary');
  }
  return <>
    {!props.inspectorOnly && <>
    <header className="page-heading"><div><p className="eyebrow">{t('workspace')}</p><h1>{t('subtitle')}</h1><p>{t('boardHint')}</p></div><span className="outline-tag">{t('draft')}</span></header>
    <section className="panel board-panel" aria-label={t('board')}>
      <div className="section-heading group-heading"><div className="group-selector" role="group" aria-label={t('group')}>{configuration.groups.map((entry, index) => <button key={entry.id} className={entry.id === group.id ? 'group-button active' : 'group-button'} aria-pressed={entry.id === group.id} onClick={() => { onGroup(entry.id); onSequence('primary'); }}><span>{String(index + 1).padStart(2, '0')}</span>{entry.name}</button>)}</div>
        <button className="icon-button" disabled={configuration.groups.length >= CONFIGURATION_LIMITS.groups} title={t('addGroup')} aria-label={t('addGroup')} onClick={() => addGroup(false)}><Icon name="plus" /></button></div>
      <div className="controller-chassis">
        <span className="controller-wordmark" aria-hidden="true">CHOCOLATE PLUS</span>
        <div className="controller-deck" role="group" aria-label={t('controllerDiagram')} aria-describedby={`${controllerId}-pairs`}>
          <span className="controller-pair pair-e" aria-hidden="true"><span>E</span></span>
          <span className="controller-pair pair-f" aria-hidden="true"><span>F</span></span>
          {SWITCH_IDS.map((id) => <Fragment key={id}>
            {/* The central display represents editor selection, never physical device state. */}
            {id === 'C' && <div className="controller-display" role="status" aria-label={t('editingSwitch', { switch: switchId })}>
              <span>{t('editing')}</span><strong>{switchId}</strong>
            </div>}
            <button className={`controller-switch controller-switch-${id}`} aria-pressed={switchId === id}
              aria-label={t('editSwitch', { switch: id, label: group.switches[id].label || id })}
              aria-describedby={`${controllerId}-assignment-${id}`}
              onClick={() => { onSwitch(id); onSequence('primary'); }}>
              <span className="controller-metal" aria-hidden="true"><span /></span>
              <span className="controller-letter" aria-hidden="true">{id}</span>
            </button>
          </Fragment>)}
        </div>
      </div>
      <div className="controller-pair-help" id={`${controllerId}-pairs`}>
        <span>{t('pairPress', { pair: 'E', left: 'A', right: 'B' })}</span>
        <span>{t('pairPress', { pair: 'F', left: 'C', right: 'D' })}</span>
      </div>
      <dl className="controller-assignments" aria-label={t('switchAssignments')}>
        {SWITCH_IDS.map((id) => {
          const entry = group.switches[id];
          const first = entry.actions[0]?.messages[0];
          return <div className="controller-assignment" data-selected={switchId === id} id={`${controllerId}-assignment-${id}`} key={id}>
            <dt><span className="assignment-letter">{id}</span><span>{entry.label || `${t('switch')} ${id}`}</span></dt>
            <dd className="assignment-message">{first
              ? `${first.type.toUpperCase()} ${first.type === 'pc' ? first.program : `${first.controller} → ${first.value}`} · ${t('channel')} ${first.channel}`
              : t('noAssignment')}</dd>
            <dd>{t('bankMessageCount', { bank: t('primary'), count: entry.actions[0]?.messages.length ?? 0 })}</dd>
            <dd>{t('bankMessageCount', { bank: t('secondary'), count: entry.secondaryMessages?.length ?? 0 })}</dd>
          </div>;
        })}
      </dl>
      <p className="panel-footnote">{t('groupHint')}</p>
    </section>
    </>}
    <section className="panel inspector">
      <header className="section-heading"><div><p className="eyebrow">{group.name}</p><h2>{t('switch')} {switchId} <span className="muted">/ {pedal.label}</span></h2></div><span className="small-tag">{t('draft')}</span></header>
      <div className="inspector-meta"><NameField label={t('label')} max={64} value={pedal.label} onChange={(label) => onChange(editGroup(configuration, group.id, (next) => { next.switches[switchId].label = label; }))} />
        <label className="field"><span>{t('behavior')}</span><select value={pedal.behavior ?? 'single'} onChange={(event) => onChange(editGroup(configuration, group.id, (next) => { next.switches[switchId].behavior = event.target.value as SwitchBehavior; }))}>{(['single', 'alternate', 'momentary', 'long', 'shortLong'] as const).map((behavior) => <option key={behavior} value={behavior}>{t(behavior)}</option>)}</select></label>
      </div>
      <div className="sequence-toolbar"><div className="segmented" role="group" aria-label={t('sequence')}>{(['primary', 'secondary'] as const).map((bank) => <button className={sequence === bank ? 'active' : ''} aria-pressed={sequence === bank} key={bank} onClick={() => onSequence(bank)}>{t(bank)}</button>)}</div>
        {pedal.actions.length > 1 && <label className="field extra-gesture"><span>{t('additionalGesture')}</span><select value={sequence === 'primary' || sequence === 'secondary' ? '' : sequence} onChange={(event) => onSequence(event.target.value as Sequence)}><option value="" disabled>—</option>{pedal.actions.slice(1).map((action) => <option value={action.gesture} key={action.gesture}>{t(action.gesture)}</option>)}</select></label>}
      </div><p className="helper">{t('sequenceHint')}</p>
      <div className="messages">{!messages.length && <p className="inline-empty">{t('noMessages')}</p>}{messages.map((message, index) => <article className="message-card" key={`${group.id}-${switchId}-${sequence}-${index}-${message.type}`}>
        <header><span className="message-number">{String(index + 1).padStart(2, '0')}</span><h3>{t(message.type)}</h3><div className="message-actions">
          <button className="text-button" disabled={index === 0} aria-label={`${t('up')} ${index + 1}`} onClick={() => { const next = [...messages]; [next[index - 1], next[index]] = [next[index]!, next[index - 1]!]; updateMessages(next); }}>↑</button>
          <button className="text-button" disabled={index === messages.length - 1} aria-label={`${t('down')} ${index + 1}`} onClick={() => { const next = [...messages]; [next[index], next[index + 1]] = [next[index + 1]!, next[index]!]; updateMessages(next); }}>↓</button>
          <button className="text-button" disabled={sequence === 'primary' && messages.length === 1 && pedal.actions.length > 1} title={sequence === 'primary' && messages.length === 1 && pedal.actions.length > 1 ? t('removePrimaryHint') : t('remove')} onClick={() => updateMessages(messages.filter((_, i) => i !== index))}>{t('remove')}</button></div></header>
        <MessageFields message={message} destinations={configuration.destinations} onChange={(next) => updateMessages(messages.map((entry, i) => i === index ? next : entry))} />
        {message.type === 'pc' && <button className="text-button save-preset" disabled={configuration.presets.length >= CONFIGURATION_LIMITS.presets} onClick={() => { const { type: _, ...reference } = message; onChange({ ...configuration, presets: [...configuration.presets, { ...structuredClone(reference), id: crypto.randomUUID(), name: pedal.label || t('newPreset') }] }); }}>{t('savePreset')}</button>}
      </article>)}</div>
      <div className="button-row"><button className="secondary" disabled={messages.length >= CONFIGURATION_LIMITS.messagesPerAction} onClick={() => addMessage('pc')}><Icon name="plus" />{t('addPc')}</button><button className="secondary" disabled={messages.length >= CONFIGURATION_LIMITS.messagesPerAction} onClick={() => addMessage('cc')}><Icon name="plus" />{t('addCc')}</button></div>
      <p className="helper">{t('zeroBased')} {t('gesturesHint')}</p>
      <details className="group-settings"><summary>{t('groupName')}</summary><NameField label={t('groupName')} value={group.name} onChange={(name) => onChange(editGroup(configuration, group.id, (next) => { next.name = name; }))} /><div className="button-row"><button className="text-button" disabled={configuration.groups.length >= CONFIGURATION_LIMITS.groups} onClick={() => addGroup(true)}>{t('duplicateGroup')}</button><button className="text-button danger" disabled={configuration.groups.length <= 1} onClick={() => confirm(t('confirmRemoveGroup'), t('removeGroup'), () => { onChange({ ...configuration, groups: configuration.groups.filter((entry) => entry.id !== group.id) }); onGroup(configuration.groups.find((entry) => entry.id !== group.id)!.id); onSequence('primary'); })}>{t('removeGroup')}</button></div></details>
    </section>
  </>;
}

export function Presets({ configuration, onChange, groupId, switchId, sequence, confirm }: EditorProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const selected = configuration.groups.find((entry) => entry.id === groupId) ?? configuration.groups[0]!;
  const filtered = configuration.presets.filter((preset) => preset.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  function updatePreset(id: string, change: Partial<Preset>) { onChange({ ...configuration, presets: configuration.presets.map((preset) => preset.id === id ? { ...preset, ...change } : preset) }); }
  return <><header className="page-heading"><div><p className="eyebrow">{t('workspace')}</p><h1>{t('presets')}</h1><p>{t('presetHint')}</p></div><button className="primary" disabled={configuration.presets.length >= CONFIGURATION_LIMITS.presets} onClick={() => { const destination = configuration.destinations[0]; onChange({ ...configuration, presets: [...configuration.presets, { id: crypto.randomUUID(), name: t('newPreset'), channel: destination?.channel ?? 1, program: 0, ...(destination ? { destinationId: destination.id } : {}) }] }); }}><Icon name="plus" />{t('addPreset')}</button></header>
    <p className="assignment-note">{t('presetTarget', { bank: selected.name, pedal: switchId, gesture: t(sequence) })}</p>
    {configuration.presets.length > 0 && <label className="field search"><span>{t('presetName')}</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} /></label>}
    {!configuration.presets.length && <Empty title={t('noPresets')} detail={t('noPresetsHint')} />}
    <div className="library-grid">{filtered.map((preset) => <article className="panel preset-card" key={preset.id}><span className="eyebrow">PC {String(preset.program).padStart(3, '0')}</span><NameField label={t('presetName')} value={preset.name} onChange={(name) => updatePreset(preset.id, { name })} />
      <MessageFields message={{ ...preset, type: 'pc' }} destinations={configuration.destinations} onChange={(message) => { if (message.type !== 'pc') return; const { type: _, ...reference } = message; const next: Preset = { ...reference, id: preset.id, name: preset.name }; onChange({ ...configuration, presets: configuration.presets.map((entry) => entry.id === preset.id ? next : entry) }); }} />
      <div className="button-row"><button className="secondary" onClick={() => confirm(t('confirmPreset'), t('usePreset'), () => onChange(applyPreset(configuration, selected.id, switchId, sequence, preset)))}>{t('usePreset')}<Icon name="arrow" /></button><button className="text-button danger" onClick={() => onChange({ ...configuration, presets: configuration.presets.filter((entry) => entry.id !== preset.id) })}>{t('remove')}</button></div>
    </article>)}</div></>;
}

export function Destinations({ configuration, onChange }: Pick<EditorProps, 'configuration' | 'onChange'>) {
  const { t } = useTranslation();
  return <><header className="page-heading"><div><p className="eyebrow">MIDI</p><h1>{t('destinations')}</h1><p>{t('destinationHint')}</p></div><button className="primary" disabled={configuration.destinations.length >= CONFIGURATION_LIMITS.destinations} onClick={() => onChange({ ...configuration, destinations: [...configuration.destinations, { id: crypto.randomUUID(), name: t('newDestination'), channel: 1 }] })}><Icon name="plus" />{t('addDestination')}</button></header>
    {!configuration.destinations.length && <Empty title={t('destinations')} detail={t('noDestinations')} />}
    <div className="destination-list">{configuration.destinations.map((destination, index) => {
      const bound = destinationHasBindings(configuration, destination.id);
      const used = destinationIsUsed(configuration, destination.id) || bound;
      return <article className="panel destination-card" key={destination.id}>
        <span className="destination-index">{String(index + 1).padStart(2, '0')}</span>
        <div><NameField label={t('destinationName')} value={destination.name} onChange={(name) => onChange({ ...configuration, destinations: configuration.destinations.map((entry) => entry.id === destination.id ? { ...entry, name } : entry) })} /><p className="helper">{bound ? t('guided.boundChannelHint') : used ? t('destinationUsed') : t('defaultHint')}</p></div>
        <fieldset className="guided-fields" disabled={bound}><NumberField label={t('defaultChannel')} min={1} max={16} value={destination.channel} onChange={(channel) => onChange({ ...configuration, destinations: configuration.destinations.map((entry) => entry.id === destination.id ? { ...entry, channel } : entry) })} /></fieldset>
        <button className="text-button danger" disabled={used} title={used ? t('destinationUsed') : t('remove')} onClick={() => onChange({ ...configuration, destinations: configuration.destinations.filter((entry) => entry.id !== destination.id) })}>{t('remove')}</button>
      </article>;
    })}</div>
  </>;
}
