import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { Destination, MidiMessage, ProgramChange } from '@chocolate-studio/midi';

export type IconName = 'board' | 'preset' | 'destination' | 'backup' | 'download' | 'upload' | 'plus' | 'close' | 'check' | 'arrow' | 'activity';
const paths: Record<IconName, string> = {
  board: 'M3 5h18v14H3z M7 9v3 M12 9v3 M17 9v3 M6 16h2 M11 16h2 M16 16h2',
  preset: 'M6 3h12v18l-6-4-6 4z M9 7h6 M9 10h6',
  destination: 'M7 3v5 M17 3v5 M5 8h14v4a7 7 0 0 1-14 0z M12 19v3',
  backup: 'M3 7h18v14H3z M7 7V3h10v4 M9 11h6 M12 11v6 M9 14l3 3 3-3',
  download: 'M12 3v12 M7 10l5 5 5-5 M4 17v4h16v-4',
  upload: 'M12 16V4 M7 9l5-5 5 5 M4 17v4h16v-4',
  plus: 'M12 5v14 M5 12h14', close: 'M6 6l12 12 M18 6 6 18', check: 'M5 12l4 4 10-10',
  arrow: 'M4 12h16 M14 6l6 6-6 6', activity: 'M2 12h4l3-8 6 16 3-8h4',
};
export function Icon({ name }: { name: IconName }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]} /></svg>;
}

export function NumberField({ label, value, min = 0, max = 127, onChange }: { label: string; value: number; min?: number; max?: number; onChange: (value: number) => void }) {
  const { t } = useTranslation();
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const valid = text !== '' && Number.isInteger(Number(text)) && Number(text) >= min && Number(text) <= max;
  return <label className="field numeric"><span>{label}</span><input type="number" inputMode="numeric" min={min} max={max} step={1} required value={text}
    aria-invalid={!valid} title={t('numericHint', { min, max })}
    onChange={(event) => {
      const next = event.currentTarget.value;
      setText(next);
      const number = Number(next);
      if (next !== '' && Number.isInteger(number) && number >= min && number <= max) onChange(number);
    }} onBlur={() => { if (!valid) setText(String(value)); }} /></label>;
}

export function NameField({ label, value, max = 128, onChange, className = '', disabled = false }: { label: string; value: string; max?: number; onChange: (value: string) => void; className?: string; disabled?: boolean }) {
  return <label className={`field ${className}`}><span>{label}</span><input value={value} maxLength={max} required disabled={disabled} onChange={(event) => onChange(event.currentTarget.value)} /></label>;
}

export function DestinationField({ destinations, value, onChange }: { destinations: Destination[]; value: string | undefined; onChange: (id: string) => void }) {
  const { t } = useTranslation();
  return <label className="field"><span>{t('destination')}</span><select value={value ?? ''} onChange={(event) => onChange(event.currentTarget.value)}><option value="">{t('unassigned')}</option>{destinations.map((destination) => <option key={destination.id} value={destination.id}>{destination.name}</option>)}</select></label>;
}

export function BankFields({ message, onChange }: { message: ProgramChange; onChange: (message: ProgramChange) => void }) {
  const { t } = useTranslation();
  return <fieldset className="bank-fields"><legend>{t('bankSelect')}</legend>{(['msb', 'lsb'] as const).map((key) => <div key={key}>
    <label className="check"><input type="checkbox" checked={message.bank?.[key] !== undefined} onChange={(event) => {
      const bank = { ...message.bank };
      if (event.currentTarget.checked) bank[key] = 0;
      else delete bank[key];
      const next = { ...message };
      if (bank.msb === undefined && bank.lsb === undefined) delete next.bank;
      else next.bank = bank;
      onChange(next);
    }} />{t(key === 'msb' ? 'useMsb' : 'useLsb')}</label>
    {message.bank?.[key] !== undefined && <NumberField label={t(key)} value={message.bank[key]} onChange={(value) => onChange({ ...message, bank: { ...message.bank, [key]: value } })} />}
  </div>)}</fieldset>;
}

export function MessageFields({ message, destinations, onChange }: { message: MidiMessage; destinations: Destination[]; onChange: (message: MidiMessage) => void }) {
  const { t } = useTranslation();
  return <><div className="message-fields"><DestinationField destinations={destinations} value={message.destinationId} onChange={(id) => {
    const next = { ...message };
    if (id) {
      next.destinationId = id;
      next.channel = destinations.find((destination) => destination.id === id)!.channel;
    }
    else delete next.destinationId;
    onChange(next);
  }} /><NumberField label={t('channel')} min={1} max={16} value={message.channel} onChange={(channel) => onChange({ ...message, channel })} />
    {message.type === 'pc'
      ? <NumberField label={t('program')} value={message.program} onChange={(program) => onChange({ ...message, program })} />
      : <><NumberField label={t('controller')} value={message.controller} onChange={(controller) => onChange({ ...message, controller })} /><NumberField label={t('value')} value={message.value} onChange={(value) => onChange({ ...message, value })} /></>}
  </div>{message.type === 'pc' && <BankFields message={message} onChange={onChange} />}
    {message.type === 'cc' && message.controller >= 120 && <p className="warning-text">{t('modeWarning')}</p>}</>;
}

export function Dialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return <dialog ref={ref} aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="dialog-body"><header className="section-heading"><h2 id={titleId}>{title}</h2><button className="icon-button" onClick={onClose} aria-label={t('close')}><Icon name="close" /></button></header>{children}</div>
  </dialog>;
}

export function Empty({ title, detail }: { title: string; detail: string }) {
  return <div className="empty"><span className="empty-line" aria-hidden="true" /><h3>{title}</h3><p>{detail}</p></div>;
}
