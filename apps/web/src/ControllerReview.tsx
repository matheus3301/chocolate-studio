import { CONTROLLER_CUSTOM_COMMANDS, CONTROLLER_INTERFACE_COMMANDS, SWITCH_IDS, effectiveControllerMode, getControllerMode } from '@chocolate-studio/midi';
import type { InterfaceAssignment, MixedAssignment, StudioConfiguration } from '@chocolate-studio/midi';
import { FCP_TURNER_KEYS } from '@chocolate-studio/chocolate-layout';
import { MusicalReview } from './MusicalReview.js';
import { formatKeyboardCombination } from './ShortcutEditor.js';
import { useModeTranslation } from './mode-i18n.js';

export function ControllerReview({ before, after, beforeMode, device = false }: { before: StudioConfiguration; after: StudioConfiguration; beforeMode?: number; device?: boolean }) {
  const { mt, locale } = useModeTranslation();
  const raw = effectiveControllerMode(after);
  const oldMode = getControllerMode(beforeMode ?? effectiveControllerMode(before));
  const nextMode = getControllerMode(raw);
  const fields = [
    { field: 'interfaceType', label: mt('interfaceType'), kind: 'interface' },
    { field: 'channelIndex', label: mt('channel'), kind: 'count' },
    ...SWITCH_IDS.map(pedal => ({ field: `customCommand${pedal}` as const, label: `${mt('switch')} ${pedal} · ${mt('command')}`, kind: 'custom' as const })),
    { field: 'interfaceCommand', label: `${mt('interface')} · ${mt('command')}`, kind: 'command' },
    { field: 'pcMaxGroupIndex', label: `PC · ${mt('lastNumber')}`, kind: 'range' },
    { field: 'ccMaxGroupIndex', label: `CC · ${mt('lastNumber')}`, kind: 'range' },
    { field: 'advancedMaxGroupIndex', label: `Advanced · ${mt('groups')}`, kind: 'count' },
    { field: 'advancedGroupIndex', label: `Advanced · ${mt('currentGroup')}`, kind: 'count' },
    { field: 'keyboardGroupIndex', label: `${mt('keyboardGroup')} · ${mt('currentGroup')}`, kind: 'count' },
    { field: 'mixGroupIndex', label: `${mt('mixed')} · ${mt('currentGroup')}`, kind: 'count' },
    { field: 'polarity', label: mt('polarity'), kind: 'flag' },
    { field: 'pcDisplay', label: mt('pcDisplay'), kind: 'flag' },
    { field: 'bankMidi', label: mt('bankMidi'), kind: 'expert' },
    ...SWITCH_IDS.map(pedal => ({ field: `visual${pedal}` as const, label: `${mt('visual')} · ${pedal}`, kind: 'expert' as const })),
  ] as const;
  function scalar(value: number | undefined, kind: typeof fields[number]['kind']) {
    if (value === undefined) return '—';
    if (kind === 'count') return String(value + 1);
    if (kind === 'range') return String(value * 4 + 3).padStart(3, '0');
    if (kind === 'interface') return mt(value === 0 ? 'expression' : 'trsMidi');
    if (kind === 'custom') return CONTROLLER_CUSTOM_COMMANDS.find(command => command.index === value)?.label[locale] ?? '—';
    if (kind === 'command') return CONTROLLER_INTERFACE_COMMANDS.find(command => command.index === value)?.label[locale] ?? '—';
    return mt(value ? 'enabled' : 'disabled');
  }
  const changes = fields.flatMap(({ field, label, kind }) => {
    const oldValue = before.controller?.[field]; const value = after.controller?.[field];
    return value !== undefined && value !== oldValue ? [{ field, label, kind, before: scalar(oldValue, kind), after: scalar(value, kind) }] : [];
  });
  function mixedSummary(assignment: MixedAssignment | undefined) {
    if (!assignment) return '—';
    if (assignment.typeCode === 0) return mt('midiAction');
    if (assignment.typeCode === 1) return `${mt('keyboardAction')} · ${assignment.combination ? formatKeyboardCombination(assignment.combination, locale) : mt('preserve')}`;
    const key = assignment.turnerKeyIndex;
    return `${mt('pageAction')} · ${key === undefined ? mt('preserve') : locale === 'pt-BR' ? ['Seta para cima', 'Seta para baixo', 'Seta para a esquerda', 'Seta para a direita', 'Página anterior', 'Próxima página', 'Faixa anterior', 'Próxima faixa', 'Diminuir volume', 'Aumentar volume'][key] : FCP_TURNER_KEYS[key]}`;
  }
  function interfaceSummary(assignment: InterfaceAssignment | undefined) {
    return assignment ? `${mt('channel')} ${assignment.channel} · ${mt('data')} ${assignment.data} · ${mt('releaseValue')} ${assignment.releaseValue} · ${mt('pressValue')} ${assignment.pressValue}` : mt('cleared');
  }
  const interfaceSlots = new Set([...(before.controller?.interfaceAssignments ?? []).map(entry => entry.slot), ...(after.controller?.interfaceAssignments ?? []).map(entry => entry.slot)]);
  return <section className="controller-review" aria-label={mt('settings')}>
    <h3>{mt('mode')}</h3><p className="mode-review-change"><span>{oldMode?.label[locale] ?? mt('unknown')}</span><span aria-hidden="true">→</span><strong>{nextMode?.label[locale] ?? mt('unknown')}</strong></p>
    <dl className="mode-review-fields">{changes.filter(change => change.kind !== 'expert').map(change => <div key={change.field}><dt>{change.label}</dt><dd>{change.before} → {change.after}</dd></div>)}
      {(!device || raw === 10) && after.controller?.keyboardAssignments?.map(entry => {
        const previous = before.controller?.keyboardAssignments?.find(value => value.groupIndex === entry.groupIndex && value.switchId === entry.switchId);
        if (JSON.stringify(previous?.combination) === JSON.stringify(entry.combination)) return null;
        return <div key={`keyboard:${entry.groupIndex}:${entry.switchId}`}><dt>{mt('keyboardGroup')} {entry.groupIndex + 1} · {entry.switchId}</dt><dd>{previous ? formatKeyboardCombination(previous.combination, locale) : '—'} → {formatKeyboardCombination(entry.combination, locale)}</dd></div>;
      })}
      {(!device || raw === 11) && after.controller?.mixedAssignments?.map(entry => {
        const previous = before.controller?.mixedAssignments?.find(value => value.groupIndex === entry.groupIndex && value.switchId === entry.switchId);
        if (mixedSummary(previous) === mixedSummary(entry)) return null;
        return <div key={`mixed:${entry.groupIndex}:${entry.switchId}`}><dt>{mt('mixed')} · {mt('group')} {entry.groupIndex + 1} · {entry.switchId}</dt><dd>{mixedSummary(previous)} → {mixedSummary(entry)}</dd></div>;
      })}
      {[...interfaceSlots].map(slot => {
        const previous = before.controller?.interfaceAssignments?.find(entry => entry.slot === slot); const next = after.controller?.interfaceAssignments?.find(entry => entry.slot === slot);
        if (interfaceSummary(previous) === interfaceSummary(next)) return null;
        return <div key={`interface:${slot}`}><dt>{mt('interface')} · {mt('slot')} {slot + 1}</dt><dd>{interfaceSummary(previous)} → {interfaceSummary(next)}</dd></div>;
      })}
    </dl>
    {changes.some(change => change.kind === 'expert') && <details><summary>{mt('expert')}</summary><p className="helper">{mt('expertHint')}</p><dl className="mode-review-fields">{changes.filter(change => change.kind === 'expert').map(change => <div key={change.field}><dt>{change.label}</dt><dd>{change.before} → {change.after}</dd></div>)}</dl></details>}
    {(!device || raw === 11) && after.mixedGroups && <section aria-label={mt('mixed')}><h3>{mt('mixed')}</h3><MusicalReview device={device} before={{ ...before, groups: before.mixedGroups ?? [], mixedGroups: undefined }} after={{ ...after, groups: after.mixedGroups, mixedGroups: undefined }} /></section>}
  </section>;
}
