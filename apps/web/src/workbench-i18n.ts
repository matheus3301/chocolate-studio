import { useTranslation } from "react-i18next";
const en = {
  file: "File",
  open: "Open configuration",
  download: "Download a copy",
  recovery: "Recovery copies",
  device: "Chocolate Plus",
  edit: "Edit switches",
  language: "Language",
  startConnect: "Connect your Chocolate",
  connected: "Connected by USB",
  disconnected: "Disconnected",
  offline: "Editing without a controller",
  connection: "Connection",
  changeMode: "Change operating mode",
  mode: "Operating mode",
  channelAndDisplay: "Channel, display and navigation",
  controllerOptions: "Controller options",
  externalPedal: "External pedal / MIDI output",
  modeHint: "The operating mode determines how all four switches work.",
  modeChangeHint:
    "This changes the controller as a whole. It takes effect when you save to Chocolate.",
  useMode: "Use this mode",
  onController: "On Chocolate",
  editingMode: "Editing",
  midiModes: "MIDI",
  keyboardModes: "Keyboard and media",
  otherModes: "Other uses",
  advancedReason:
    "To choose actions for tap and hold, use Custom MIDI actions. This changes the mode of the whole controller.",
  unknownMode: "Unrecognized operating mode",
  unknownHint:
    "This mode has not been qualified. Choose a supported mode deliberately before editing.",
  incomplete:
    "Finish or discard the incomplete field before leaving this editor.",
  localRecovery: "There is an earlier edit on this browser",
  localRecoveryHint:
    "It differs from the configuration just read from Chocolate. Choose which one to continue editing. Nothing will be written to the pedal.",
  keepLocal: "Keep my edit",
  useRead: "Open the Chocolate configuration",
  resume: "Resume previous edit",
  reading: "Opening the Chocolate configuration…",
  localFailure:
    "The recovery copy could not be saved in this browser. Download a copy before closing.",
  editorCopies: "Editor copies",
  controllerCopies: "Chocolate backups",
  memoryOnly: "Only in this session. Download this copy before closing.",
  copyHint:
    "Opening a copy changes the editor. Saving to Chocolate is a separate action.",
  rawHint:
    "Complete backups of the controller. Restore only when you want to replace its configuration.",
  noCopies: "No recovery copies yet",
  noCopiesHint: "A copy is kept when a configuration is replaced.",
  openCopy: "Open this copy",
  equipment: "Equipment",
  presetReferences: "Preset references",
  filesHint:
    "Check the changes before replacing the open configuration. Your current edit will be kept as a recovery copy.",
  replace: "Open this configuration",
  importTitle: "Open configuration?",
  changes: "Changes",
  diagnostics: "Connection diagnostics",
  close: "Close",
  cancel: "Cancel",
  help: "Connection help",
  helpHint:
    "Check the MIDI cable route and the receiving channel on your equipment. A successful save confirms the Chocolate configuration, not the sound produced by another device.",
  exportName: "File name",
  exportTitle: "Download a configuration copy",
  downloadAction: "Download",
  optionsHint:
    "These options affect the controller. The MIDI channel of an individual action is edited with that action.",
} as const;
const pt: Record<keyof typeof en, string> = {
  file: "Arquivo",
  open: "Abrir configuração",
  download: "Baixar uma cópia",
  recovery: "Cópias de recuperação",
  device: "Chocolate Plus",
  edit: "Editar botões",
  language: "Idioma",
  startConnect: "Conecte seu Chocolate",
  connected: "Conectado por USB",
  disconnected: "Desconectado",
  offline: "Editando sem controlador",
  connection: "Conexão",
  changeMode: "Alterar modo de operação",
  mode: "Modo de operação",
  channelAndDisplay: "Canal, visor e navegação",
  controllerOptions: "Opções do controlador",
  externalPedal: "Pedal externo / saída MIDI",
  modeHint: "O modo de operação determina como os quatro botões funcionam.",
  modeChangeHint:
    "A mudança vale para o controlador inteiro e só chega ao pedal quando você salva no Chocolate.",
  useMode: "Usar este modo",
  onController: "No Chocolate",
  editingMode: "Editando",
  midiModes: "MIDI",
  keyboardModes: "Teclado e mídia",
  otherModes: "Outros usos",
  advancedReason:
    "Para escolher ações ao tocar e segurar, use Ações MIDI personalizadas. Isso muda o modo do controlador inteiro.",
  unknownMode: "Modo de operação desconhecido",
  unknownHint:
    "Este modo não foi qualificado. Escolha um modo suportado explicitamente antes de editar.",
  incomplete:
    "Conclua ou descarte o campo incompleto antes de sair desta edição.",
  localRecovery: "Há uma edição anterior neste navegador",
  localRecoveryHint:
    "Ela é diferente da configuração que acabamos de ler do Chocolate. Escolha qual continuar editando. Nada será gravado no pedal.",
  keepLocal: "Manter minha edição",
  useRead: "Abrir configuração do Chocolate",
  resume: "Retomar edição anterior",
  reading: "Abrindo a configuração do Chocolate…",
  localFailure:
    "Não foi possível guardar a recuperação neste navegador. Baixe uma cópia antes de fechar.",
  editorCopies: "Cópias do editor",
  controllerCopies: "Backups do Chocolate",
  memoryOnly: "Apenas nesta sessão. Baixe esta cópia antes de fechar.",
  copyHint:
    "Abrir uma cópia muda o editor. Salvar no Chocolate é uma ação separada.",
  rawHint:
    "Backups completos do controlador. Restaure apenas quando quiser substituir sua configuração.",
  noCopies: "Ainda não há cópias de recuperação",
  noCopiesHint: "Uma cópia é guardada ao substituir uma configuração.",
  openCopy: "Abrir esta cópia",
  equipment: "Equipamentos",
  presetReferences: "Referências de presets",
  filesHint:
    "Confira as mudanças antes de substituir a configuração aberta. Sua edição atual ficará guardada em uma cópia de recuperação.",
  replace: "Abrir esta configuração",
  importTitle: "Abrir configuração?",
  changes: "Alterações",
  diagnostics: "Diagnóstico da conexão",
  close: "Fechar",
  cancel: "Cancelar",
  help: "Ajuda de conexão",
  helpHint:
    "Confira a rota do cabo MIDI e o canal de recepção no seu equipamento. Salvar confirma a configuração do Chocolate, não o som produzido por outro aparelho.",
  exportName: "Nome do arquivo",
  exportTitle: "Baixar cópia da configuração",
  downloadAction: "Baixar",
  optionsHint:
    "Estas opções afetam o controlador. O canal MIDI de uma ação individual é editado junto daquela ação.",
};
export function useWorkbenchTranslation() {
  const { t, i18n } = useTranslation();
  if (!i18n.hasResourceBundle("en", "workbench")) {
    i18n.addResourceBundle("en", "workbench", en);
    i18n.addResourceBundle("pt-BR", "workbench", pt);
  }
  return {
    wt: (key: keyof typeof en) => t(key, { ns: "workbench" }),
    locale: i18n.language === "pt-BR" ? ("pt-BR" as const) : ("en" as const),
  };
}
