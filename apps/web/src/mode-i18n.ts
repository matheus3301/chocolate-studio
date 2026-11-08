import { useTranslation } from 'react-i18next';

const en = {
  title: 'How do you want to use your Chocolate?', intro: 'Keep the current mode or choose a different way to use the four switches.',
  mode: 'Operating mode', midi: 'MIDI equipment', keyboard: 'Phone, computer & keyboard', other: 'Other uses',
  current: 'On the controller', draft: 'In this draft', unknown: 'Current mode (not in this catalog)',
  recommended: 'For your own musical actions, choose Custom MIDI actions (Advanced).',
  continue: 'Use this mode', back: 'Back', change: 'Change mode', settings: 'Mode settings',
  changed: 'The mode will change only after you review and save to Chocolate.',
  kept: 'This keeps the current mode. Nothing is sent now.',
  error: 'Could not apply this choice. Your draft was kept.',
  channel: 'MIDI channel', groups: 'Number of groups', group: 'Group',
  fixedPc: 'Each switch selects a program. E/F moves through groups of four.',
  fixedCc: 'Each switch sends a sequential CC number with value 0. E/F moves through groups of four.',
  fixedRange: 'Controller numbers', position: 'Preview group', localPreview: 'Local preview, not the live controller display.',
  globals: 'Connection & global settings', preserve: 'Keep the stored value',
  options: 'Options for this mode', controllerMode: 'Controller mode',
  tap: 'Tap', hold: 'Hold', addHold: 'Add a hold action', unassigned: 'No action assigned',
  shortcut: 'Keyboard shortcut', modifier1: 'Modifier', modifier2: 'Second modifier', key: 'Key', none: 'None',
  applyShortcut: 'Apply shortcut', discard: 'Discard changes', shortcutPreserved: 'The stored combination stays unchanged until you apply a new shortcut.',
  switch: 'Switch', buttonUse: 'What this switch does', midiAction: 'MIDI action', keyboardAction: 'Keyboard shortcut', pageAction: 'Page or media control',
  chooseUse: 'Choose an action type', pageKey: 'Page or media action', command: 'MIDI command', interface: 'Expression / external switch',
  data: 'Data number', releaseValue: 'Released value', pressValue: 'Pressed value', slot: 'Assignment', addAssignment: 'Add assignment', removeAssignment: 'Clear assignment',
  currentGroup: 'Initial group', customGroups: 'Create independent mixed-mode groups', customGroupsHint: 'Start with empty MIDI actions. Your Advanced assignments and stored controller data are kept until you review and save.',
  applySettings: 'Apply settings', pcDisplay: 'Program number on display',
  enabled: 'On', disabled: 'Off', lastNumber: 'Last number',
  expression: 'Expression pedal', trsMidi: 'TRS-MIDI', interfaceType: 'External connection type', polarity: 'Polarity reversal',
  expert: 'CubeSuite options', expertHint: 'Original CubeSuite labels. Their physical behavior has not been confirmed.',
  visual: 'VISUAL BEHAVIOR', bankMidi: 'Bank MIDI', cleared: 'Cleared', mixed: 'Mixed mode', keyboardGroup: 'Keyboard group',
  chooseGroup: 'Choose a group', chooseSwitch: 'Choose a switch', presetLibraryOnly: 'Keep and edit your preset library here. To assign a preset, choose a MIDI-action switch in Custom MIDI actions or Mixed mode.',
  distinctModifiers: 'Choose different modifiers, or set the second modifier to None.',
  draftMode: 'Draft mode', readMode: 'Mode last read from Chocolate',
};
const pt: Record<keyof typeof en, string> = {
  title: 'Como você quer usar seu Chocolate?', intro: 'Mantenha o modo atual ou escolha outra forma de usar os quatro botões.',
  mode: 'Modo de operação', midi: 'Equipamentos MIDI', keyboard: 'Celular, computador e teclado', other: 'Outros usos',
  current: 'No controlador', draft: 'Neste rascunho', unknown: 'Modo atual (fora deste catálogo)',
  recommended: 'Para criar suas próprias ações musicais, escolha Ações MIDI personalizadas (Advanced).',
  continue: 'Usar este modo', back: 'Voltar', change: 'Trocar modo', settings: 'Ajustes do modo',
  changed: 'O modo só muda no Chocolate depois que você revisar e salvar.',
  kept: 'O modo atual será mantido. Nada é enviado agora.',
  error: 'Não foi possível aplicar a escolha. Seu rascunho foi mantido.',
  channel: 'Canal MIDI', groups: 'Quantidade de grupos', group: 'Grupo',
  fixedPc: 'Cada botão seleciona um programa. E/F muda entre grupos de quatro.',
  fixedCc: 'Cada botão envia um número CC em sequência, com valor 0. E/F muda entre grupos de quatro.',
  fixedRange: 'Números do controlador', position: 'Grupo da prévia', localPreview: 'Prévia local, não é o visor do controlador ao vivo.',
  globals: 'Conexão e ajustes gerais', preserve: 'Manter o valor salvo',
  options: 'Opções deste modo', controllerMode: 'Modo do controlador',
  tap: 'Tocar', hold: 'Segurar', addHold: 'Adicionar ação ao segurar', unassigned: 'Sem ação atribuída',
  shortcut: 'Atalho de teclado', modifier1: 'Modificador', modifier2: 'Segundo modificador', key: 'Tecla', none: 'Nenhuma',
  applyShortcut: 'Aplicar atalho', discard: 'Descartar alterações', shortcutPreserved: 'A combinação salva só muda quando você aplicar um novo atalho.',
  switch: 'Botão', buttonUse: 'O que este botão faz', midiAction: 'Ação MIDI', keyboardAction: 'Atalho de teclado', pageAction: 'Controle de páginas ou mídia',
  chooseUse: 'Escolha o tipo de ação', pageKey: 'Ação de página ou mídia', command: 'Comando MIDI', interface: 'Expressão / botão externo',
  data: 'Número do dado', releaseValue: 'Valor ao soltar', pressValue: 'Valor ao pressionar', slot: 'Atribuição', addAssignment: 'Adicionar atribuição', removeAssignment: 'Limpar atribuição',
  currentGroup: 'Grupo inicial', customGroups: 'Criar grupos independentes para o modo misto', customGroupsHint: 'Comece com ações MIDI vazias. As atribuições Advanced e os dados salvos no controlador são mantidos até você revisar e salvar.',
  applySettings: 'Aplicar ajustes', pcDisplay: 'Número do programa no visor',
  enabled: 'Ativado', disabled: 'Desativado', lastNumber: 'Último número',
  expression: 'Pedal de expressão', trsMidi: 'TRS-MIDI', interfaceType: 'Tipo de conexão externa', polarity: 'Inverter polaridade',
  expert: 'Opções do CubeSuite', expertHint: 'Nomes originais do CubeSuite. O comportamento físico ainda não foi confirmado.',
  visual: 'VISUAL BEHAVIOR', bankMidi: 'Bank MIDI', cleared: 'Removida', mixed: 'Modo misto', keyboardGroup: 'Grupo do teclado',
  chooseGroup: 'Escolha um grupo', chooseSwitch: 'Escolha um botão', presetLibraryOnly: 'Guarde e edite sua biblioteca de presets aqui. Para atribuir um preset, escolha um botão de ação MIDI no modo Ações MIDI personalizadas ou no modo misto.',
  distinctModifiers: 'Escolha modificadores diferentes ou deixe o segundo como Nenhuma.',
  draftMode: 'Modo do rascunho', readMode: 'Último modo lido do Chocolate',
};

export function useModeTranslation() {
  const { i18n } = useTranslation();
  if (!i18n.hasResourceBundle('en', 'mode')) i18n.addResourceBundle('en', 'mode', en);
  if (!i18n.hasResourceBundle('pt-BR', 'mode')) i18n.addResourceBundle('pt-BR', 'mode', pt);
  const mt = (key: keyof typeof en) => i18n.getFixedT(i18n.resolvedLanguage ?? i18n.language, 'mode')(key);
  return { mt, locale: i18n.resolvedLanguage === 'en' ? 'en' as const : 'pt-BR' as const };
}
