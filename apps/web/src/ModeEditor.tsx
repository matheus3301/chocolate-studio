import { Fragment, useCallback, useEffect, useId, useState } from 'react';
import { CONTROLLER_CUSTOM_COMMANDS, SWITCH_IDS, effectiveControllerMode, getControllerMode } from '@chocolate-studio/midi';
import type { ControllerSettings, Group, MixedAssignment, StudioConfiguration, SwitchId } from '@chocolate-studio/midi';
import { FCP_FIELDS, FCP_TURNER_KEYS } from '@chocolate-studio/chocolate-layout';
import { GuidedEditor } from './GuidedEditor.js';
import type { GuidedEditorProps } from './GuidedEditor.js';
import { ShortcutEditor } from './ShortcutEditor.js';
import { useModeTranslation } from './mode-i18n.js';

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

export function ModeSettings({ configuration, onChange, disabled = false }: {
  configuration: StudioConfiguration;
  onChange: (configuration: StudioConfiguration) => boolean | void;
  disabled?: boolean;
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
  return <details className="mode-global-settings"><summary>{mt('globals')}</summary><fieldset className="guided-fields" disabled={disabled}>
    <div className="mode-settings">
      {select('channelIndex', mt('channel'), 1)}
      {(raw === 0 || raw === 1) && select(raw === 0 ? 'pcMaxGroupIndex' : 'ccMaxGroupIndex', mt('lastNumber'))}
      {raw === 0 && select('pcDisplay', mt('pcDisplay'))}
      {raw === 3 && <>{select('advancedMaxGroupIndex', mt('groups'), 1)}{select('advancedGroupIndex', mt('currentGroup'), 1)}</>}
      {raw === 10 && select('keyboardGroupIndex', mt('currentGroup'), 1)}
      {raw === 11 && select('mixGroupIndex', mt('currentGroup'), 1)}
      {select('polarity', mt('polarity'))}
    </div>
    <details className="mode-expert"><summary>{mt('expert')}</summary><p className="helper">{mt('expertHint')}</p><div className="mode-settings">
      {select('bankMidi', mt('bankMidi'))}
      {raw === 2 && SWITCH_IDS.map(pedal => <Fragment key={pedal}>{select(`visual${pedal}`, `${mt('visual')} · ${pedal}`)}</Fragment>)}
    </div></details>
    {error && <p className="warning-text" role="alert">{mt('error')}</p>}
  </fieldset></details>;
}

export function ModeEditor({ configuration, onChange, confirm, onPendingChange, disabled = false }: {
  configuration: StudioConfiguration;
  onChange: (configuration: StudioConfiguration) => boolean | void;
  confirm: GuidedEditorProps['confirm'];
  onPendingChange?: (pending: boolean) => void;
  disabled?: boolean;
}) {
  const { mt, locale } = useModeTranslation();
  const id = useId();
  const [previewGroup, setPreviewGroup] = useState(0);
  const [switchId, setSwitch] = useState<SwitchId>('A');
  const [error, setError] = useState(false);
  const [pending, setPending] = useState(false);
  const [revision, setRevision] = useState(0);
  const reportPending = useCallback((value: boolean) => { setPending(value); onPendingChange?.(value); }, [onPendingChange]);
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
  function change(patch: Partial<ControllerSettings>) {
    if (onChange({ ...configuration, controller: { ...settings, ...patch } }) === false) { setError(true); return false; }
    setError(false); return true;
  }
  function navigate(action: () => void) {
    if (!pending) { action(); return; }
    confirm(mt('discard'), mt('discard'), () => { setRevision(value => value + 1); action(); });
  }
  function changeMixed(patch: Partial<MixedAssignment>) {
    const next: MixedAssignment = { groupIndex: group, switchId, typeCode: mixed?.typeCode ?? 0, ...mixed, ...patch };
    return change({ mixedAssignments: [...(settings.mixedAssignments ?? []).filter(entry => entry.groupIndex !== group || entry.switchId !== switchId), next] });
  }
  const typeChoice = <label className="field mode-type-choice"><span>{mt('buttonUse')}</span><select value={mixed?.typeCode ?? ''} onChange={event => { const value = Number(event.target.value); navigate(() => { changeMixed({ typeCode: value }); }); }}>
    {!mixed && <option value="" disabled>{mt('chooseUse')}</option>}<option value={0}>{mt('midiAction')}</option><option value={1}>{mt('keyboardAction')}</option><option value={2}>{mt('pageAction')}</option>
  </select></label>;
  const turner = <label className="field"><span>{mt('pageKey')}</span><select value={mixed?.turnerKeyIndex ?? ''} onChange={event => changeMixed({ turnerKeyIndex: Number(event.target.value) })}>
    {mixed?.turnerKeyIndex === undefined && <option value="" disabled>{mt('preserve')}</option>}{FCP_TURNER_KEYS.map((key, index) => <option value={index} key={key}>{locale === 'pt-BR' ? ['Seta para cima', 'Seta para baixo', 'Seta para a esquerda', 'Seta para a direita', 'Página anterior', 'Próxima página', 'Faixa anterior', 'Próxima faixa', 'Diminuir volume', 'Aumentar volume'][index] : key}</option>)}
  </select></label>;
  const mixedGroups = configuration.mixedGroups;
  return <section className="mode-workbench" aria-labelledby={`${id}-title`}>
    <header className="mode-heading"><h1 id={`${id}-title`}>{mode?.label[locale] ?? mt('unknown')}</h1>{mode && <p className="helper">{mode.description[locale]}</p>}</header>
    <fieldset className="guided-fields" disabled={disabled || !mode}>
      {assignment === 'mixed' && mixedGroups?.length ? <GuidedEditor configuration={{ ...configuration, groups: mixedGroups, mixedGroups: undefined }} onChange={next => onChange({ ...next, groups: configuration.groups, mixedGroups: next.groups })}
        groupId={mixedGroups[group]?.id ?? mixedGroups[0]!.id} onGroup={groupId => { setPreviewGroup(mixedGroups.findIndex(entry => entry.id === groupId)); }} switchId={switchId} onSwitch={setSwitch} confirm={confirm} switchOptions={typeChoice}
        assignmentSummaries={Object.fromEntries(SWITCH_IDS.flatMap(pedal => { const entry = settings.mixedAssignments?.find(value => value.groupIndex === group && value.switchId === pedal); return entry?.typeCode === 1 ? [[pedal, mt('keyboardAction')]] : entry?.typeCode === 2 ? [[pedal, mt('pageAction')]] : []; }))}
        midiEditable={mixed?.typeCode === 0} externalPending={pending} onPendingChange={reportPending}>
        {mixed?.typeCode === 1 && <ShortcutEditor key={`${group}:${switchId}:${revision}:${JSON.stringify(mixed.combination)}`} {...(mixed.combination ? { combination: mixed.combination } : {})} onChange={combination => changeMixed({ combination })} onPendingChange={reportPending} />}
        {mixed?.typeCode === 2 && turner}
      </GuidedEditor> : <>
        {(groupCount > 1 || fixed) && <div className="guided-navigation">{fixed && <div><p className="eyebrow">{mt('fixedRange')}</p><strong className="fixed-program-range">000–{String(groupCount * 4 - 1).padStart(3, '0')}</strong></div>}
          <label className="field"><span>{fixed ? mt('position') : mt('group')}</span><select value={group} onChange={event => { const value = Number(event.target.value); navigate(() => setPreviewGroup(value)); }}>{Array.from({ length: groupCount }, (_, index) => <option key={index} value={index}>{fixed ? `${String(index * 4).padStart(3, '0')}–${String(index * 4 + 3).padStart(3, '0')}` : `${mt('group')} ${index + 1}`}</option>)}</select></label>
        </div>}
        <div className="guided-controller"><div className="controller-chassis"><span className="controller-wordmark" aria-hidden="true">CHOCOLATE PLUS</span><div className="controller-deck" role="group" aria-label={mt('controllerMode')}>
          <span className="controller-pair pair-e" aria-hidden="true"><span>E</span></span><span className="controller-pair pair-f" aria-hidden="true"><span>F</span></span>
          {SWITCH_IDS.map((pedal, index) => <Fragment key={pedal}>{pedal === 'C' && <div className="controller-display"><span>{mt(fixed ? 'position' : 'switch')}</span><strong>{fixed ? String(group * 4 + SWITCH_IDS.indexOf(switchId)).padStart(3, '0') : switchId}</strong></div>}
            <button className={`controller-switch controller-switch-${pedal}`} type="button" aria-pressed={switchId === pedal} onClick={() => { if (pedal !== switchId) navigate(() => setSwitch(pedal)); }}><span className="controller-metal" aria-hidden="true"><span /></span><span className="controller-letter">{pedal}{fixed && <small>{String(group * 4 + index).padStart(3, '0')}</small>}</span></button>
          </Fragment>)}
        </div></div></div>
        {mode?.capabilities.fixedActions && <dl className="controller-assignments">{mode.capabilities.fixedActions.map((action, index) => <div className="controller-assignment" key={action}><dt><span className="assignment-letter">{SWITCH_IDS[index]}</span></dt><dd>{fixedLabels[action]?.[locale]}</dd></div>)}</dl>}
        {assignment === 'customSelectors' && <label className="field"><span>{mt('switch')} {switchId} · {mt('command')}</span><select value={settings[`customCommand${switchId}`] ?? ''} onChange={event => change({ [`customCommand${switchId}`]: Number(event.target.value) })}>
          {settings[`customCommand${switchId}`] === undefined && <option value="" disabled>{mt('preserve')}</option>}{CONTROLLER_CUSTOM_COMMANDS.map(command => <option value={command.index} key={command.index}>{command.label[locale]}</option>)}
        </select></label>}
        {assignment === 'keyboard' && <ShortcutEditor key={`${group}:${switchId}:${revision}:${JSON.stringify(keyboard?.combination)}`} {...(keyboard?.combination ? { combination: keyboard.combination } : {})} onChange={combination => change({ keyboardAssignments: [...(settings.keyboardAssignments ?? []).filter(entry => entry.groupIndex !== group || entry.switchId !== switchId), { groupIndex: group, switchId, combination }] })} onPendingChange={reportPending} />}
        {assignment === 'mixed' && !mixedGroups?.length && <div className="mode-empty-groups"><p className="helper">{mt('customGroupsHint')}</p><button className="secondary" type="button" onClick={() => confirm(mt('customGroups'), mt('customGroups'), () => {
          const groups: Group[] = Array.from({ length: 6 }, (_, index) => ({ id: crypto.randomUUID(), name: `${mt('group')} ${index + 1}`, switches: { A: { label: 'A', behavior: 'single', actions: [] }, B: { label: 'B', behavior: 'single', actions: [] }, C: { label: 'C', behavior: 'single', actions: [] }, D: { label: 'D', behavior: 'single', actions: [] } } }));
          if (onChange({ ...configuration, mixedGroups: groups }) === false) setError(true);
        })}>{mt('customGroups')}</button></div>}
      </>}
      <p className="guided-preview-note">{mt('localPreview')}</p>
      <ModeSettings configuration={configuration} onChange={onChange} disabled={pending} />
      {error && <p className="warning-text" role="alert">{mt('error')}</p>}
    </fieldset>
  </section>;
}
