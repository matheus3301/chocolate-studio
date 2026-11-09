import { Fragment, useCallback, useEffect, useId, useMemo, useState } from 'react';
import { CONTROLLER_CUSTOM_COMMANDS, SWITCH_IDS, effectiveControllerMode, getControllerMode } from '@chocolate-studio/midi';
import type { ControllerSettings, Group, MixedAssignment, StudioConfiguration, SwitchId } from '@chocolate-studio/midi';
import { FCP_FIELDS, FCP_KEYBOARD_KEYS, FCP_KEYBOARD_MODIFIERS, FCP_TURNER_KEYS } from '@chocolate-studio/chocolate-layout';
import type { KeyboardCombination } from '@chocolate-studio/chocolate-layout';
import { GuidedEditor } from './GuidedEditor.js';
import type { GuidedEditorProps } from './GuidedEditor.js';
import { formatKeyboardCombination } from './ShortcutEditor.js';
import { useModeTranslation } from './mode-i18n.js';
import { useWorkbenchTranslation } from './workbench-editor-i18n.js';

const fixedLabels: Record<string, { en: string; 'pt-BR': string }> = {
  swipeUp: { en: 'Swipe up', 'pt-BR': 'Deslizar para cima' }, swipeDown: { en: 'Swipe down', 'pt-BR': 'Deslizar para baixo' },
  swipeLeft: { en: 'Swipe left', 'pt-BR': 'Deslizar para a esquerda' }, swipeRight: { en: 'Swipe right', 'pt-BR': 'Deslizar para a direita' },
  rewind: { en: 'Rewind', 'pt-BR': 'Voltar no vídeo' }, fastForward: { en: 'Fast forward', 'pt-BR': 'Avançar no vídeo' },
  playPause: { en: 'Play / pause', 'pt-BR': 'Reproduzir / pausar' }, loop: { en: 'Loop', 'pt-BR': 'Repetir' },
  up: { en: 'Up arrow', 'pt-BR': 'Seta para cima' }, down: { en: 'Down arrow', 'pt-BR': 'Seta para baixo' },
  left: { en: 'Left arrow', 'pt-BR': 'Seta para a esquerda' }, right: { en: 'Right arrow', 'pt-BR': 'Seta para a direita' },
  pageUp: { en: 'Page Up', 'pt-BR': 'Página anterior' }, pageDown: { en: 'Page Down', 'pt-BR': 'Próxima página' },
  space: { en: 'Space', 'pt-BR': 'Espaço' }, enter: { en: 'Enter', 'pt-BR': 'Enter' },
  previousTrack: { en: 'Previous track', 'pt-BR': 'Faixa anterior' }, nextTrack: { en: 'Next track', 'pt-BR': 'Próxima faixa' },
  volumeDown: { en: 'Volume down', 'pt-BR': 'Diminuir volume' }, volumeUp: { en: 'Volume up', 'pt-BR': 'Aumentar volume' },
};

type ScalarField = keyof typeof FCP_FIELDS;

