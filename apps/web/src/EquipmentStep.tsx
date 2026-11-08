import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CONFIGURATION_LIMITS, equipmentProfiles, localizeEquipmentText } from '@chocolate-studio/midi';
import type { EquipmentProfile, StudioConfiguration } from '@chocolate-studio/midi';
import { NameField, NumberField } from './components.js';
import { validConfiguration } from './editor.js';
import { destinationHasBindings } from './guided-actions.js';

export interface EquipmentStepProps {
  configuration: StudioConfiguration;
  onChange: (next: StudioConfiguration) => boolean | void;
  onComplete: (destinationId: string) => void;
  onBack?: () => void;
  destinationId?: string;
  disabled?: boolean;
  profiles?: readonly EquipmentProfile[];
}

const profileKey = (profile: { modelId: string; profileVersion: string }) => `${profile.modelId}@${profile.profileVersion}`;

export function EquipmentStep({ configuration, onChange, onComplete, onBack, destinationId, disabled = false, profiles = equipmentProfiles }: EquipmentStepProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage === 'en' ? 'en' : 'pt-BR';
  const initial = configuration.destinations.find((entry) => entry.id === destinationId);
  const [existingId, setExistingId] = useState(initial?.id ?? '');
  const [choice, setChoice] = useState(initial?.profile ? profileKey(initial.profile) : initial ? 'advanced' : '');
  const [name, setName] = useState(initial?.name ?? '');
  const [channel, setChannel] = useState(initial?.channel ?? 1);
  const [error, setError] = useState(false);
  const formId = useId();
  const profile = profiles.find((entry) => profileKey(entry) === choice);
  const existing = configuration.destinations.find((entry) => entry.id === existingId);
  const newInstance = !!existing && (profileKey(existing.profile ?? { modelId: '', profileVersion: '' }) !== (profile ? profileKey(profile) : profileKey({ modelId: '', profileVersion: '' }))
    || existing.channel !== channel && destinationHasBindings(configuration, existing.id));

  function selectExisting(id: string) {
    const destination = configuration.destinations.find((entry) => entry.id === id);
    setExistingId(id);
    setChoice(destination?.profile ? profileKey(destination.profile) : destination ? 'advanced' : '');
    setName(destination?.name ?? '');
    setChannel(destination?.channel ?? 1);
    setError(false);
  }
  function selectProfile(value: string) {
    setChoice(value);
    if (!name.trim()) {
      const selected = profiles.find((entry) => profileKey(entry) === value);
      setName(selected ? localizeEquipmentText(selected.label, locale) : t('newDestination'));
    }
    setError(false);
  }
  function complete() {
    if (!choice || !name.trim() || choice !== 'advanced' && !profile) { setError(true); return; }
    const id = existing && !newInstance ? existing.id : crypto.randomUUID();
    const destination = { id, name: name.trim(), channel, ...(profile ? { profile: { modelId: profile.modelId, profileVersion: profile.profileVersion } } : {}) };
    const destinations = existing && !newInstance
      ? configuration.destinations.map((entry) => entry.id === id ? destination : entry)
      : [...configuration.destinations, destination];
    try {
      const next = validConfiguration({ ...configuration, ...(profile ? { formatVersion: 2 as const } : {}), destinations });
      if (onChange(next) === false) { setError(true); return; }
      setError(false);
      onComplete(id);
    } catch {
      setError(true);
    }
  }

  return <section className="setup-card guided-setup" aria-labelledby={`${formId}-title`}>
    <header><h1 id={`${formId}-title`}>{t('guided.equipmentTitle')}</h1><p>{t('guided.equipmentIntro')}</p></header>
    <form onSubmit={(event) => { event.preventDefault(); complete(); }}>
      <fieldset disabled={disabled} className="guided-fields">
        {!!configuration.destinations.length && <label className="field"><span>{t('guided.equipmentInstance')}</span><select value={existingId} onChange={(event) => selectExisting(event.target.value)}>
          <option value="">{t('guided.newEquipment')}</option>{configuration.destinations.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
        </select></label>}
        <fieldset className="equipment-options"><legend>{t('guided.equipmentProfile')}</legend>
          {profiles.map((entry) => <label className="equipment-option" key={profileKey(entry)} data-selected={choice === profileKey(entry)}>
            <input type="radio" name={`${formId}-profile`} required value={profileKey(entry)} checked={choice === profileKey(entry)} onChange={() => selectProfile(profileKey(entry))} />
            <span>{localizeEquipmentText(entry.label, locale)}</span>
          </label>)}
          <label className="equipment-option" data-selected={choice === 'advanced'}><input type="radio" name={`${formId}-profile`} required value="advanced" checked={choice === 'advanced'} onChange={() => selectProfile('advanced')} /><span>{t('guided.otherEquipment')}<small>{t('guided.otherEquipmentHint')}</small></span></label>
        </fieldset>
        <div className="guided-setup-fields"><NameField label={t('destinationName')} max={CONFIGURATION_LIMITS.nameLength} value={name} onChange={setName} />
          <NumberField label={t('defaultChannel')} min={1} max={16} value={channel} onChange={setChannel} /></div>
        <p className="helper">{t('guided.channelHint')}</p>
        {newInstance && <p className="warning-text">{t('guided.newInstanceHint')}</p>}
        {profile && <details className="guided-connection-help"><summary>{t('guided.connectionHelp')}</summary><p>{localizeEquipmentText(profile.connection.instructions, locale)}</p></details>}
        {error && <p className="warning-text" role="alert">{t('guided.changeRejected')}</p>}
        <div className="guided-step-actions">{onBack && <button type="button" className="secondary" onClick={onBack}>{t('guided.back')}</button>}<button type="submit" className="primary" disabled={!choice || !name.trim()}>{t('guided.editSwitches')}</button></div>
      </fieldset>
    </form>
  </section>;
}
