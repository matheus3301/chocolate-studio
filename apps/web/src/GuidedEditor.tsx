import { Fragment, useCallback, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SWITCH_IDS, applyEquipmentAction, compileEquipmentAction, equipmentProfiles, localizeEquipmentText } from '@chocolate-studio/midi';
import type { EquipmentActionParameters, EquipmentProfile, EquipmentSequence, MidiMessage, StudioConfiguration, SwitchId } from '@chocolate-studio/midi';
import { Pedalboard } from './EditorViews.js';
import { NameField, NumberField } from './components.js';
import { editGroup } from './editor.js';
import type { Sequence } from './editor.js';
import { boundEquipmentAction, destinationProfile, sameMidiCommands, sequenceMessages } from './guided-actions.js';
import { formatCommandNumber, groupProgramRange, primaryProgram } from './guided-navigation.js';

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
  onPendingChange?: (pending: boolean) => void;
  modeMetadata?: {
    source?: 'read' | 'draft';
    display?: 'pc' | 'unknown';
    groupIds?: readonly string[];
    rawMode?: number;
    modeKind?: 'program-change' | 'advanced' | 'unclassified';
    displayStyle?: 'pc-number' | 'unobserved';
    pcDisplayEnabled?: boolean | null;
  };
}

type ActionProps = Pick<GuidedEditorProps, 'configuration' | 'onChange' | 'switchId' | 'confirm' | 'destinationId'> & {
  groupId: string;
  sequence: EquipmentSequence;
  profiles: readonly EquipmentProfile[];
  reportPending: (owner: string, pending: boolean) => void;
};