function KeyboardInspector({ combination, onChange, onPendingChange }: {
  combination?: KeyboardCombination;
  onChange: (combination: KeyboardCombination) => boolean | void;
  onPendingChange: (pending: boolean) => void;
}) {
  const { mt, locale } = useModeTranslation();
  const [draft, setDraft] = useState(combination);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const validationId = useId();
  const distinct = !draft || draft.modifier1 === 0 || draft.modifier1 !== draft.modifier2;
  useEffect(() => { onPendingChange(pending); return () => onPendingChange(false); }, [pending, onPendingChange]);
  useEffect(() => { if (!pending) setDraft(combination); }, [combination]);
  function change(field: keyof KeyboardCombination, value: number) {
    const next = { modifier1: 0, modifier2: 0, key: 0, ...draft, [field]: value };
    setDraft(next);
    if (next.modifier1 !== 0 && next.modifier1 === next.modifier2) { setPending(true); setError(false); return; }
    try {
      const rejected = onChange(next) === false;
      setPending(rejected); setError(rejected);
    } catch { setPending(true); setError(true); }
  }
  return <div className="shortcut-editor workbench-keyboard" role="form" aria-label={mt('shortcut')}>
    <div className="mode-settings">
      {(['modifier1', 'modifier2'] as const).map((field, index) => <label className="field" key={field}><span>{mt(index === 0 ? 'modifier1' : 'modifier2')}</span><select style={{ minHeight: 44 }} value={draft?.[field] ?? ''} aria-invalid={!distinct} aria-describedby={!distinct ? validationId : undefined} onChange={event => change(field, Number(event.target.value))}>
        {!draft && <option value="" disabled>{mt('preserve')}</option>}{FCP_KEYBOARD_MODIFIERS.map((modifier, value) => <option key={modifier} value={value} disabled={value !== 0 && draft?.[field === 'modifier1' ? 'modifier2' : 'modifier1'] === value}>{value === 0 ? mt('none') : modifier}</option>)}
      </select></label>)}
      <label className="field"><span>{mt('key')}</span><select style={{ minHeight: 44 }} value={draft?.key ?? ''} onChange={event => change('key', Number(event.target.value))}>
        {!draft && <option value="" disabled>{mt('preserve')}</option>}{FCP_KEYBOARD_KEYS.map((key, value) => <option key={key} value={value}>{formatKeyboardCombination({ modifier1: 0, modifier2: 0, key: value }, locale)}</option>)}
      </select></label>
    </div>
    {draft && <p className="workbench-shortcut-preview">{formatKeyboardCombination(draft, locale)}</p>}
    {!distinct && <p className="warning-text" role="alert" id={validationId}>{mt('distinctModifiers')}</p>}
    {error && <p className="warning-text" role="alert">{mt('error')}</p>}
    {pending && <button type="button" className="text-button" onClick={() => { setDraft(combination); setPending(false); setError(false); }}>{mt('discard')}</button>}
  </div>;
}

/** Set embedded in the parent-owned controller settings dialog; no collapsed wrappers. */
export function ModeSettings({ configuration, onChange, disabled = false, embedded = false }: {
  configuration: StudioConfiguration;
  onChange: (configuration: StudioConfiguration) => boolean | void;
  disabled?: boolean;
  embedded?: boolean;
}) {
  const { mt } = useModeTranslation();
  const [error, setError] = useState(false);
  const raw = effectiveControllerMode(configuration);
  const settings = configuration.controller ?? {};
  function select(field: ScalarField, label: string, offset = 0) {
    const limits = FCP_FIELDS[field];
    const value = settings[field];
    return <label className="field"><span>{label}</span><select value={value ?? ''} onChange={event => {
      if (onChange({ ...configuration, controller: { ...settings, [field]: Number(event.target.value) } }) === false) { setError(true); return; }
      setError(false);
    }}>
      {value === undefined && <option value="" disabled>{mt('preserve')}</option>}
      {Array.from({ length: limits.max - limits.min + 1 }, (_, index) => { const number = limits.min + index; return <option key={number} value={number}>{field === 'pcDisplay' || field === 'polarity' || field === 'bankMidi' || field.startsWith('visual') ? mt(number ? 'enabled' : 'disabled') : field === 'pcMaxGroupIndex' || field === 'ccMaxGroupIndex' ? String(number * 4 + 3).padStart(3, '0') : number + offset}</option>; })}
    </select></label>;
  }
  const fields = <fieldset className="guided-fields" disabled={disabled}>
    <div className="mode-settings">
      {select('channelIndex', mt('channel'), 1)}
      {(raw === 0 || raw === 1) && select(raw === 0 ? 'pcMaxGroupIndex' : 'ccMaxGroupIndex', mt('lastNumber'))}
      {raw === 0 && select('pcDisplay', mt('pcDisplay'))}
      {raw === 3 && <>{select('advancedMaxGroupIndex', mt('groups'), 1)}{select('advancedGroupIndex', mt('currentGroup'), 1)}</>}
      {raw === 10 && select('keyboardGroupIndex', mt('currentGroup'), 1)}
      {raw === 11 && select('mixGroupIndex', mt('currentGroup'), 1)}
      {select('polarity', mt('polarity'))}
    </div>
    <div className="mode-expert"><h3>{mt('expert')}</h3><p className="helper">{mt('expertHint')}</p><div className="mode-settings">
      {select('bankMidi', mt('bankMidi'))}
      {raw === 2 && SWITCH_IDS.map(pedal => <Fragment key={pedal}>{select(`visual${pedal}`, `${mt('visual')} · ${pedal}`)}</Fragment>)}
    </div></div>
    {error && <p className="warning-text" role="alert">{mt('error')}</p>}
  </fieldset>;
  return embedded ? <div className="mode-global-settings mode-settings-embedded">{fields}</div> : <details className="mode-global-settings"><summary>{mt('globals')}</summary>{fields}</details>;
}

