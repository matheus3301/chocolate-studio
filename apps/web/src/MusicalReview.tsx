import { useTranslation } from 'react-i18next';
import { SWITCH_IDS, getEquipmentProfile, localizeEquipmentText } from '@chocolate-studio/midi';
import type { MidiMessage, StudioConfiguration, SwitchConfiguration } from '@chocolate-studio/midi';

export function MusicalReview({ before, after, device = false }: { before: StudioConfiguration; after: StudioConfiguration; device?: boolean }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'pt-BR' ? 'pt-BR' : 'en';
  const midiOnly = (pedal: SwitchConfiguration | undefined) => pedal && { behavior: pedal.behavior ?? 'single', actions: pedal.actions.map(action => ({ gesture: action.gesture, messages: action.messages.map(({ destinationId: _, ...message }) => message) })), secondary: (pedal.secondaryMessages ?? []).map(({ destinationId: _, ...message }) => message) };
  const groups = new Set([...before.groups.map((group) => group.id), ...after.groups.map((group) => group.id)]);
  const slots = device ? Array.from({ length: Math.max(before.groups.length, after.groups.length) }, (_, index) => String(index)) : [...groups];
  const rows = slots.flatMap((id) => {
    const previous = device ? before.groups[Number(id)] : before.groups.find((group) => group.id === id);
    const next = device ? after.groups[Number(id)] : after.groups.find((group) => group.id === id);
    return SWITCH_IDS.flatMap((switchId) => {
      const a = previous?.switches[switchId];
      const b = next?.switches[switchId];
      return JSON.stringify(device ? midiOnly(a) : a) === JSON.stringify(device ? midiOnly(b) : b) ? [] : [{ id: `${id}-${switchId}`, name: next?.name ?? previous!.name, switchId, before: a, after: b }];
    });
  });
  function messageSummary(message: MidiMessage, configuration: StudioConfiguration): string {
    const destination = configuration.destinations.find((entry) => entry.id === message.destinationId)?.name;
    const parts = [message.type === 'pc' ? `PC ${message.program}` : `CC ${message.controller} → ${message.value}`, `${t('channel')} ${message.channel}`];
    if (message.type === 'pc' && message.bank) {
      if (message.bank.msb !== undefined) parts.push(`MSB ${message.bank.msb}`);
      if (message.bank.lsb !== undefined) parts.push(`LSB ${message.bank.lsb}`);
    }
    if (destination) parts.push(destination);
    return parts.join(' · ');
  }
  function pedalSummary(pedal: SwitchConfiguration | undefined, configuration: StudioConfiguration) {
    if (!pedal) return <p>{t('none')}</p>;
    function sequenceSummary(sequence: 'primary' | 'secondary', messages: MidiMessage[]) {
      const binding = pedal!.actionBindings?.[sequence];
      const profile = binding && getEquipmentProfile(binding.modelId, binding.profileVersion);
      const action = profile && profile.actions.find(entry => entry.id === binding!.actionId);
      const destination = binding && configuration.destinations.find(entry => entry.id === binding.destinationId);
      return action && destination && binding ? <>
        <p>{destination.name} · {localizeEquipmentText(action.label, locale)}{Object.entries(action.parameters).map(([key, parameter]) => ` · ${localizeEquipmentText(parameter.label, locale)}: ${binding.parameters[key]}`).join('')} · {t('channel')} {destination.channel}</p>
        <details><summary>{t('technicalDetails')}</summary><ol>{messages.map((message, index) => <li key={index}>{messageSummary(message, configuration)}</li>)}</ol></details>
      </> : messages.length ? <ol>{messages.map((message, index) => <li key={index}>{messageSummary(message, configuration)}</li>)}</ol> : <p>—</p>;
    }
    const tapLabel = pedal.behavior === 'shortLong' ? (locale === 'pt-BR' ? 'Ao tocar' : 'On tap') : `${t('primary')} · ${t(pedal.actions[0]?.gesture ?? 'press')}`;
    const holdLabel = pedal.behavior === 'shortLong' ? (locale === 'pt-BR' ? 'Ao segurar' : 'On hold') : t('secondary');
    return <><p className="review-behavior">{pedal.label} · {t(pedal.behavior ?? 'single')}</p>
      <div className="review-sequence"><strong>{tapLabel}</strong>{sequenceSummary('primary', pedal.actions[0]?.messages ?? [])}</div>
      {(pedal.secondaryMessages?.length || pedal.behavior === 'shortLong') ? <div className="review-sequence"><strong>{holdLabel}</strong>{sequenceSummary('secondary', pedal.secondaryMessages ?? [])}</div> : null}
      {pedal.actions.slice(1).map((action) => <div className="review-sequence" key={action.gesture}><strong>{t(action.gesture)}</strong><ol>{action.messages.map((message, index) => <li key={index}>{messageSummary(message, configuration)}</li>)}</ol></div>)}</>;
  }
  return <section className="musical-review" aria-label={t('musicalChanges')}><h3>{t('musicalChanges')}</h3>{!rows.length && <p className="helper">{locale === 'pt-BR' ? 'Nenhuma ação mudou.' : 'No actions changed.'}</p>}{rows.map((row) => <article className="musical-change" key={row.id}><h3>{row.name} / {t('switch')} {row.switchId}</h3><div className="musical-columns"><div><span className="eyebrow">{device ? (locale === 'pt-BR' ? 'No controlador' : 'On controller') : t('before')}</span>{pedalSummary(row.before, before)}</div><div><span className="eyebrow">{device ? (locale === 'pt-BR' ? 'Depois de gravar' : 'After saving') : t('after')}</span>{pedalSummary(row.after, after)}</div></div></article>)}</section>;
}
