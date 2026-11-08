import type { ControllerReadMetadata } from './hardware.js';
import type { OriginalBackupState } from './connection-backup.js';
import { useConnectionTranslation } from './connection-i18n.js';

export function OriginalBackupControls({ backup }: { backup: OriginalBackupState }) {
  const { ct } = useConnectionTranslation();
  return <section className="backup-safety" aria-label={ct('backupTitle')}>
    <p role="status">{backup.ready ? ct(backup.method === 'downloaded' ? 'backupDownloaded' : 'backupStored') :
      ct(backup.phase === 'saving' ? 'backupSaving' : backup.phase === 'failed' ? 'backupStorageFailed' : 'backupRequired')}</p>
    <button className="secondary" type="button" onClick={backup.download}>{ct('downloadOriginal')}</button>
    {!backup.ready && backup.canAcknowledge && <label className="check"><input type="checkbox" checked={false}
      onChange={(event) => { if (event.target.checked) void backup.acknowledgeDownload(); }} />{ct('downloadedAcknowledgement')}</label>}
  </section>;
}

export function ControllerModeNotice({ controller }: { controller?: ControllerReadMetadata }) {
  const { ct } = useConnectionTranslation();
  if (!controller) return null;
  return <p className="helper controller-mode" role="status">{ct(controller.modeKind === 'program-change' ? 'pcMode' : controller.modeKind === 'advanced' ? 'advancedMode' : 'otherMode')}</p>;
}