/** Parent owns mode transitions and contextual tool dialogs. hideSettings removes
 * the legacy settings disclosure when the parent renders ModeSettings embedded.
 */
export function ModeEditor({ configuration, onChange, confirm, onPendingChange, disabled = false, hideSettings = false, onCustomize, onManageDestinations, onManagePresets }: {
  configuration: StudioConfiguration;
  onChange: (configuration: StudioConfiguration) => boolean | void;
  confirm: GuidedEditorProps['confirm'];
  onPendingChange?: (pending: boolean) => void;
  disabled?: boolean;
  hideSettings?: boolean;
  onCustomize?: () => void;
  onManageDestinations?: () => void;
  onManagePresets?: () => void;
}) {
  const { mt, locale } = useModeTranslation();
  const { wt } = useWorkbenchTranslation();
  const id = useId();
  const [previewGroup, setPreviewGroup] = useState(0);
  const [switchId, setSwitch] = useState<SwitchId>('A');
  const [error, setError] = useState(false);
  const [actionPending, setActionPending] = useState(false);
  const [shortcutPending, setShortcutPending] = useState(false);
  const pending = actionPending || shortcutPending;
  const [revision, setRevision] = useState(0);
  const reportPending = useCallback((value: boolean) => setActionPending(value), []);
  const reportShortcutPending = useCallback((value: boolean) => setShortcutPending(value), []);
  useEffect(() => { onPendingChange?.(pending); }, [pending, onPendingChange]);
  useEffect(() => () => { onPendingChange?.(false); }, [onPendingChange]);
  const rawMode = effectiveControllerMode(configuration);
  const mode = getControllerMode(rawMode);
  const settings = configuration.controller ?? {};
  const assignment = mode?.capabilities.assignment;
  const fixed = assignment === 'fixedPc' || assignment === 'fixedCc';
  const groupCount = fixed ? (settings[rawMode === 0 ? 'pcMaxGroupIndex' : 'ccMaxGroupIndex'] ?? 31) + 1 : mode?.capabilities.groupCount ?? 1;
  const group = Math.min(previewGroup, groupCount - 1);
  const mixed = settings.mixedAssignments?.find(entry => entry.groupIndex === group && entry.switchId === switchId);
  const keyboard = settings.keyboardAssignments?.find(entry => entry.groupIndex === group && entry.switchId === switchId);
  const mixedConfiguration = useMemo(() => ({ ...configuration, groups: configuration.mixedGroups ?? [], mixedGroups: undefined }), [configuration]);
  function change(patch: Partial<ControllerSettings>, reportError = true) {
    if (onChange({ ...configuration, controller: { ...settings, ...patch } }) === false) { setError(reportError); return false; }
    setError(false); return true;
  }
  function navigate(action: () => void) {
    if (!pending) { action(); return; }
    confirm(mt('discard'), mt('discard'), () => { setRevision(value => value + 1); action(); });
  }
  function changeMixed(patch: Partial<MixedAssignment>, reportError = true) {
    const next: MixedAssignment = { groupIndex: group, switchId, typeCode: mixed?.typeCode ?? 0, ...mixed, ...patch };
    return change({ mixedAssignments: [...(settings.mixedAssignments ?? []).filter(entry => entry.groupIndex !== group || entry.switchId !== switchId), next] }, reportError);
  }
  const typeChoice = <label className="field mode-type-choice"><span>{mt('buttonUse')}</span><select value={mixed?.typeCode ?? ''} onChange={event => { const value = Number(event.target.value); navigate(() => { changeMixed({ typeCode: value }); }); }}>
    {!mixed && <option value="" disabled>{mt('chooseUse')}</option>}<option value={0}>{mt('midiAction')}</option><option value={1}>{mt('keyboardAction')}</option><option value={2}>{mt('pageAction')}</option>
  </select></label>;
  const turnerNames = locale === 'pt-BR' ? ['Seta para cima', 'Seta para baixo', 'Seta para a esquerda', 'Seta para a direita', 'Página anterior', 'Próxima página', 'Faixa anterior', 'Próxima faixa', 'Diminuir volume', 'Aumentar volume'] : FCP_TURNER_KEYS;
  const turner = <label className="field"><span>{mt('pageKey')}</span><select value={mixed?.turnerKeyIndex ?? ''} onChange={event => changeMixed({ turnerKeyIndex: Number(event.target.value) })}>
    {mixed?.turnerKeyIndex === undefined && <option value="" disabled>{mt('preserve')}</option>}{turnerNames.map((key, index) => <option value={index} key={key}>{key}</option>)}
  </select></label>;
  const mixedGroups = configuration.mixedGroups;
  const contextualTools = { ...(onManageDestinations ? { onManageDestinations } : {}), ...(onManagePresets ? { onManagePresets } : {}) };
  function summary(pedal: SwitchId): string {
    const number = group * 4 + SWITCH_IDS.indexOf(pedal);
    if (fixed) return `${assignment === 'fixedPc' ? `PC ${number}` : `CC ${number} = 0`} · ${mt('channel')} ${settings.channelIndex === undefined ? mt('preserve') : settings.channelIndex + 1}`;
    if (assignment === 'customSelectors') {
      const command = settings[`customCommand${pedal}`];
      return CONTROLLER_CUSTOM_COMMANDS.find(entry => entry.index === command)?.label[locale] ?? wt('preserve');
    }
    if (assignment === 'keyboard') {
      const entry = settings.keyboardAssignments?.find(value => value.groupIndex === group && value.switchId === pedal);
      return entry ? formatKeyboardCombination(entry.combination, locale) : wt('preserve');
    }
    const action = mode?.capabilities.fixedActions?.[SWITCH_IDS.indexOf(pedal)];
    return action ? fixedLabels[action]?.[locale] ?? action : wt('builtin');
  }
  return <section className="mode-workbench">
    <fieldset className="guided-fields" disabled={disabled || !mode}>
      {assignment === 'advanced' && configuration.groups.length ? <GuidedEditor configuration={configuration} onChange={onChange}
        groupId={configuration.groups[group]?.id ?? configuration.groups[0]!.id} onGroup={groupId => setPreviewGroup(configuration.groups.findIndex(entry => entry.id === groupId))}
        switchId={switchId} onSwitch={setSwitch} confirm={confirm} onPendingChange={reportPending} {...contextualTools} />
      : assignment === 'mixed' && mixedGroups?.length ? <GuidedEditor key={revision} configuration={mixedConfiguration} onChange={next => onChange({ ...next, groups: configuration.groups, mixedGroups: next.groups })}
        groupId={mixedGroups[group]?.id ?? mixedGroups[0]!.id} onGroup={groupId => setPreviewGroup(mixedGroups.findIndex(entry => entry.id === groupId))} switchId={switchId} onSwitch={setSwitch} confirm={confirm} switchOptions={typeChoice}
        assignmentSummaries={Object.fromEntries(SWITCH_IDS.flatMap(pedal => {
          const entry = settings.mixedAssignments?.find(value => value.groupIndex === group && value.switchId === pedal);
          return entry?.typeCode === 1 ? [[pedal, entry.combination ? formatKeyboardCombination(entry.combination, locale) : wt('preserve')]]
            : entry?.typeCode === 2 ? [[pedal, turnerNames[entry.turnerKeyIndex ?? -1] ?? wt('preserve')]]
            : entry?.typeCode === 0 ? [] : [[pedal, wt('preserve')]];
        }))}
        midiEditable={mixed?.typeCode === 0} externalPending={shortcutPending} onPendingChange={reportPending} {...contextualTools}>
        {mixed?.typeCode === 1 && <KeyboardInspector key={`${group}:${switchId}:${revision}`} {...(mixed.combination ? { combination: mixed.combination } : {})} onChange={combination => changeMixed({ combination }, false)} onPendingChange={reportShortcutPending} />}
        {mixed?.typeCode === 2 && turner}
      </GuidedEditor> : <div className="guided-editor workbench-board">
        <section className="guided-controller">
          {(groupCount > 1 || fixed) && <div className="guided-navigation">
            {fixed && <div><p className="eyebrow">{mt('fixedRange')}</p><strong className="fixed-program-range">000–{String(groupCount * 4 - 1).padStart(3, '0')}</strong></div>}
            <div className="guided-nav-controls">
              <button className="secondary" type="button" disabled={group === 0} onClick={() => navigate(() => setPreviewGroup(group - 1))}>{wt('previous')}</button>
              <label className="field"><span>{fixed ? mt('position') : mt('group')}</span><select style={{ minHeight: 44 }} value={group} onChange={event => { const value = Number(event.target.value); navigate(() => setPreviewGroup(value)); }}>{Array.from({ length: groupCount }, (_, index) => <option key={index} value={index}>{fixed ? `${String(index * 4).padStart(3, '0')}–${String(index * 4 + 3).padStart(3, '0')}` : `${mt('group')} ${index + 1}`}</option>)}</select></label>
              <button className="secondary" type="button" disabled={group === groupCount - 1} onClick={() => navigate(() => setPreviewGroup(group + 1))}>{wt('next')}</button>
            </div>
          </div>}
          <div className="controller-chassis"><span className="controller-wordmark" aria-hidden="true">CHOCOLATE PLUS</span><div className="controller-deck" role="group" aria-label={mt('controllerMode')} aria-describedby={`${id}-preview`}>
            <span className="controller-pair pair-e" aria-hidden="true"><span>E</span></span><span className="controller-pair pair-f" aria-hidden="true"><span>F</span></span>
            {SWITCH_IDS.map((pedal, index) => <Fragment key={pedal}>{pedal === 'C' && <div className="controller-display"><span>{wt('preview')}</span><strong>{fixed ? String(group * 4 + SWITCH_IDS.indexOf(switchId)).padStart(3, '0') : switchId}</strong></div>}
              <button style={{ minHeight: 44, minWidth: 44 }} className={`controller-switch controller-switch-${pedal}`} type="button" aria-label={`${mt('switch')} ${pedal}`} aria-describedby={`${id}-${pedal}`} aria-pressed={switchId === pedal} onClick={() => { if (pedal !== switchId) navigate(() => setSwitch(pedal)); }}><span className="controller-metal" aria-hidden="true"><span /></span><span className="controller-letter">{pedal}{fixed && <small>{String(group * 4 + index).padStart(3, '0')}</small>}</span></button>
            </Fragment>)}
          </div></div>
          <p className="guided-preview-note" id={`${id}-preview`}>{mt('localPreview')}</p>
          <dl className="controller-assignments">{SWITCH_IDS.map(pedal => <div className="controller-assignment" data-selected={pedal === switchId} id={`${id}-${pedal}`} key={pedal}><dt><button type="button" className="assignment-letter" aria-pressed={pedal === switchId} onClick={() => navigate(() => setSwitch(pedal))}>{pedal}</button></dt><dd>{summary(pedal)}</dd></div>)}</dl>
        </section>
        <section className="guided-inspector guided-panel workbench-inspector" aria-labelledby={`${id}-inspector`}>
          <header className="section-heading"><h2 id={`${id}-inspector`}>{mt('switch')} {switchId}</h2></header>
          {(fixed || assignment === 'fixedKeyboard') && <div className="workbench-fixed-action"><p className="eyebrow">{wt('fixedAction')}</p><strong>{summary(switchId)}</strong><p>{fixed ? mt(assignment === 'fixedPc' ? 'fixedPc' : 'fixedCc') : mode?.description[locale]}</p><p className="helper">{wt(fixed ? 'fixedExplanation' : 'fixedKeyboard')}</p>{onCustomize && <button className="secondary" type="button" onClick={onCustomize}>{wt('customize')}</button>}</div>}
          {assignment === 'customSelectors' && <label className="field"><span>{mt('switch')} {switchId} · {mt('command')}</span><select style={{ minHeight: 44 }} value={settings[`customCommand${switchId}`] ?? ''} onChange={event => change({ [`customCommand${switchId}`]: Number(event.target.value) })}>
            {settings[`customCommand${switchId}`] === undefined && <option value="" disabled>{mt('preserve')}</option>}{CONTROLLER_CUSTOM_COMMANDS.map(command => <option value={command.index} key={command.index}>{command.label[locale]}</option>)}
          </select></label>}
          {(fixed || assignment === 'customSelectors') && <div className="workbench-context-tools button-row">
            {onManageDestinations && <button type="button" className="text-button" onClick={onManageDestinations}>{wt('manageEquipment')}</button>}
            {onManagePresets && <button type="button" className="text-button" onClick={onManagePresets}>{wt('managePresets')}</button>}
          </div>}
          {assignment === 'keyboard' && <KeyboardInspector key={`${group}:${switchId}:${revision}`} {...(keyboard?.combination ? { combination: keyboard.combination } : {})} onChange={combination => change({ keyboardAssignments: [...(settings.keyboardAssignments ?? []).filter(entry => entry.groupIndex !== group || entry.switchId !== switchId), { groupIndex: group, switchId, combination }] }, false)} onPendingChange={reportShortcutPending} />}
          {(assignment === 'manufacturer' || assignment === 'speaker') && <div className="workbench-fixed-action"><strong>{wt('builtin')}</strong><p>{mode?.description[locale]}</p></div>}
          {!mode && <p role="status">{mt('unknown')} · {rawMode}</p>}
          {assignment === 'mixed' && !mixedGroups?.length && <div className="mode-empty-groups"><p className="helper">{mt('customGroupsHint')}</p><button className="secondary" type="button" onClick={() => confirm(mt('customGroups'), mt('customGroups'), () => {
            const groups: Group[] = Array.from({ length: 6 }, (_, index) => ({ id: crypto.randomUUID(), name: `${mt('group')} ${index + 1}`, switches: { A: { label: 'A', behavior: 'single', actions: [] }, B: { label: 'B', behavior: 'single', actions: [] }, C: { label: 'C', behavior: 'single', actions: [] }, D: { label: 'D', behavior: 'single', actions: [] } } }));
            if (onChange({ ...configuration, mixedGroups: groups }) === false) setError(true);
          })}>{mt('customGroups')}</button></div>}
        </section>
      </div>}
      {!hideSettings && <ModeSettings configuration={configuration} onChange={onChange} disabled={pending} />}
      {error && <p className="warning-text" role="alert">{mt('error')}</p>}
    </fieldset>
  </section>;
}
