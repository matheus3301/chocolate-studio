import { useTranslation } from 'react-i18next';
import type { SwitchBehavior } from '@chocolate-studio/midi';

const en = {
  equipmentActions: 'Equipment actions', manualMidi: 'Manual MIDI', addEquipment: 'Add equipment',
  actionFormat: 'Action format',
  selectSwitch: 'Select switch {{switch}}',
  manageEquipment: 'Manage equipment', managePresets: 'Preset library', profile: 'Equipment profile',
  add: 'Add equipment', cancel: 'Cancel', channel: 'MIDI channel', name: 'Equipment name',
  numberError: 'Enter a whole number from {{min}} to {{max}}.',
  incomplete: 'Some fields are incomplete. Return to the marked switch and gesture to finish or discard them before saving.',
  unfinished: 'Incomplete fields', discard: 'Discard incomplete fields', chooseAction: 'Choose an action',
  firstTap: 'First tap', nextTap: 'Next tap', press: 'On press', release: 'On release', stored: 'Secondary sequence (stored)',
  customize: 'Customize this switch', fixedAction: 'Fixed action',
  fixedExplanation: 'These numbers are fixed in this mode. Customizing changes the operating mode for all four switches, not just this one.',
  fixedKeyboard: 'This function is fixed in the current mode. Customizing changes the mode for the whole controller.',
  builtin: 'Built-in function; individual assignments are not exposed by the observed layout.',
  preview: 'Preview', switch: 'Switch', group: 'Group', previous: 'Previous group', next: 'Next group',
  preserve: 'Stored value not recognized; kept unchanged', replacement: 'Replace the stored MIDI sequence with this equipment action?',
  replace: 'Replace sequence', rejected: 'This edit could not be accepted. The stored configuration is unchanged.',
  equipmentHint: 'Adding or selecting equipment does not replace the stored action. Choose an action explicitly.',
  channelHint: 'This channel belongs to the destination. Add another destination to use a different channel without changing existing actions.',
  settings: 'Group settings', nameRequired: 'Enter an equipment name.',
  switchSettings: 'Switch name and behavior',
};
const pt: Record<keyof typeof en, string> = {
  equipmentActions: 'Ações do equipamento', manualMidi: 'MIDI manual', addEquipment: 'Adicionar equipamento',
  actionFormat: 'Formato da ação',
  selectSwitch: 'Selecionar botão {{switch}}',
  manageEquipment: 'Gerenciar equipamentos', managePresets: 'Biblioteca de presets', profile: 'Perfil do equipamento',
  add: 'Adicionar equipamento', cancel: 'Cancelar', channel: 'Canal MIDI', name: 'Nome do equipamento',
  numberError: 'Informe um número inteiro de {{min}} a {{max}}.',
  incomplete: 'Há campos incompletos. Volte ao botão e gesto marcados para concluir ou descartar antes de salvar.',
  unfinished: 'Campos incompletos', discard: 'Descartar campos incompletos', chooseAction: 'Escolha uma ação',
  firstTap: 'Primeiro toque', nextTap: 'Próximo toque', press: 'Ao pressionar', release: 'Ao soltar', stored: 'Sequência secundária (armazenada)',
  customize: 'Personalizar este botão', fixedAction: 'Ação fixa',
  fixedExplanation: 'Os números são fixos neste modo. Personalizar muda o modo dos quatro botões, não apenas deste.',
  fixedKeyboard: 'Esta função é fixa no modo atual. Personalizar muda o modo do controlador inteiro.',
  builtin: 'Função interna; o layout observado não expõe atribuições individuais.',
  preview: 'Visualização', switch: 'Botão', group: 'Grupo', previous: 'Grupo anterior', next: 'Próximo grupo',
  preserve: 'Valor armazenado não reconhecido; preservado', replacement: 'Substituir a sequência MIDI armazenada por esta ação do equipamento?',
  replace: 'Substituir sequência', rejected: 'Não foi possível aceitar a edição. A configuração armazenada não mudou.',
  equipmentHint: 'Adicionar ou selecionar equipamento não substitui a ação armazenada. Escolha uma ação explicitamente.',
  channelHint: 'Este canal pertence ao destino. Adicione outro destino para usar um canal diferente sem alterar ações existentes.',
  settings: 'Opções do grupo', nameRequired: 'Informe um nome para o equipamento.',
  switchSettings: 'Nome e comportamento do botão',
};

export function useWorkbenchTranslation() {
  const { i18n } = useTranslation();
  if (!i18n.hasResourceBundle('en', 'workbenchEditor')) i18n.addResourceBundle('en', 'workbenchEditor', en);
  if (!i18n.hasResourceBundle('pt-BR', 'workbenchEditor')) i18n.addResourceBundle('pt-BR', 'workbenchEditor', pt);
  const wt = (key: keyof typeof en, values: Record<string, string | number> = {}) => i18n.getFixedT(i18n.resolvedLanguage ?? i18n.language, 'workbenchEditor')(key, values);
  return { wt };
}

/** Names describe the stored behavior; a second bank is not always a hold gesture. */
export function gestureKeys(behavior: SwitchBehavior | undefined): readonly [string, string] {
  switch (behavior) {
    case 'alternate': return ['workbenchEditor:firstTap', 'workbenchEditor:nextTap'];
    case 'momentary': return ['workbenchEditor:press', 'workbenchEditor:release'];
    case 'long': return ['guided.onHold', 'workbenchEditor:stored'];
    case 'shortLong': return ['guided.onTap', 'guided.onHold'];
    default: return ['guided.onTap', 'workbenchEditor:stored'];
  }
}