function ActionEditor({ configuration, onChange, groupId, switchId, confirm, destinationId, sequence, profiles, reportPending }: ActionProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage === 'en' ? 'en' : 'pt-BR';
  const pedal = configuration.groups.find((group) => group.id === groupId)!.switches[switchId];
  const bound = boundEquipmentAction(configuration, pedal, sequence, profiles);
  const pendingOwner = useId();
  const initialTarget = bound?.destination.id ?? destinationId ?? configuration.destinations[0]?.id ?? '';
  const initialParameters = bound?.binding.parameters ?? {};
  const [targetId, setTargetId] = useState(bound?.destination.id ?? destinationId ?? configuration.destinations[0]?.id ?? '');
  const [actionId, setActionId] = useState(bound?.action.id ?? '');
  const [parameters, setParameters] = useState<EquipmentActionParameters>(bound?.binding.parameters ?? {});
  const [error, setError] = useState('');
  const pending = targetId !== initialTarget || actionId !== (bound?.action.id ?? '')
    || Object.keys(parameters).length !== Object.keys(initialParameters).length
    || Object.entries(parameters).some(([id, value]) => initialParameters[id] !== value);
  useEffect(() => { reportPending(pendingOwner, pending); return () => reportPending(pendingOwner, false); }, [pending, pendingOwner, reportPending]);
  const latest = useRef(configuration);
  latest.current = configuration;
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const destination = configuration.destinations.find((entry) => entry.id === targetId);
  const profile = destinationProfile(destination, profiles);
  const action = profile?.actions.find((entry) => entry.id === actionId);
  const simple = (pedal.behavior ?? 'single') === 'single' || pedal.behavior === 'shortLong';
  const shapeNeedsConversion = !simple || pedal.actions.length > 1 || !!pedal.actions[0] && pedal.actions[0].gesture !== 'press';
  const currentMessages = sequenceMessages(pedal, sequence);
  const title = simple ? t(sequence === 'primary' ? 'guided.onTap' : 'guided.onHold') : t(sequence === 'primary' ? 'guided.primarySequence' : 'guided.secondarySequence');
  let preview: MidiMessage[] | undefined;
  if (profile && action && destination) {
    try { preview = compileEquipmentAction(profile, action.id, parameters, destination); } catch { /* Invalid draft values are not committed. */ }
  }
  const actionDescription = action ? localizeEquipmentText(action.label, locale) : '';
  const parameterDescription = action ? Object.entries(action.parameters).map(([id, parameter]) => `${localizeEquipmentText(parameter.label, locale)} ${parameters[id] ?? '—'}`).join(' · ') : '';

  function apply() {
    if (!profile || !action || !destination || !preview) return;
    const commit = () => {
      if (!mounted.current) return;
      if (latest.current !== configuration) { setError('guided.reviewExpired'); return; }
      try {
        const base = shapeNeedsConversion ? editGroup(configuration, groupId, (group) => {
          const selected = group.switches[switchId];
          const messages = selected.actions[0]?.messages ?? [];
          selected.actions = messages.length ? [{ gesture: 'press', messages }] : [];
        }) : configuration;
        const next = applyEquipmentAction(base, groupId, switchId, sequence, {
          modelId: profile.modelId, profileVersion: profile.profileVersion,
          actionId: action.id, parameters, destinationId: destination.id,
        }, { profiles, behavior: sequence === 'secondary' || shapeNeedsConversion || pedal.behavior === 'shortLong' ? 'shortLong' : 'single' });
        if (onChange(next) === false) { setError('guided.changeRejected'); return; }
        reportPending(pendingOwner, false);
        setError('');
      } catch { setError('guided.changeRejected'); }
    };
    if (shapeNeedsConversion || !bound && currentMessages.length > 0 && !sameMidiCommands(currentMessages, preview)) {
      confirm(t(shapeNeedsConversion ? 'guided.convertConfirm' : 'guided.replaceConfirm'), t('guided.applyAction'), commit);
    } else commit();
  }

  return <form className="guided-action" onSubmit={(event) => { event.preventDefault(); apply(); }} aria-label={title}>
    <header><h3>{title}</h3>{bound && <span className="guided-binding">{t('guided.musicalAction')}</span>}</header>
    {!!currentMessages.length && !bound && <p className="helper">{t('guided.rawPreserved', { count: currentMessages.length })}</p>}
    <div className="guided-action-fields">
      <label className="field"><span>{t('guided.device')}</span><select required value={targetId} onChange={(event) => { setTargetId(event.target.value); setActionId(''); setParameters({}); setError(''); }}>
        <option value="">{t('guided.chooseEquipment')}</option>{configuration.destinations.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
      </select></label>
      {profile ? <label className="field"><span>{t('guided.action')}</span><select required value={actionId} onChange={(event) => {
        const selected = profile.actions.find((entry) => entry.id === event.target.value);
        setActionId(event.target.value);
        setParameters(selected ? Object.fromEntries(Object.entries(selected.parameters).map(([id, parameter]) => [id, parameter.initial])) : {});
        setError('');
      }}><option value="">{t('guided.chooseAction')}</option>{profile.actions.map((entry) => <option value={entry.id} key={entry.id}>{localizeEquipmentText(entry.label, locale)}</option>)}</select></label>
        : <p className="helper">{t('guided.rawEquipmentHint')}</p>}
      {action && Object.entries(action.parameters).map(([id, parameter]) => <NumberField key={`${action.id}-${id}`} label={localizeEquipmentText(parameter.label, locale)} min={parameter.minimum} max={parameter.maximum} value={parameters[id] ?? parameter.initial} onChange={(value) => { setParameters({ ...parameters, [id]: value }); setError(''); }} />)}
    </div>
    {action && <p className="helper">{localizeEquipmentText(action.description, locale)}</p>}
    {preview && destination && <p className="guided-expected" role="status">{t('guided.expected', { equipment: destination.name, action: [actionDescription, parameterDescription].filter(Boolean).join(' · ') })}</p>}
    {preview && <details className="guided-midi"><summary>{t('guided.midiDetails')}</summary><ol>{preview.map((message, index) => <li key={index}><code>{message.type === 'pc' ? `PC ${message.program}` : `CC ${message.controller} = ${message.value}`}</code> · {t('channel')} {message.channel}</li>)}</ol><p className="helper">{t('guided.expectedNotObserved')}</p></details>}
    {error && <p role="alert" className="warning-text">{t(error)}</p>}
    <button className="secondary" type="submit" disabled={!preview}>{t('guided.applyAction')}</button>
    {pending && <button className="text-button" type="button" onClick={() => { setTargetId(initialTarget); setActionId(bound?.action.id ?? ''); setParameters(initialParameters); setError(''); }}>{t('guided.discardForm')}</button>}
  </form>;
}

export function GuidedEditor({ configuration, onChange, groupId, onGroup, switchId, onSwitch, confirm, destinationId, disabled = false, profiles = equipmentProfiles, modeMetadata, onPendingChange }: GuidedEditorProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage === 'en' ? 'en' : 'pt-BR';
  const controllerId = useId();
  const [rawSequence, setRawSequence] = useState<Sequence>('primary');
  const [holdSelection, setHoldSelection] = useState('');
  const [formRevision, setFormRevision] = useState(0);
  const [pending, setPending] = useState(false);
  const pendingOwners = useRef(new Set<string>());
  const pendingCallback = useRef(onPendingChange);
  pendingCallback.current = onPendingChange;
  const reportPending = useCallback((owner: string, value: boolean) => {
    const wasPending = pendingOwners.current.size > 0;
    if (value) pendingOwners.current.add(owner);
    else pendingOwners.current.delete(owner);
    const nowPending = pendingOwners.current.size > 0;
    if (wasPending !== nowPending) { setPending(nowPending); pendingCallback.current?.(nowPending); }
  }, []);
  useEffect(() => () => { pendingCallback.current?.(false); }, []);
  const groups = modeMetadata?.groupIds ? configuration.groups.filter((group) => modeMetadata.groupIds!.includes(group.id)) : configuration.groups;
  const group = groups.find((entry) => entry.id === groupId) ?? groups[0];
  if (!group) return <p role="status">{t('guided.noReadGroups')}</p>;
  const pedal = group.switches[switchId];
  const index = groups.indexOf(group);
  const range = groupProgramRange(group);
  const programChangeMode = modeMetadata?.modeKind === 'program-change' || modeMetadata?.rawMode === 0;
  const physicalNumbers = !programChangeMode && modeMetadata?.source === 'read' && modeMetadata.display === 'pc' && !!range;
  const selectedProgram = physicalNumbers ? primaryProgram(pedal) : undefined;
  const selection = `${group.id}:${switchId}`;
  const showHold = pedal.behavior === 'shortLong' || holdSelection === selection;
  const change = (next: StudioConfiguration) => onChange(next) !== false;
  function navigate(action: () => void) {
    if (!pendingOwners.current.size) { action(); return; }
    confirm(t('guided.discardPending'), t('guided.discardChanges'), () => { setFormRevision((value) => value + 1); action(); });
  }
  function selectGroup(id: string) { if (id !== group!.id) navigate(() => { onGroup(id); setRawSequence('primary'); setHoldSelection(''); }); }
  function selectSwitch(id: SwitchId) { if (id !== switchId) navigate(() => { onSwitch(id); setRawSequence('primary'); setHoldSelection(''); }); }
  function summary(id: SwitchId): string {
    const entry = group!.switches[id];
    const bound = boundEquipmentAction(configuration, entry, 'primary', profiles);
    if (bound) return `${bound.destination.name} · ${localizeEquipmentText(bound.action.label, locale)}${Object.keys(bound.binding.parameters).length ? ` · ${Object.values(bound.binding.parameters).join(' / ')}` : ''}`;
    const first = entry.actions[0]?.messages[0];
    if (!first) return t('noAssignment');
    return `${first.type === 'pc' ? `PC ${first.program}` : `CC ${first.controller} = ${first.value}`} · ${t('channel')} ${first.channel}${entry.actions[0]!.messages.length > 1 ? ` · ${t('guided.multipleMessages', { count: entry.actions[0]!.messages.length })}` : ''}`;
  }
  return <fieldset className="guided-editor guided-fields" disabled={disabled}>
    {pending && <p className="guided-pending" role="status">{t('guided.pendingInstruction')}</p>}
    {programChangeMode && <aside className="guided-mode-note" aria-label={t('guided.deviceMode')}><strong>{t('guided.programChangeMode')}</strong><p>{t('guided.programChangeBoundary')}</p><p>{t('guided.advancedActivation')}</p></aside>}
    <section className="guided-controller" aria-label={t('board')}>
      <div className="guided-navigation">
        <div><p className="eyebrow">{t(physicalNumbers ? 'guided.numbersOnChocolate' : 'guided.groupBeingEdited')}</p><strong>{physicalNumbers ? range : group.name}</strong></div>
        <div className="guided-nav-controls"><button type="button" className="secondary" disabled={index === 0} onClick={() => selectGroup(groups[index - 1]!.id)}>{t('guided.previousChoices')}</button>
          <label className="field"><span className="visually-hidden">{t('guided.goToChoices')}</span><select value={group.id} onChange={(event) => selectGroup(event.target.value)}>{groups.map((entry) => {
            const groupRange = physicalNumbers ? groupProgramRange(entry) : undefined;
            return <option key={entry.id} value={entry.id}>{groupRange ?? entry.name}</option>;
          })}</select></label>
          <button type="button" className="secondary" disabled={index === groups.length - 1} onClick={() => selectGroup(groups[index + 1]!.id)}>{t('guided.nextChoices')}</button></div>
      </div>
      <div className="controller-chassis"><span className="controller-wordmark" aria-hidden="true">CHOCOLATE PLUS</span>
        <div className="controller-deck" role="group" aria-label={t('controllerDiagram')} aria-describedby={`${controllerId}-preview`}>
          <span className="controller-pair pair-e" aria-hidden="true"><span>E</span></span><span className="controller-pair pair-f" aria-hidden="true"><span>F</span></span>
          {SWITCH_IDS.map((id) => <Fragment key={id}>
            {id === 'C' && <div className="controller-display" role="status"><span>{t('editing')}</span><strong>{selectedProgram === undefined ? switchId : formatCommandNumber(selectedProgram)}</strong></div>}
            <button type="button" className={`controller-switch controller-switch-${id}`} aria-pressed={switchId === id} aria-label={t('guided.editChoice', { choice: physicalNumbers ? `${formatCommandNumber(primaryProgram(group.switches[id])!)} · ${id}` : id })} aria-describedby={`${controllerId}-${id}`} onClick={() => selectSwitch(id)}>
              <span className="controller-metal" aria-hidden="true"><span /></span><span className="controller-letter" aria-hidden="true">{id}{physicalNumbers && <small>{formatCommandNumber(primaryProgram(group.switches[id])!)}</small>}</span>
            </button>
          </Fragment>)}
        </div>
      </div>
      <p className="guided-preview-note" id={`${controllerId}-preview`}>{t('guided.localPreview')}</p>
      <dl className="controller-assignments">{SWITCH_IDS.map((id) => <div className="controller-assignment" data-selected={id === switchId} id={`${controllerId}-${id}`} key={id}><dt><span className="assignment-letter">{id}</span><span>{group.switches[id].label}</span></dt><dd>{summary(id)}</dd></div>)}</dl>
      <details className="guided-pair-notes"><summary>{t('guided.physicalCombinations')}</summary><p>{t('pairPress', { pair: 'E', left: 'A', right: 'B' })}. {t('pairPress', { pair: 'F', left: 'C', right: 'D' })}.</p><p>{t('guided.modeDependentBanking')}</p></details>
    </section>
    <section className="guided-inspector guided-panel" aria-labelledby={`${controllerId}-editor`}>
      <header className="section-heading"><h2 id={`${controllerId}-editor`}>{selectedProgram === undefined ? t('editingSwitch', { switch: switchId }) : t('guided.editingNumber', { number: formatCommandNumber(selectedProgram), switch: switchId })}</h2><span className="small-tag">{t('draft')}</span></header>
      <NameField label={t('label')} max={64} value={pedal.label} onChange={(label) => change(editGroup(configuration, group.id, (next) => { next.switches[switchId].label = label; }))} />
      {!['single', 'shortLong'].includes(pedal.behavior ?? 'single') && <p className="warning-text">{t('guided.existingBehavior', { behavior: t(pedal.behavior!) })}</p>}
      <ActionEditor key={`${selection}:${formRevision}:primary:${JSON.stringify([pedal.actionBindings?.primary, sequenceMessages(pedal, 'primary')])}`} configuration={configuration} onChange={onChange} groupId={group.id} switchId={switchId} confirm={confirm} sequence="primary" profiles={profiles} reportPending={reportPending} {...(destinationId ? { destinationId } : {})} />
      {showHold ? <ActionEditor key={`${selection}:${formRevision}:secondary:${JSON.stringify([pedal.actionBindings?.secondary, sequenceMessages(pedal, 'secondary')])}`} configuration={configuration} onChange={onChange} groupId={group.id} switchId={switchId} confirm={confirm} sequence="secondary" profiles={profiles} reportPending={reportPending} {...(destinationId ? { destinationId } : {})} />
        : <button type="button" className="text-button" onClick={() => setHoldSelection(selection)}>{t('guided.addHold')}</button>}
      <p className="helper">{t('guided.draftOnly')}</p>
    </section>
    <details className="guided-advanced"><summary>{t('guided.advancedMidi')}</summary><p className="helper">{t('guided.rawEditHint')}</p><fieldset className="guided-fields" disabled={pending}><Pedalboard configuration={configuration} onChange={change} groupId={group.id} onGroup={selectGroup} switchId={switchId} onSwitch={selectSwitch} sequence={rawSequence} onSequence={setRawSequence} confirm={confirm} inspectorOnly /></fieldset></details>
  </fieldset>;
}
