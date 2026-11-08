import { CONTROLLER_INTERFACE_COMMANDS } from '@chocolate-studio/midi';
import { useCallback, useEffect, useState } from 'react';
import type { InterfaceAssignment, StudioConfiguration } from '@chocolate-studio/midi';
import { NumberField } from './components.js';
import type { GuidedEditorProps } from './GuidedEditor.js';
import { useModeTranslation } from './mode-i18n.js';

function AssignmentForm({ assignment, slot, onApply, onClear, onPendingChange }: {
  assignment?: InterfaceAssignment;
  slot: number;
  onApply: (assignment: InterfaceAssignment) => boolean | void;
  onClear: () => boolean | void;
  onPendingChange: (pending: boolean) => void;
}) {
  const { mt } = useModeTranslation();
  const initial = assignment ?? { slot, channel: 1, data: 0, releaseValue: 0, pressValue: 127 };
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState(false);
  const pending = JSON.stringify(initial) !== JSON.stringify(draft);
  useEffect(() => { onPendingChange(pending); return () => onPendingChange(false); }, [pending, onPendingChange]);
  return <form aria-label={mt('interface')} onSubmit={event => {
    event.preventDefault();
    if (onApply(draft) === false) { setError(true); return; }
    setError(false);
  }}>
    <div className="mode-settings">
      <NumberField label={mt('channel')} min={1} max={16} value={draft.channel} onChange={channel => setDraft({ ...draft, channel })} />
      <NumberField label={mt('data')} value={draft.data} onChange={data => setDraft({ ...draft, data })} />
      <NumberField label={mt('releaseValue')} value={draft.releaseValue} onChange={releaseValue => setDraft({ ...draft, releaseValue })} />
      <NumberField label={mt('pressValue')} value={draft.pressValue} onChange={pressValue => setDraft({ ...draft, pressValue })} />
    </div>
    <div className="button-row"><button className="secondary" type="submit" disabled={!!assignment && !pending}>{mt(assignment ? 'applySettings' : 'addAssignment')}</button>
      {pending && <button className="text-button" type="button" onClick={() => { setDraft(initial); setError(false); }}>{mt('discard')}</button>}
      {assignment && <button className="text-button" type="button" disabled={pending} onClick={() => { if (onClear() === false) setError(true); }}>{mt('removeAssignment')}</button>}
    </div>
    {error && <p className="warning-text" role="alert">{mt('error')}</p>}
  </form>;
}

export function InterfaceEditor({ configuration, onChange, confirm, onPendingChange, disabled = false }: {
  configuration: StudioConfiguration;
  onChange: (configuration: StudioConfiguration) => boolean | void;
  confirm: GuidedEditorProps['confirm'];
  onPendingChange: (pending: boolean) => void;
  disabled?: boolean;
}) {
  const { mt, locale } = useModeTranslation();
  const [slot, setSlot] = useState(configuration.controller?.interfaceAssignments?.[0]?.slot ?? 0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  const reportPending = useCallback((value: boolean) => { setPending(value); onPendingChange(value); }, [onPendingChange]);
  useEffect(() => () => onPendingChange(false), [onPendingChange]);
  const settings = configuration.controller ?? {};
  const assignment = settings.interfaceAssignments?.find(entry => entry.slot === slot);
  return <details className="mode-global-settings interface-editor"><summary>{mt('interface')}</summary><fieldset className="guided-fields" disabled={disabled}>
    <fieldset className="guided-fields" disabled={pending}><div className="mode-settings">
      <label className="field"><span>{mt('interfaceType')}</span><select value={settings.interfaceType ?? ''} onChange={event => setError(onChange({ ...configuration, controller: { ...settings, interfaceType: Number(event.target.value) } }) === false)}>
        {settings.interfaceType === undefined && <option value="" disabled>{mt('preserve')}</option>}<option value={0}>{mt('expression')}</option><option value={1}>{mt('trsMidi')}</option>
      </select></label>
      <label className="field"><span>{mt('command')}</span><select value={settings.interfaceCommand ?? ''} onChange={event => setError(onChange({ ...configuration, controller: { ...settings, interfaceCommand: Number(event.target.value) } }) === false)}>
        {settings.interfaceCommand === undefined && <option value="" disabled>{mt('preserve')}</option>}{CONTROLLER_INTERFACE_COMMANDS.map(command => <option key={command.index} value={command.index}>{command.label[locale]}</option>)}
      </select></label>
    </div></fieldset>
    <label className="field"><span>{mt('slot')}</span><select value={slot} onChange={event => {
      const next = Number(event.target.value);
      if (!pending) { setSlot(next); return; }
      confirm(mt('discard'), mt('discard'), () => { setRevision(value => value + 1); setSlot(next); });
    }}>{Array.from({ length: 16 }, (_, index) => <option value={index} key={index}>{mt('slot')} {index + 1}</option>)}</select></label>
    <AssignmentForm key={`${slot}:${revision}:${JSON.stringify(assignment)}`} slot={slot} {...(assignment ? { assignment } : {})} onPendingChange={reportPending}
      onApply={next => onChange({ ...configuration, controller: { ...settings, interfaceAssignments: [...(settings.interfaceAssignments ?? []).filter(entry => entry.slot !== slot), next], clearedInterfaceSlots: settings.clearedInterfaceSlots?.filter(value => value !== slot) } })}
      onClear={() => onChange({ ...configuration, controller: { ...settings, interfaceAssignments: settings.interfaceAssignments?.filter(entry => entry.slot !== slot), clearedInterfaceSlots: [...new Set([...(settings.clearedInterfaceSlots ?? []), slot])] } })} />
    {error && <p className="warning-text" role="alert">{mt('error')}</p>}
  </fieldset></details>;
}
