import { useTranslation } from 'react-i18next';

export const connectionEn = {
  title: 'Connect your Chocolate', intro: 'We will read its current configuration without changing it.',
  cableHelp: 'For computer setup, use the computer USB port and U position described in your controller manual. This connection does not confirm a route to your effects unit.',
  findPorts: 'Find MIDI ports', input: 'Input', output: 'Output', choosePort: 'Choose a port',
  confirmPorts: 'I confirm this input and output belong to the Chocolate I want to configure.',
  connectRead: 'Use these ports and read', readAgain: 'Read again', disconnect: 'Disconnect',
  offline: 'Edit without connecting', continue: 'Continue', retry: 'Try again',
  checking: 'Checking communication and reading…', connectedNotRead: 'Chocolate connected. Its complete configuration has not been read yet.',
  readComplete: 'Configuration read. Nothing was written.', permission: 'Allow MIDI and SysEx in your browser permission prompt.',
  unavailable: 'Use a compatible desktop browser over HTTPS, or continue editing without a connection.',
  failed: 'The operation did not complete. Your draft was kept. Check the connection and try again.',
  readFirst: 'Read the complete controller configuration first.', disconnected: 'Chocolate disconnected. Reconnect and read again; your draft was kept.',
  backupTitle: 'Keep the original controller backup', backupSaving: 'Saving and checking the complete original backup on this device…',
  backupStored: 'The complete original controller backup is saved on this device.',
  backupStorageFailed: 'The original backup could not be saved on this device. Download it and confirm that you kept the file before continuing.',
  backupRequired: 'Keep the original controller backup before continuing or writing.',
  downloadOriginal: 'Download original controller backup', downloadedAcknowledgement: 'I saved this original backup file somewhere I can find it.',
  backupDownloaded: 'Original backup download acknowledged. Keep that file for recovery.',
  backupDownloadFailed: 'The backup download could not be started. Nothing was written.',
  pcMode: 'The controller is in fixed Program Change mode (PC 000–127). This is not 128 freely programmable tap/hold assignments.',
  advancedMode: 'The controller is in the observed eight-group Advanced mode. Editor selection is not live display telemetry.',
  otherMode: 'The controller mode is not classified by this editor. Its raw backup is retained; review any Advanced mode activation explicitly.',
  advancedActivation: 'Writing custom assignments uses the observed eight-group Advanced layout. Review the mode change; fixed PC positions are not an arbitrary mapping table.',
  physicalCaveat: 'A verified write confirms stored configuration only. Check the actual tap/hold result on your equipment separately.',
  reviewSave: 'Review and save to Chocolate', connectionDetails: 'Connection and controller details',
  backupDetails: 'Controller backups', historyDetails: 'Technical history',
  needsConnection: 'Connect and read your Chocolate before reviewing a device write.',
  previewExpired: 'The draft, read or connection changed. Review a fresh preview before writing.',
  writeVerified: 'Configuration written and reread. Physical equipment behavior still needs checking.',
  backupReadMismatch: 'The saved backup did not match the original bytes. Download the original instead.',
  previewUnavailable: 'This preview is no longer valid. Nothing was written.',
} as const;

export const connectionPt: Record<keyof typeof connectionEn, string> = {
  title: 'Conectar seu Chocolate', intro: 'Vamos ler a configuração atual sem alterá-la.',
  cableHelp: 'Para configurar pelo computador, use a porta USB de computador e a posição U indicadas no manual do controlador. Essa conexão não confirma uma rota até seu efeito.',
  findPorts: 'Buscar portas MIDI', input: 'Entrada', output: 'Saída', choosePort: 'Escolha uma porta',
  confirmPorts: 'Confirmo que esta entrada e esta saída pertencem ao Chocolate que quero configurar.',
  connectRead: 'Usar estas portas e ler', readAgain: 'Ler novamente', disconnect: 'Desconectar',
  offline: 'Editar sem conectar', continue: 'Continuar', retry: 'Tentar novamente',
  checking: 'Verificando a comunicação e lendo…', connectedNotRead: 'Chocolate conectado. A configuração completa ainda não foi lida.',
  readComplete: 'Configuração lida. Nada foi gravado.', permission: 'Permita MIDI e SysEx no aviso de permissão do navegador.',
  unavailable: 'Use um navegador de computador compatível em HTTPS ou continue editando sem conectar.',
  failed: 'A operação não foi concluída. Seu rascunho foi mantido. Confira a conexão e tente novamente.',
  readFirst: 'Leia primeiro a configuração completa do controlador.', disconnected: 'Chocolate desconectado. Conecte e leia novamente; seu rascunho foi mantido.',
  backupTitle: 'Guarde a cópia original do controlador', backupSaving: 'Salvando e conferindo a cópia original completa neste dispositivo…',
  backupStored: 'A cópia original completa do controlador está salva neste dispositivo.',
  backupStorageFailed: 'Não foi possível salvar a cópia original neste dispositivo. Baixe e confirme que guardou o arquivo antes de continuar.',
  backupRequired: 'Guarde a cópia original do controlador antes de continuar ou gravar.',
  downloadOriginal: 'Baixar cópia original do controlador', downloadedAcknowledgement: 'Guardei este arquivo original em um lugar onde posso encontrá-lo.',
  backupDownloaded: 'Download da cópia original confirmado. Guarde esse arquivo para recuperação.',
  backupDownloadFailed: 'Não foi possível iniciar o download da cópia. Nada foi gravado.',
  pcMode: 'O controlador está no modo fixo Program Change (PC 000–127). Isso não significa 128 atribuições livres de toque e segurar.',
  advancedMode: 'O controlador está no modo Advanced observado, com oito grupos. A seleção no editor não é telemetria do visor.',
  otherMode: 'Este editor não classifica o modo atual do controlador. A cópia integral foi mantida; revise explicitamente qualquer ativação do modo Advanced.',
  advancedActivation: 'Gravar atribuições personalizadas usa o layout Advanced observado, com oito grupos. Revise a troca de modo; posições PC fixas não são uma tabela de atribuições livres.',
  physicalCaveat: 'Uma gravação conferida confirma apenas a configuração armazenada. Confira separadamente o resultado de tocar e segurar no equipamento.',
  reviewSave: 'Revisar e salvar no Chocolate', connectionDetails: 'Conexão e detalhes do controlador',
  backupDetails: 'Cópias do controlador', historyDetails: 'Histórico técnico',
  needsConnection: 'Conecte e leia seu Chocolate antes de revisar uma gravação no controlador.',
  previewExpired: 'O rascunho, a leitura ou a conexão mudou. Revise uma nova prévia antes de gravar.',
  writeVerified: 'Configuração gravada e relida. O comportamento físico no equipamento ainda precisa ser conferido.',
  backupReadMismatch: 'A cópia salva não corresponde aos bytes originais. Baixe o original.',
  previewUnavailable: 'Esta prévia não é mais válida. Nada foi gravado.',
};

/** Separate namespace; existing application resources remain owned by the UI lane. */
export function useConnectionTranslation() {
  const { i18n } = useTranslation();
  if (!i18n.hasResourceBundle('en', 'connection')) i18n.addResourceBundle('en', 'connection', connectionEn);
  if (!i18n.hasResourceBundle('pt-BR', 'connection')) i18n.addResourceBundle('pt-BR', 'connection', connectionPt);
  return { ct: i18n.getFixedT(i18n.resolvedLanguage ?? i18n.language, 'connection'), i18n };
}
