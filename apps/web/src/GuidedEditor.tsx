import { Fragment, useCallback, useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { CONFIGURATION_LIMITS, SWITCH_IDS, applyEquipmentAction, compileEquipmentAction, effectiveControllerMode, equipmentProfiles, getControllerMode, localizeEquipmentText } from '@chocolate-studio/midi';
import type { EquipmentActionParameters, EquipmentProfile, EquipmentSequence, MidiMessage, StudioConfiguration, SwitchBehavior, SwitchId } from '@chocolate-studio/midi';
import { NameField } from './components.js';
import { editGroup, setMessages, validConfiguration } from './editor.js';
import type { Sequence } from './editor.js';
import { boundEquipmentAction, destinationProfile, sameMidiCommands, sequenceMessages } from './guided-actions.js';
import { gestureKeys, useWorkbenchTranslation } from './workbench-editor-i18n.js';

export interface GuidedEditorProps {
  configuration: StudioConfiguration;
  onChange: (next: StudioConfiguration) => boolean | void;
  groupId: string;
  onGroup: (id: string) => void;
  switchId: SwitchId;
  onSwitch: (id: SwitchId) => void;
  confirm: (title: string, label: string, action: () => void) => void;
  destinationId?: string;
  disabled?: boolean;
  profiles?: readonly EquipmentProfile[];
  /** True while any retained form contains incomplete or rejected edits. Gate saving in the parent. */
  onPendingChange?: (pending: boolean) => void;
  sequence?: Sequence;
  onSequence?: (sequence: Sequence) => void;
  switchOptions?: ReactNode;
  children?: ReactNode;
  externalPending?: boolean;
  midiEditable?: boolean;
  assignmentSummaries?: Partial<Record<SwitchId, string>>;
  /** Contextual tools are parent-owned dialogs, not document/File commands. */
  onManageDestinations?: () => void;
  onManagePresets?: () => void;
}

interface ActionDraft {
  targetId: string;
  actionId: string;
  parameters: Record<string, string>;
  invalidFields: Record<string, string>;
  manual: boolean;
  pending: boolean;
  error: string;
  equipment?: { choice: string; name: string; channel: string; error: string } | undefined;
}

type ActionProps = Pick<GuidedEditorProps, 'configuration' | 'onChange' | 'switchId' | 'confirm' | 'destinationId' | 'onManageDestinations' | 'onManagePresets'> & {
  groupId: string;
  sequence: Sequence;
  title: string;
  profiles: readonly EquipmentProfile[];
  drafts: Map<string, ActionDraft>;
  owner: string;
  reportPending: (owner: string, pending: boolean) => void;
};

/** Invalid text stays visible on blur. Unlike NumberField, it is never silently reset. */
function NumericInput({ label, text, min = 0, max = 127, onChange }: { label: string; text: string; min?: number; max?: number; onChange: (text: string) => void }) {
  const { wt } = useWorkbenchTranslation();
  const id = useId();
  const valid = text !== '' && Number.isInteger(Number(text)) && Number(text) >= min && Number(text) <= max;
  return <label className="field numeric workbench-field"><span>{label}</span><input style={{ minHeight: 44 }} type="number" inputMode="numeric" min={min} max={max} step={1} required value={text} aria-invalid={!valid} aria-describedby={!valid ? id : undefined} onChange={event => onChange(event.currentTarget.value)} />
    {!valid && <span className="field-error warning-text" id={id}>{wt('numberError', { min, max })}</span>}
  </label>;
}

function RetainedNameField({ label, value, max, allowEmpty = false, owner, drafts, reportPending, onChange }: {
  label: string; value: string; max: number; allowEmpty?: boolean; owner: string;
  drafts: Map<string, string>; reportPending: (owner: string, pending: boolean) => void;
  onChange: (value: string) => boolean | void;
}) {
  const { wt } = useWorkbenchTranslation();
  const id = useId();
  const [text, setText] = useState(() => drafts.get(owner) ?? value);
  const [error, setError] = useState(drafts.has(owner));
  useEffect(() => { if (!drafts.has(owner)) setText(value); }, [value, owner, drafts]);
  return <label className="field workbench-field"><span id={`${id}-label`}>{label}</span><input style={{ minHeight: 44 }} value={text} maxLength={max} required={!allowEmpty} aria-invalid={error} aria-labelledby={`${id}-label`} aria-describedby={error ? `${id}-error` : undefined} onChange={event => {
    const next = event.currentTarget.value;
    setText(next);
    let accepted = false;
    try { accepted = (allowEmpty || !!next.trim()) && onChange(next) !== false; } catch { /* Keep rejected text visible. */ }
    if (accepted) drafts.delete(owner); else drafts.set(owner, next);
    setError(!accepted);
    reportPending(owner, !accepted);
  }} />{error && <span className="field-error warning-text" id={`${id}-error`}>{wt('rejected')}</span>}</label>;
}

function ActionEditor({ configuration, onChange, groupId, switchId, confirm, destinationId, sequence, title, profiles, drafts, owner, reportPending, onManageDestinations, onManagePresets }: ActionProps) {
  const { t, i18n } = useTranslation();
  const { wt } = useWorkbenchTranslation();
  const locale = i18n.resolvedLanguage === 'en' ? 'en' : 'pt-BR';
  const pedal = configuration.groups.find(group => group.id === groupId)!.switches[switchId];
  const musicalSequence = sequence === 'primary' || sequence === 'secondary' ? sequence : undefined;
  const bound = musicalSequence ? boundEquipmentAction(configuration, pedal, musicalSequence, profiles) : undefined;
  const target = bound?.destination.id ?? destinationId ?? configuration.destinations[0]?.id ?? '';
  const initial: ActionDraft = { targetId: target, actionId: bound?.action.id ?? '', parameters: Object.fromEntries(Object.entries(bound?.binding.parameters ?? {}).map(([id, value]) => [id, String(value)])), invalidFields: {}, manual: !musicalSequence || !destinationProfile(configuration.destinations.find(entry => entry.id === target), profiles), pending: false, error: '' };
  const [draft, setDraft] = useState(() => {
    const cached = drafts.get(owner);
    if (cached?.pending || cached?.equipment) return cached;
    return { ...initial, targetId: bound?.destination.id ?? cached?.targetId ?? target, manual: cached?.manual ?? initial.manual };
  });
  const adding = draft.equipment !== undefined;
  const equipmentChoice = draft.equipment?.choice ?? '';
  const equipmentName = draft.equipment?.name ?? '';
  const equipmentChannel = draft.equipment?.channel ?? '1';
  const equipmentError = draft.equipment?.error ?? '';
  const latest = useRef(configuration);
  latest.current = configuration;
  const mounted = useRef(true);
  const revision = useRef(0);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const destination = configuration.destinations.find(entry => entry.id === draft.targetId);
  const profile = destinationProfile(destination, profiles);
  const action = profile?.actions.find(entry => entry.id === draft.actionId);
  const messages = musicalSequence ? sequenceMessages(pedal, musicalSequence) : pedal.actions.find(entry => entry.gesture === sequence)?.messages ?? [];
  const assignment = JSON.stringify([pedal.actionBindings, messages]);
  const previousAssignment = useRef(assignment);
  useEffect(() => {
    if (previousAssignment.current === assignment) return;
    previousAssignment.current = assignment;
    // Reflect explicit external preset/manual edits, but never discard incomplete fields.
    if (draft.pending || draft.equipment) return;
    const next = { ...initial, targetId: bound?.destination.id ?? draft.targetId, manual: draft.manual };
    drafts.set(owner, next);
    setDraft(next);
  }, [assignment]);
  function update(next: ActionDraft) {
    revision.current += 1;
    drafts.set(owner, next);
    setDraft(next);
    reportPending(owner, next.pending || next.equipment !== undefined);
  }
  function discard() {
    revision.current += 1;
    drafts.delete(owner);
    setDraft(initial);
    reportPending(owner, false);
  }
  function replaceForm(change: () => void) {
    if (draft.pending || adding) confirm(t('guided.discardPending'), wt('discard'), change);
    else change();
  }
  function updateEquipment(patch: Partial<NonNullable<ActionDraft['equipment']>>) {
    update({ ...draft, equipment: { choice: equipmentChoice, name: equipmentName, channel: equipmentChannel, error: '', ...patch } });
  }
  function commitAction(nextDraft: ActionDraft) {
    update({ ...nextDraft, pending: true, error: '' });
    const reviewedRevision = revision.current;
    const selectedDestination = configuration.destinations.find(entry => entry.id === nextDraft.targetId);
    const selectedProfile = destinationProfile(selectedDestination, profiles);
    const selectedAction = selectedProfile?.actions.find(entry => entry.id === nextDraft.actionId);
    if (!selectedDestination || !selectedProfile || !selectedAction || !musicalSequence) return;
    const parameters: EquipmentActionParameters = {};
    for (const [id, parameter] of Object.entries(selectedAction.parameters)) {
      const text = nextDraft.parameters[id] ?? '';
      const value = Number(text);
      if (!text || !Number.isInteger(value) || value < parameter.minimum || value > parameter.maximum) return;
      parameters[id] = value;
    }
    let preview: MidiMessage[];
    try { preview = compileEquipmentAction(selectedProfile, selectedAction.id, parameters, selectedDestination); }
    catch { update({ ...nextDraft, pending: true, error: 'rejected' }); return; }
    const commit = () => {
      if (!mounted.current) return;
      if (revision.current !== reviewedRevision) return;
      if (latest.current !== configuration) { update({ ...nextDraft, pending: true, error: 'reviewExpired' }); return; }
      try {
        // Keep behavior, extra gestures and the opposite sequence. A catalog selection is not a mode conversion.
        const next = applyEquipmentAction(configuration, groupId, switchId, musicalSequence, { modelId: selectedProfile.modelId, profileVersion: selectedProfile.profileVersion, actionId: selectedAction.id, parameters, destinationId: selectedDestination.id }, { profiles });
        if (onChange(next) === false) { update({ ...nextDraft, pending: true, error: 'rejected' }); return; }
        update({ ...nextDraft, pending: false, error: '', invalidFields: {} });
      } catch { update({ ...nextDraft, pending: true, error: 'rejected' }); }
    };
    if (!bound && messages.length && !sameMidiCommands(messages, preview)) confirm(wt('replacement'), wt('replace'), commit);
    else commit();
  }
  function changeMessages(next: MidiMessage[], nextDraft = draft) {
    try {
      if (onChange(setMessages(configuration, groupId, switchId, sequence, next)) === false) { update({ ...nextDraft, pending: true, error: 'rejected' }); return; }
      update({ ...nextDraft, actionId: '', parameters: {}, pending: Object.keys(nextDraft.invalidFields).length > 0, error: '' });
    } catch { update({ ...nextDraft, pending: true, error: 'rejected' }); }
  }
  function numberField(label: string, field: string, value: number, change: (value: number) => MidiMessage[], min = 0, max = 127) {
    return <NumericInput label={label} text={draft.invalidFields[field] ?? String(value)} min={min} max={max} onChange={text => {
      const invalidFields = { ...draft.invalidFields, [field]: text };
      const next = { ...draft, invalidFields, pending: true, error: '' };
      const number = Number(text);
      if (!text || !Number.isInteger(number) || number < min || number > max) { update(next); return; }
      delete invalidFields[field];
      changeMessages(change(number), next);
    }} />;
  }
  function addEquipment() {
    const selected = profiles.find(entry => `${entry.modelId}@${entry.profileVersion}` === equipmentChoice);
    const channel = Number(equipmentChannel);
    if (!equipmentName.trim()) { updateEquipment({ error: 'nameRequired' }); return; }
    if (!equipmentChoice || equipmentChoice !== 'manual' && !selected) { updateEquipment({ error: 'chooseEquipment' }); return; }
    if (!equipmentChannel || !Number.isInteger(channel) || channel < 1 || channel > 16) return;
    const added = { id: crypto.randomUUID(), name: equipmentName.trim(), channel, ...(selected ? { profile: { modelId: selected.modelId, profileVersion: selected.profileVersion } } : {}) };
    try {
      const next = validConfiguration({ ...configuration, ...(selected ? { formatVersion: 2 as const } : {}), destinations: [...configuration.destinations, added] });
      if (onChange(next) === false) { updateEquipment({ error: 'rejected' }); return; }
      update({ ...draft, targetId: added.id, actionId: '', parameters: {}, invalidFields: {}, manual: !selected, pending: false, error: '', equipment: undefined });
    } catch { updateEquipment({ error: 'rejected' }); }
  }
  return <div className="guided-action workbench-action" role="form" aria-label={title}>
    <div className="workbench-destination">
      <label className="field"><span>{t('guided.device')}</span><select style={{ minHeight: 44 }} value={draft.targetId} onChange={event => {
        const id = event.target.value;
        const selectedProfile = destinationProfile(configuration.destinations.find(entry => entry.id === id), profiles);
        replaceForm(() => update({ ...initial, targetId: id, actionId: '', parameters: {}, manual: !selectedProfile, pending: false }));
      }}><option value="">{t('guided.chooseEquipment')}</option>{configuration.destinations.map(entry => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
      <div className="workbench-context-tools button-row">
        <button className="text-button" type="button" disabled={configuration.destinations.length >= CONFIGURATION_LIMITS.destinations} onClick={() => replaceForm(() => updateEquipment({}))}>{wt('addEquipment')}</button>
      </div>
      {destination && <p className="workbench-channel">{wt('channel')} {destination.channel}</p>}
    </div>
    {adding && <div className="workbench-add-equipment">
      <label className="field"><span>{wt('profile')}</span><select style={{ minHeight: 44 }} value={equipmentChoice} onChange={event => {
        const choice = event.target.value;
        const selected = profiles.find(entry => `${entry.modelId}@${entry.profileVersion}` === choice);
        updateEquipment({ choice, name: equipmentName || (selected ? localizeEquipmentText(selected.label, locale) : t('newDestination')) });
      }}><option value="">{t('guided.chooseEquipment')}</option>{profiles.map(entry => <option key={`${entry.modelId}@${entry.profileVersion}`} value={`${entry.modelId}@${entry.profileVersion}`}>{localizeEquipmentText(entry.label, locale)}</option>)}<option value="manual">{wt('manualMidi')}</option></select></label>
      <NameField label={wt('name')} value={equipmentName} max={CONFIGURATION_LIMITS.nameLength} onChange={name => updateEquipment({ name })} />
      <NumericInput label={wt('channel')} text={equipmentChannel} min={1} max={16} onChange={channel => updateEquipment({ channel })} />
      <p className="helper">{wt('channelHint')}</p>
      {equipmentError && <p role="alert" className="warning-text">{equipmentError === 'chooseEquipment' ? t('guided.chooseEquipment') : wt(equipmentError === 'nameRequired' ? 'nameRequired' : 'rejected')}</p>}
      <div className="button-row"><button type="button" className="secondary" onClick={addEquipment}>{wt('add')}</button><button type="button" className="text-button" onClick={() => update({ ...draft, equipment: undefined })}>{wt('cancel')}</button></div>
    </div>}
    {profile && musicalSequence && <div className="segmented workbench-action-kind" role="group" aria-label={wt('actionFormat')}>
      <button type="button" aria-pressed={!draft.manual} onClick={() => replaceForm(() => update({ ...initial, targetId: draft.targetId, manual: false }))}>{wt('equipmentActions')}</button>
      <button type="button" aria-pressed={draft.manual} onClick={() => replaceForm(() => update({ ...initial, targetId: draft.targetId, manual: true }))}>{wt('manualMidi')}</button>
    </div>}
    {!draft.manual && profile && musicalSequence ? <>
      {!!messages.length && !bound && <p className="helper">{t('guided.rawPreserved', { count: messages.length })}</p>}
      <label className="field"><span>{t('guided.action')}</span><select style={{ minHeight: 44 }} value={draft.actionId} onChange={event => {
        const selected = profile.actions.find(entry => entry.id === event.target.value);
        replaceForm(() => commitAction({ ...initial, targetId: draft.targetId, manual: false, actionId: selected?.id ?? '', parameters: Object.fromEntries(Object.entries(selected?.parameters ?? {}).map(([id, parameter]) => [id, String(parameter.initial)])) }));
      }}><option value="">{wt('chooseAction')}</option>{profile.actions.map(entry => <option value={entry.id} key={entry.id}>{localizeEquipmentText(entry.label, locale)}</option>)}</select></label>
      {action && <p className="helper">{localizeEquipmentText(action.description, locale)}</p>}
      {action && Object.entries(action.parameters).map(([id, parameter]) => <NumericInput key={`${action.id}:${id}`} label={localizeEquipmentText(parameter.label, locale)} text={draft.parameters[id] ?? ''} min={parameter.minimum} max={parameter.maximum} onChange={text => commitAction({ ...draft, parameters: { ...draft.parameters, [id]: text } })} />)}
      {!action && <p className="helper">{wt('equipmentHint')}</p>}
      {bound && <details className="guided-midi"><summary>{t('guided.midiDetails')}</summary><ol>{messages.map((message, index) => <li key={index}><code>{message.type === 'pc' ? `PC ${message.program}` : `CC ${message.controller} = ${message.value}`}</code> · {t('channel')} {message.channel}</li>)}</ol><p className="helper">{t('guided.expectedNotObserved')}</p></details>}
    </> : <div className="workbench-manual messages">
      {!messages.length && <p className="inline-empty">{t('noMessages')}</p>}
      {messages.map((message, index) => {
        const replace = (next: MidiMessage) => messages.map((entry, i) => i === index ? next : entry);
        return <article className="message-card" key={`${index}:${message.type}`}>
          <header><h3>{t(message.type)} · {index + 1}</h3><div className="message-actions">
            <button className="text-button" type="button" disabled={index === 0 || Object.keys(draft.invalidFields).length > 0} aria-label={`${t('up')} ${index + 1}`} onClick={() => { const next = [...messages]; [next[index - 1], next[index]] = [next[index]!, next[index - 1]!]; changeMessages(next); }}>↑</button>
            <button className="text-button" type="button" disabled={index === messages.length - 1 || Object.keys(draft.invalidFields).length > 0} aria-label={`${t('down')} ${index + 1}`} onClick={() => { const next = [...messages]; [next[index], next[index + 1]] = [next[index + 1]!, next[index]!]; changeMessages(next); }}>↓</button>
            <button className="text-button" type="button" disabled={Object.keys(draft.invalidFields).length > 0 || sequence === 'primary' && messages.length === 1 && pedal.actions.length > 1} onClick={() => changeMessages(messages.filter((_, i) => i !== index))}>{t('remove')}</button>
          </div></header>
          <div className="message-fields">
            <label className="field"><span>{t('destination')}</span><select value={message.destinationId ?? ''} onChange={event => { const next = { ...message }; const selected = configuration.destinations.find(entry => entry.id === event.target.value); if (selected) { next.destinationId = selected.id; next.channel = selected.channel; } else delete next.destinationId; changeMessages(replace(next)); }}><option value="">{t('unassigned')}</option>{configuration.destinations.map(entry => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
            {numberField(t('channel'), `${index}:channel`, message.channel, channel => replace({ ...message, channel }), 1, 16)}
            {message.type === 'pc' ? numberField(t('program'), `${index}:program`, message.program, program => replace({ ...message, program })) : <>{numberField(t('controller'), `${index}:controller`, message.controller, controller => replace({ ...message, controller }))}{numberField(t('value'), `${index}:value`, message.value, value => replace({ ...message, value }))}</>}
          </div>
          {message.type === 'cc' && message.controller >= 120 && <p className="warning-text">{t('modeWarning')}</p>}
          {message.type === 'pc' && <>
            <fieldset className="bank-fields"><legend>{t('bankSelect')}</legend>{(['msb', 'lsb'] as const).map(key => <div key={key}>
              <label className="check"><input type="checkbox" disabled={Object.keys(draft.invalidFields).length > 0} checked={message.bank?.[key] !== undefined} onChange={event => { const bank = { ...message.bank }; if (event.target.checked) bank[key] = 0; else delete bank[key]; const next = { ...message }; if (bank.msb === undefined && bank.lsb === undefined) delete next.bank; else next.bank = bank; changeMessages(replace(next)); }} />{t(key === 'msb' ? 'useMsb' : 'useLsb')}</label>
              {message.bank?.[key] !== undefined && numberField(t(key), `${index}:${key}`, message.bank[key], value => replace({ ...message, bank: { ...message.bank, [key]: value } }))}
            </div>)}</fieldset>
            <button className="text-button" type="button" disabled={configuration.presets.length >= CONFIGURATION_LIMITS.presets} onClick={() => { const { type: _, ...reference } = message; if (onChange({ ...configuration, presets: [...configuration.presets, { ...reference, id: crypto.randomUUID(), name: pedal.label || t('newPreset') }] }) === false) update({ ...draft, pending: true, error: 'rejected' }); }}>{t('savePreset')}</button>
          </>}
        </article>;
      })}
      <div className="button-row">{(['pc', 'cc'] as const).map(type => <button className="secondary" type="button" key={type} disabled={messages.length >= CONFIGURATION_LIMITS.messagesPerAction || Object.keys(draft.invalidFields).length > 0} onClick={() => {
        const base = { channel: destination?.channel ?? 1, ...(destination ? { destinationId: destination.id } : {}) };
        changeMessages([...messages, type === 'pc' ? { ...base, type, program: 0 } : { ...base, type, controller: 0, value: 0 }]);
      }}>{t(type === 'pc' ? 'addPc' : 'addCc')}</button>)}</div>
      <p className="helper">{t('zeroBased')}</p>
    </div>}
    {draft.error && <p role="alert" className="warning-text">{draft.error === 'reviewExpired' ? t('guided.reviewExpired') : wt('rejected')}</p>}
    {draft.pending && <button className="text-button" type="button" onClick={discard}>{wt('discard')}</button>}
    {(onManageDestinations || onManagePresets) && <div className="workbench-context-tools button-row">
      {onManageDestinations && <button className="text-button" type="button" onClick={onManageDestinations}>{wt('manageEquipment')}</button>}
      {onManagePresets && <button className="text-button" type="button" onClick={onManagePresets}>{wt('managePresets')}</button>}
    </div>}
  </div>;
}

/** Physical overview + inspector. Styling hooks: workbench-board, workbench-inspector,
 * workbench-action, workbench-destination, workbench-context-tools, workbench-field,
 * field-error, workbench-add-equipment, workbench-action-kind, workbench-manual.
 * Forms are cached by group/switch/sequence, not keyed by configuration or MIDI bytes.
 * Secondary controls follow the action core; invalid retained names reveal their disclosure.
 */
export function GuidedEditor({ configuration, onChange, groupId, onGroup, switchId, onSwitch, confirm, destinationId, disabled = false, profiles = equipmentProfiles, onPendingChange, sequence, onSequence, switchOptions, children, externalPending = false, midiEditable = true, assignmentSummaries, onManageDestinations, onManagePresets }: GuidedEditorProps) {
  const { t, i18n } = useTranslation();
  const { wt } = useWorkbenchTranslation();
  const locale = i18n.resolvedLanguage === 'en' ? 'en' : 'pt-BR';
  const controllerId = useId();
  const [localSequence, setLocalSequence] = useState<Sequence>('primary');
  const rawSequence = sequence ?? localSequence;
  const setRawSequence = (next: Sequence) => { setLocalSequence(next); onSequence?.(next); };
  const [pending, setPending] = useState<string[]>([]);
  const pendingOwners = useRef(new Set<string>());
  const drafts = useRef(new Map<string, ActionDraft>());
  const textDrafts = useRef(new Map<string, string>());
  const switchSettingsRef = useRef<HTMLDetailsElement>(null);
  const groupSettingsRef = useRef<HTMLDetailsElement>(null);
  const pendingCallback = useRef(onPendingChange);
  pendingCallback.current = onPendingChange;
  const reportPending = useCallback((owner: string, value: boolean) => {
    const wasPending = pendingOwners.current.size > 0;
    if (value) pendingOwners.current.add(owner); else pendingOwners.current.delete(owner);
    setPending([...pendingOwners.current]);
    const nowPending = pendingOwners.current.size > 0;
    if (wasPending !== nowPending) pendingCallback.current?.(nowPending);
  }, []);
  useEffect(() => () => { pendingCallback.current?.(false); }, []);
  const groups = configuration.groups;
  const group = groups.find(entry => entry.id === groupId) ?? groups[0];
  useEffect(() => {
    if (!group) return;
    if (pendingOwners.current.has(JSON.stringify([group.id, switchId, 'primary', 'label'])) && switchSettingsRef.current) switchSettingsRef.current.open = true;
    if (pendingOwners.current.has(JSON.stringify([group.id, switchId, 'primary', 'groupName'])) && groupSettingsRef.current) groupSettingsRef.current.open = true;
  }, [pending, group?.id, switchId]);
  if (!group) return <p role="status">{t('guided.noReadGroups')}</p>;
  const pedal = group.switches[switchId];
  const index = groups.indexOf(group);
  const selection = `${group.id}:${switchId}`;
  const [primaryKey, secondaryKey] = gestureKeys(pedal.behavior);
  const showSecondary = rawSequence === 'secondary' || !['single', 'long'].includes(pedal.behavior ?? 'single') || !!pedal.secondaryMessages?.length;
  function navigate(action: () => void) {
    // Owned drafts survive navigation; only an external, non-retained form needs a discard decision.
    if (externalPending) confirm(t('guided.discardPending'), t('guided.discardChanges'), action);
    else action();
  }
  function summary(id: SwitchId, selectedSequence: EquipmentSequence = 'primary'): string {
    const entry = group!.switches[id];
    const bound = boundEquipmentAction(configuration, entry, selectedSequence, profiles);
    if (bound) return `${bound.destination.name} · ${localizeEquipmentText(bound.action.label, locale)}${Object.keys(bound.binding.parameters).length ? ` · ${Object.values(bound.binding.parameters).join(' / ')}` : ''}`;
    const messages = sequenceMessages(entry, selectedSequence);
    const first = messages[0];
    if (!first) return t('noAssignment');
    return `${first.type === 'pc' ? `PC ${first.program}` : `CC ${first.controller} = ${first.value}`} · ${t('channel')} ${first.channel}${messages.length > 1 ? ` · ${t('guided.multipleMessages', { count: messages.length })}` : ''}`;
  }
  const title = rawSequence === 'primary' ? t(primaryKey) : rawSequence === 'secondary' ? t(secondaryKey) : t(rawSequence);
  const groupLimit = getControllerMode(effectiveControllerMode(configuration))?.capabilities.groupCount ?? 8;
  function addGroup(duplicate: boolean) {
    const added = structuredClone(group!);
    added.id = crypto.randomUUID();
    added.name = `${t('newGroup')} ${groups.length + 1}`;
    if (!duplicate) for (const id of SWITCH_IDS) added.switches[id] = { label: id, behavior: 'single', actions: [], secondaryMessages: [] };
    const next = { ...configuration, groups: [...groups, added] };
    if (effectiveControllerMode(configuration) === 3 && configuration.controller?.advancedMaxGroupIndex !== undefined) next.controller = { ...configuration.controller, advancedMaxGroupIndex: groups.length };
    if (onChange(next) !== false) { onGroup(added.id); setRawSequence('primary'); }
  }
  return <fieldset className="guided-editor guided-fields workbench-board" disabled={disabled}>
    {!!pending.length && <div className="guided-pending workbench-incomplete" role="status"><p>{wt('incomplete')}</p><div className="button-row">{pending.map(owner => {
      const [pendingGroup, pendingSwitch, pendingSequence] = JSON.parse(owner) as [string, SwitchId, Sequence];
      const entry = groups.find(value => value.id === pendingGroup);
      if (!entry) return null;
      return <button type="button" className="text-button" key={owner} onClick={() => {
        onGroup(pendingGroup); onSwitch(pendingSwitch); setRawSequence(pendingSequence);
        const field = (JSON.parse(owner) as string[])[3];
        if (field === 'label' && switchSettingsRef.current) switchSettingsRef.current.open = true;
        if (field === 'groupName' && groupSettingsRef.current) groupSettingsRef.current.open = true;
      }}>{entry.name} · {pendingSwitch} · {t(pendingSequence === 'primary' ? gestureKeys(entry.switches[pendingSwitch].behavior)[0] : pendingSequence === 'secondary' ? gestureKeys(entry.switches[pendingSwitch].behavior)[1] : pendingSequence)} · {wt('unfinished')}</button>;
    })}</div></div>}
    <section className="guided-controller" aria-label={t('board')}>
      <div className="guided-navigation"><div><p className="eyebrow">{t('guided.groupBeingEdited')}</p><strong>{group.name}</strong></div>
        <div className="guided-nav-controls"><button type="button" className="secondary" disabled={index === 0} onClick={() => navigate(() => onGroup(groups[index - 1]!.id))}>{t('guided.previousChoices')}</button>
          <label className="field"><span className="visually-hidden">{t('guided.goToChoices')}</span><select value={group.id} onChange={event => { const id = event.target.value; navigate(() => onGroup(id)); }}>{groups.map(entry => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
          <button type="button" className="secondary" disabled={index === groups.length - 1} onClick={() => navigate(() => onGroup(groups[index + 1]!.id))}>{t('guided.nextChoices')}</button></div>
      </div>
      <div className="controller-chassis"><span className="controller-wordmark" aria-hidden="true">CHOCOLATE PLUS</span><div className="controller-deck" role="group" aria-label={t('controllerDiagram')} aria-describedby={`${controllerId}-preview`}>
        <span className="controller-pair pair-e" aria-hidden="true"><span>E</span></span><span className="controller-pair pair-f" aria-hidden="true"><span>F</span></span>
        {SWITCH_IDS.map(id => <Fragment key={id}>{id === 'C' && <div className="controller-display"><span>{wt('preview')}</span><strong>{switchId}</strong></div>}
          <button type="button" style={{ minHeight: 44, minWidth: 44 }} className={`controller-switch controller-switch-${id}`} aria-pressed={switchId === id} aria-label={t('guided.editChoice', { choice: id })} aria-describedby={`${controllerId}-${id}`} onClick={() => navigate(() => onSwitch(id))}><span className="controller-metal" aria-hidden="true"><span /></span><span className="controller-letter" aria-hidden="true">{id}</span></button>
        </Fragment>)}
      </div></div>
      <p className="guided-preview-note" id={`${controllerId}-preview`}>{t('guided.localPreview')}</p>
      <dl className="controller-assignments">{SWITCH_IDS.map(id => {
        const entry = group.switches[id];
        const [first, second] = gestureKeys(entry.behavior);
        return <div className="controller-assignment" data-selected={id === switchId} id={`${controllerId}-${id}`} key={id}><dt><button className="assignment-letter" type="button" aria-pressed={id === switchId} aria-label={wt('selectSwitch', { switch: id })} onClick={() => navigate(() => onSwitch(id))}>{id}</button><span>{entry.label}</span></dt>
          {assignmentSummaries?.[id] ? <dd>{assignmentSummaries[id]}</dd> : <><dd><span className="assignment-gesture">{t(first)}: </span>{summary(id)}</dd>{(entry.behavior !== 'single' && entry.behavior !== undefined || !!entry.secondaryMessages?.length) && <dd><span className="assignment-gesture">{t(second)}: </span>{summary(id, 'secondary')}</dd>}</>}
        </div>;
      })}</dl>
      <details className="group-settings" ref={groupSettingsRef}><summary>{wt('settings')}</summary>
        <RetainedNameField key={`${group.id}:${switchId}`} label={t('groupName')} max={CONFIGURATION_LIMITS.nameLength} value={group.name} owner={JSON.stringify([group.id, switchId, 'primary', 'groupName'])} drafts={textDrafts.current} reportPending={reportPending} onChange={name => onChange(editGroup(configuration, group.id, next => { next.name = name; }))} />
        <div className="button-row"><button type="button" className="text-button" disabled={groups.length >= groupLimit || pending.length > 0} onClick={() => addGroup(false)}>{t('addGroup')}</button>
          <button type="button" className="text-button" disabled={groups.length >= groupLimit || pending.length > 0} onClick={() => addGroup(true)}>{t('duplicateGroup')}</button>
          <button type="button" className="text-button danger" disabled={groups.length <= 1 || pending.length > 0} onClick={() => confirm(t('confirmRemoveGroup'), t('removeGroup'), () => {
            if (onChange({ ...configuration, groups: groups.filter(entry => entry.id !== group.id) }) !== false) { onGroup(groups.find(entry => entry.id !== group.id)!.id); setRawSequence('primary'); }
          })}>{t('removeGroup')}</button></div>
      </details>
    </section>
    <section className="guided-inspector guided-panel workbench-inspector" aria-labelledby={`${controllerId}-editor`}>
      <header className="section-heading"><h2 id={`${controllerId}-editor`}>{t('editingSwitch', { switch: switchId })}</h2></header>
      {switchOptions}
      {midiEditable ? <>
        <div className="gesture-choices" role="group" aria-label={t('sequence')}>
          <button type="button" className="gesture-choice" aria-pressed={rawSequence === 'primary'} onClick={() => setRawSequence('primary')}><strong>{t(primaryKey)}</strong></button>
          {showSecondary ? <button type="button" className="gesture-choice" aria-pressed={rawSequence === 'secondary'} onClick={() => setRawSequence('secondary')}><strong>{t(secondaryKey)}</strong></button> : pedal.behavior === 'single' || pedal.behavior === undefined ? <button type="button" className="text-button" onClick={() => { if (onChange(editGroup(configuration, group.id, next => { next.switches[switchId].behavior = 'shortLong'; })) !== false) setRawSequence('secondary'); }}>{t('guided.addHold')}</button> : null}
          {pedal.actions.slice(1).map(entry => <button type="button" className="gesture-choice" key={entry.gesture} aria-pressed={rawSequence === entry.gesture} onClick={() => setRawSequence(entry.gesture)}>{t(entry.gesture)}</button>)}
        </div>
        <ActionEditor key={`${selection}:${rawSequence}`} configuration={configuration} onChange={onChange} groupId={group.id} switchId={switchId} confirm={confirm} sequence={rawSequence} title={title} profiles={profiles} drafts={drafts.current} owner={JSON.stringify([group.id, switchId, rawSequence])} reportPending={reportPending} {...(destinationId ? { destinationId } : {})} {...(onManageDestinations ? { onManageDestinations } : {})} {...(onManagePresets ? { onManagePresets } : {})} />
      </> : children}
      <details className="workbench-switch-settings" ref={switchSettingsRef}><summary>{wt('switchSettings')}</summary>
        <RetainedNameField key={`${selection}:label`} label={t('label')} max={64} value={pedal.label} allowEmpty owner={JSON.stringify([group.id, switchId, 'primary', 'label'])} drafts={textDrafts.current} reportPending={reportPending} onChange={label => onChange(editGroup(configuration, group.id, next => { next.switches[switchId].label = label; }))} />
        {midiEditable && <label className="field"><span>{t('behavior')}</span><select value={pedal.behavior ?? 'single'} onChange={event => onChange(editGroup(configuration, group.id, next => { next.switches[switchId].behavior = event.target.value as SwitchBehavior; }))}>{(['single', 'alternate', 'momentary', 'long', 'shortLong'] as const).map(behavior => <option value={behavior} key={behavior}>{t(behavior)}</option>)}</select></label>}
      </details>
    </section>
  </fieldset>;
}
