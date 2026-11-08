import { useId, useState } from 'react';
import { CONTROLLER_MODES, effectiveControllerMode, getControllerMode } from '@chocolate-studio/midi';
import type { StudioConfiguration } from '@chocolate-studio/midi';
import { useModeTranslation } from './mode-i18n.js';

export function ModeStep({ configuration, currentMode, onChange, onComplete, onBack, disabled = false }: {
  configuration: StudioConfiguration;
  currentMode?: number;
  onChange: (configuration: StudioConfiguration) => boolean | void;
  onComplete: (mode: number) => void;
  onBack: () => void;
  disabled?: boolean;
}) {
  const { mt, locale } = useModeTranslation();
  const id = useId();
  const [selected, setSelected] = useState(effectiveControllerMode(configuration));
  const [error, setError] = useState(false);
  const mode = getControllerMode(selected);
  const original = currentMode ?? effectiveControllerMode(configuration);
  const current = getControllerMode(original);
  const categories = [
    { label: mt('midi'), modes: CONTROLLER_MODES.filter(entry => entry.raw <= 4) },
    { label: mt('keyboard'), modes: CONTROLLER_MODES.filter(entry => entry.raw >= 5 && entry.raw <= 11) },
    { label: mt('other'), modes: CONTROLLER_MODES.filter(entry => entry.raw === 12) },
  ];
  return <section className="setup-card guided-setup" aria-labelledby={`${id}-title`}>
    <header><h1 id={`${id}-title`}>{mt('title')}</h1><p>{mt('intro')}</p></header>
    <p className="mode-current">{mt(currentMode === undefined ? 'draft' : 'current')}: <strong>{current?.label[locale] ?? mt('unknown')}</strong></p>
    <form onSubmit={event => {
      event.preventDefault();
      if (onChange({ ...configuration, controller: { ...configuration.controller, mode: selected } }) === false) { setError(true); return; }
      onComplete(selected);
    }}>
      <fieldset className="guided-fields" disabled={disabled}>
        <label className="field"><span>{mt('mode')}</span><select value={selected} onChange={event => { setSelected(Number(event.target.value)); setError(false); }}>
          {!mode && <option value={selected}>{mt('unknown')}</option>}
          {categories.map(category => <optgroup label={category.label} key={category.label}>{category.modes.map(entry => <option value={entry.raw} key={entry.id}>{entry.label[locale]}</option>)}</optgroup>)}
        </select></label>
        {mode && <p className="mode-description">{mode.description[locale]}</p>}
        <p className="helper">{mt('recommended')}</p>
        <p className="helper" role="status">{mt(selected === original ? 'kept' : 'changed')}</p>
        {error && <p className="warning-text" role="alert">{mt('error')}</p>}
        <div className="guided-step-actions"><button className="secondary" type="button" onClick={onBack}>{mt('back')}</button><button className="primary" type="submit" disabled={!mode}>{mt('continue')}</button></div>
      </fieldset>
    </form>
  </section>;
}
