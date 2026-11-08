import { useTranslation } from 'react-i18next';
import { SWITCH_IDS } from '@chocolate-studio/midi';
import type { MidiMessage, StudioConfiguration, SwitchConfiguration } from '@chocolate-studio/midi';

export function MusicalReview({ before, after }: { before: StudioConfiguration; after: StudioConfiguration }) {
  const { t } = useTranslation();
  const groups = new Set([...before.groups.map((group) => group.id), ...after.groups.map((group) => group.id)]);
  const rows = [...groups].flatMap((id) => {
    const previous = before.groups.find((group) => group.id === id);
    const next = after.groups.find((group) => group.id === id);
    return SWITCH_IDS.flatMap((switchId) => {
      const a = previous?.switches[switchId];
      const b = next?.switches[switchId];
      return JSON.stringify(a) === JSON.stringify(b) ? [] : [{ id: `${id}-${switchId}`, name: next?.name ?? previous!.name, switchId, before: a, after: b }];
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
    return <><p className="review-behavior">{pedal.label} · {t(pedal.behavior ?? 'single')}</p>
      <div className="review-sequence"><strong>{t('primary')} · {t(pedal.actions[0]?.gesture ?? 'press')}</strong>{pedal.actions[0]?.messages.length ? <ol>{pedal.actions[0].messages.map((message, index) => <li key={index}>{messageSummary(message, configuration)}</li>)}</ol> : <p>—</p>}</div>
      <div className="review-sequence"><strong>{t('secondary')}</strong>{pedal.secondaryMessages?.length ? <ol>{pedal.secondaryMessages.map((message, index) => <li key={index}>{messageSummary(message, configuration)}</li>)}</ol> : <p>—</p>}</div>
      {pedal.actions.slice(1).map((action) => <div className="review-sequence" key={action.gesture}><strong>{t(action.gesture)}</strong><ol>{action.messages.map((message, index) => <li key={index}>{messageSummary(message, configuration)}</li>)}</ol></div>)}</>;
  }
  return <section className="musical-review" aria-label={t('musicalChanges')}><h3>{t('musicalChanges')}</h3>{!rows.length && <p className="helper">{t('noChanges')}</p>}{rows.map((row) => <article className="musical-change" key={row.id}><h3>{row.name} / {t('switch')} {row.switchId}</h3><div className="musical-columns"><div><span className="eyebrow">{t('before')}</span>{pedalSummary(row.before, before)}</div><div><span className="eyebrow">{t('after')}</span>{pedalSummary(row.after, after)}</div></div></article>)}</section>;
}
