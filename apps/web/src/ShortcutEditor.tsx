import { useEffect, useId, useState } from 'react';
import { FCP_KEYBOARD_KEYS, FCP_KEYBOARD_MODIFIERS } from '@chocolate-studio/chocolate-layout';
import type { KeyboardCombination } from '@chocolate-studio/chocolate-layout';
import { useModeTranslation } from './mode-i18n.js';

const keyPt: Record<string, string> = {
  None: 'Nenhuma', Up: 'Seta para cima', Down: 'Seta para baixo', Left: 'Seta para a esquerda', Right: 'Seta para a direita',
  'Page Up': 'Página anterior', 'Page Down': 'Próxima página', Space: 'Espaço', Enter: 'Enter', Escape: 'Esc',
  Delete: 'Excluir', 'Caps Lock': 'Caps Lock', Tab: 'Tab',
};

export function formatKeyboardCombination(combination: KeyboardCombination, locale: 'en' | 'pt-BR'): string {
  const modifiers = [combination.modifier1, combination.modifier2].filter(value => value !== 0).map(value => FCP_KEYBOARD_MODIFIERS[value]);
  const key = FCP_KEYBOARD_KEYS[combination.key] ?? '';
  return [...modifiers, locale === 'pt-BR' ? keyPt[key] ?? key : key].join(' + ');
}

export function ShortcutEditor({ combination, onChange, onPendingChange }: {
  combination?: KeyboardCombination;
  onChange: (combination: KeyboardCombination) => boolean | void;
  onPendingChange: (pending: boolean) => void;
}) {
  const { mt, locale } = useModeTranslation();
  const validationId = useId();
  const initial = combination ?? { modifier1: 0, modifier2: 0, key: 0 };
  const [draft, setDraft] = useState(initial);
  const [edited, setEdited] = useState(false);
  const [error, setError] = useState(false);
  const pending = edited && (!combination || draft.key !== initial.key || draft.modifier1 !== initial.modifier1 || draft.modifier2 !== initial.modifier2);
  const distinctModifiers = draft.modifier1 === 0 || draft.modifier1 !== draft.modifier2;
  useEffect(() => { onPendingChange(pending); return () => onPendingChange(false); }, [pending, onPendingChange]);
  return <form className="shortcut-editor" aria-label={mt('shortcut')} onSubmit={event => {
    event.preventDefault();
    if (!distinctModifiers) return;
    if (onChange(draft) === false) { setError(true); return; }
    setEdited(false); setError(false);
  }}>
    <h2>{mt('shortcut')}</h2>
    <div className="mode-settings">
      {(['modifier1', 'modifier2'] as const).map((field, index) => <label className="field" key={field}><span>{mt(index === 0 ? 'modifier1' : 'modifier2')}</span><select value={draft[field]} aria-invalid={!distinctModifiers} aria-describedby={!distinctModifiers ? validationId : undefined} onChange={event => { setDraft({ ...draft, [field]: Number(event.target.value) }); setEdited(true); setError(false); }}>
        {FCP_KEYBOARD_MODIFIERS.map((modifier, value) => <option key={modifier} value={value} disabled={value !== 0 && draft[field === 'modifier1' ? 'modifier2' : 'modifier1'] === value}>{value === 0 ? mt('none') : modifier}</option>)}
      </select></label>)}
      <label className="field"><span>{mt('key')}</span><select value={draft.key} onChange={event => { setDraft({ ...draft, key: Number(event.target.value) }); setEdited(true); setError(false); }}>{FCP_KEYBOARD_KEYS.map((key, value) => <option key={key} value={value}>{locale === 'pt-BR' ? keyPt[key] ?? key : key}</option>)}</select></label>
    </div>
    {!combination && <p className="helper">{mt('shortcutPreserved')}</p>}
    {!distinctModifiers && <p className="warning-text" role="alert" id={validationId}>{mt('distinctModifiers')}</p>}
    {error && <p className="warning-text" role="alert">{mt('error')}</p>}
    <div className="button-row"><button className="secondary" type="submit" disabled={!pending || !distinctModifiers}>{mt('applyShortcut')}</button>{pending && <button className="text-button" type="button" onClick={() => { setDraft(initial); setEdited(false); setError(false); }}>{mt('discard')}</button>}</div>
  </form>;
}
