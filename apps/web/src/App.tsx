import { useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import type { SwitchId } from '@chocolate-studio/midi';
import { differences } from './editor.js';
import type { Locale, Sequence } from './editor.js';
import { database } from './storage.js';
import { useStudio } from './useStudio.js';
import { unavailableHardware } from './hardware.js';
import type { HardwareService } from './hardware.js';
import { HardwarePanel } from './HardwarePanel.js';
import { Destinations, Pedalboard, Presets } from './EditorViews.js';
import { Dialog, Empty, Icon, NameField } from './components.js';
import type { IconName } from './components.js';

const navigation: { view: 'board' | 'presets' | 'destinations' | 'backups'; icon: IconName }[] = [
  { view: 'board', icon: 'board' }, { view: 'presets', icon: 'preset' },
  { view: 'destinations', icon: 'destination' }, { view: 'backups', icon: 'backup' },
];
export function App({ hardware = unavailableHardware }: { hardware?: HardwareService }) {
  const { t, i18n } = useTranslation();
  const studio = useStudio();
  const device = useSyncExternalStore(hardware.subscribe, hardware.getSnapshot, hardware.getSnapshot);
  const [view, setView] = useState<'board' | 'presets' | 'destinations' | 'backups'>('board');
  const [groupId, setGroup] = useState('group-1');
  const [switchId, setSwitch] = useState<SwitchId>('A');
  const [sequence, setSequence] = useState<Sequence>('primary');
  const [backupName, setBackupName] = useState('');
  const [confirmation, setConfirmation] = useState<{ title: string; label: string; action: () => void } | null>(null);
  const [activityFilter, setActivityFilter] = useState<'all' | 'files' | 'storage' | 'midi'>('all');
  const fileInput = useRef<HTMLInputElement>(null);
  const [diffPage, setDiffPage] = useState(0);
  const diff = useMemo(() => studio.incoming ? differences(studio.configuration, studio.incoming) : [], [studio.configuration, studio.incoming]);
  const activity = [
    ...studio.events.map((event) => ({ id: event.id, time: event.time, kind: event.kind, text: t(event.key), bytes: '', direction: t('local') })),
    ...device.history.map((event) => ({ id: event.id, time: event.time, kind: 'midi' as const, text: t(event.summary, { defaultValue: event.summary }), bytes: event.bytes?.map((byte) => byte.toString(16).padStart(2, '0')).join(' ') ?? '', direction: event.direction.toUpperCase() })),
  ].filter((event) => activityFilter === 'all' || event.kind === activityFilter).sort((a, b) => b.time - a.time).slice(0, 200);
  const editorProps = {
    configuration: studio.configuration, onChange: studio.setConfiguration, groupId, onGroup: setGroup,
    switchId, onSwitch: setSwitch, sequence, onSequence: setSequence,
    confirm: (title: string, label: string, action: () => void) => setConfirmation({ title, label, action }),
  };
  async function changeLanguage(locale: Locale) {
    await i18n.changeLanguage(locale);
    document.documentElement.lang = locale;
    try { await database.preferences.put({ id: 'locale', value: locale }); }
    catch { studio.setNotice('storageUnavailable'); }
  }
  const fieldNames: Record<string, string> = {
    id: 'reference', name: 'projectName', formatVersion: 'fileVersion', groups: 'group', switches: 'switch',
    actions: 'message', messages: 'messages', secondaryMessages: 'secondary', label: 'label', gesture: 'gesture',
    destinations: 'destinations', destinationId: 'destination', presets: 'presets', behavior: 'behavior',
    channel: 'channel', program: 'program', controller: 'controller', value: 'value', bank: 'bankSelect', msb: 'msb', lsb: 'lsb', type: 'message',
  };

  return <div className="studio-shell">
    <a className="skip-link" href="#workspace">{t('workspace')}</a>
    <aside className="sidebar"><a className="wordmark" href="#workspace" onClick={() => setView('board')}><span>Chocolate<span className="brand-dot">.</span></span><small>STUDIO</small></a>
      <div className="sidebar-caption">{t('workspace')}</div><nav aria-label={t('workspace')}>{navigation.map(({ view: target, icon }) => <button key={target} className={target === view ? 'nav-item active' : 'nav-item'} aria-current={target === view ? 'page' : undefined} onClick={() => setView(target)}><Icon name={icon} /><span>{t(target)}</span>{target === 'presets' && <small>{studio.configuration.presets.length}</small>}</button>)}</nav>
      <div className="sidebar-bottom"><span className="local-badge"><span />{t('localOnly')}</span><p>{t('localPrivacy')}</p><label className="language-label"><span>{t('language')}</span><select value={i18n.language} onChange={(event) => void changeLanguage(event.target.value as Locale)}><option value="pt-BR">Português</option><option value="en">English</option></select></label></div>
    </aside>
    <div className="application"><header className="app-top">
      <div className="project-title">
        <NameField label={t('projectName')} value={studio.configuration.name} disabled={studio.loading || studio.busy} onChange={(name) => studio.setConfiguration({ ...studio.configuration, name })} />
        <span className={`save-state ${studio.dirty ? 'dirty' : ''}`} role="status"><span />{studio.dirty ? t('unsaved') : t('saved')}</span>
      </div>
      <div className="file-actions">
        <a className="primary connect-shortcut" href="#hardware-panel" onClick={() => document.getElementById('hardware-panel')?.focus()}><Icon name="destination" />{t('connectPedal')}</a>
        <button className="secondary" disabled={studio.loading || studio.busy} onClick={() => fileInput.current?.click()}><Icon name="upload" /><span>{t('import')}</span></button>
        <button className="secondary" disabled={studio.loading} onClick={() => studio.exportProject()}><Icon name="download" /><span>{t('export')}</span></button>
        <button className="primary" disabled={studio.loading || studio.busy || !studio.persistent || !studio.dirty} onClick={() => void studio.save()}><Icon name="check" />{studio.busy ? t('saving') : t('save')}</button>
      </div>
      <input className="visually-hidden" type="file" tabIndex={-1} accept=".json,application/json" aria-label={t('import')} ref={fileInput} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; setDiffPage(0); if (file) void studio.importProject(file); }} /></header>
      {studio.notice && <div className="notice" role="alert"><p>{t(studio.notice, { defaultValue: studio.notice })}</p>{studio.notice === 'conflict' && <button className="secondary" onClick={() => setConfirmation({ title: t('reloadConfirm'), label: t('reloadSaved'), action: () => { void studio.reloadSaved(); } })}>{t('reloadSaved')}</button>}<button className="icon-button" aria-label={t('dismiss')} onClick={() => studio.setNotice(null)}><Icon name="close" /></button></div>}
      <main id="workspace" tabIndex={-1}><div className="workspace-grid"><div className="editor-main">{studio.loading ? <p role="status" className="loading">{t('loading')}</p> : <fieldset className="editor-fieldset" disabled={studio.busy}>
        {view === 'board' && <Pedalboard {...editorProps} />}
        {view === 'presets' && <Presets {...editorProps} />}
        {view === 'destinations' && <Destinations configuration={studio.configuration} onChange={studio.setConfiguration} />}
        {view === 'backups' && <><header className="page-heading"><div><p className="eyebrow">{t('localOnly')}</p><h1>{t('backups')}</h1><p>{t('backupHint')}</p></div></header><section className="panel backup-create"><NameField label={t('backupName')} value={backupName} onChange={setBackupName} /><button className="primary" disabled={!studio.persistent} onClick={() => void studio.createBackup(backupName)}><Icon name="plus" />{t('createBackup')}</button></section>
          {!studio.backups.length && <Empty title={t('noBackups')} detail={t('noBackupsHint')} />}
          <div className="backup-list">{studio.backups.map((backup) => <article key={backup.id} className="panel backup-card"><div className="backup-emblem"><Icon name="backup" /></div><div className="backup-info"><h3>{backup.name}</h3><p>{backup.configuration.name}</p><time dateTime={new Date(backup.createdAt).toISOString()}>{new Date(backup.createdAt).toLocaleString(i18n.language)}</time></div><div className="button-row"><button className="secondary" onClick={() => { studio.setIncoming(backup.configuration); setDiffPage(0); }}>{t('restore')}</button><button className="text-button" onClick={() => studio.exportProject(backup.configuration)}>{t('download')}</button><button className="text-button danger" onClick={() => setConfirmation({ title: t('deleteBackup'), label: t('delete'), action: () => { void studio.deleteBackup(backup.id); } })}>{t('delete')}</button></div></article>)}</div></>}
      </fieldset>}</div>
      <aside className="device-aside" id="hardware-panel" tabIndex={-1}><HardwarePanel service={hardware} state={device} configuration={studio.configuration} onReviewRead={(configuration) => { studio.setIncoming(configuration); setDiffPage(0); }} onNotice={studio.setNotice} />
        <section className="panel activity-panel" aria-label={t('activity')}><header className="section-heading"><h2><Icon name="activity" />{t('activity')}</h2><button className="text-button" onClick={() => { studio.setEvents([]); hardware.clearHistory(); }}>{t('clear')}</button></header>{device.status === 'unavailable' ? <p className="helper">{t('activityHint')}</p> : !device.history.length && <p className="helper">{t('noHardwareActivity')}</p>}<div className="activity-filters" role="group" aria-label={t('activity')}>{(['all', 'files', 'storage', 'midi'] as const).map((filter) => <button className={activityFilter === filter ? 'active' : ''} aria-pressed={activityFilter === filter} key={filter} onClick={() => setActivityFilter(filter)}>{t(filter)}</button>)}</div>
          <ol className="activity-list" aria-live="off">{activity.map((event) => <li key={event.id}><time dateTime={new Date(event.time).toISOString()}>{new Date(event.time).toLocaleTimeString(i18n.language, { hour12: false })}</time><span className="event-direction">{event.direction}</span><p>{event.text}{event.bytes && <code>{event.bytes}</code>}</p></li>)}</ol>{activity.length === 0 && <p className="inline-empty">{t('noActivity')}</p>}
        </section><p className="device-footnote">{t('draftHint')}</p>
      </aside></div></main>
      <footer className="app-footer"><span>Chocolate Studio</span><span>{t('offline')}</span><span>0.1.0-beta.3</span></footer>
    </div>
    {studio.incoming && <Dialog title={t('reviewTitle')} onClose={() => { if (!studio.busy) studio.setIncoming(null); }}><p>{t('reviewHint')}</p><div className="review-names"><div><span>{t('before')}</span><strong>{studio.configuration.name}</strong></div><Icon name="arrow" /><div><span>{t('after')}</span><strong>{studio.incoming.name}</strong></div></div><p className="eyebrow">{t('changeCount', { count: diff.length })}</p>
      {!diff.length ? <p>{t('noChanges')}</p> : <div className="diff-scroll"><table><thead><tr><th>{t('field')}</th><th>{t('before')}</th><th>{t('after')}</th></tr></thead><tbody>{diff.slice(diffPage * 100, (diffPage + 1) * 100).map((change) => <tr key={change.path.join('/')}><th scope="row">{change.path.map((part) => fieldNames[part] ? t(fieldNames[part]!) : /^\d+$/.test(part) ? `#${Number(part) + 1}` : part).join(' / ')}</th><td><span className="diff-before">{change.before}</span></td><td><span className="diff-after">{change.after}</span></td></tr>)}</tbody></table></div>}
      {diff.length > 100 && <div className="pagination"><button disabled={!diffPage} onClick={() => setDiffPage(diffPage - 1)}>{t('previous')}</button><span>{diffPage + 1} / {Math.ceil(diff.length / 100)}</span><button disabled={(diffPage + 1) * 100 >= diff.length} onClick={() => setDiffPage(diffPage + 1)}>{t('next')}</button></div>}
      <footer className="dialog-footer"><button className="secondary" disabled={studio.busy} onClick={() => studio.setIncoming(null)}>{t('cancel')}</button><button className="primary" disabled={studio.busy || !studio.persistent || !diff.length} onClick={() => { void studio.replaceDraft(); setSequence('primary'); }}>{t('replaceDraft')}</button></footer></Dialog>}
    {confirmation && <Dialog title={confirmation.title} onClose={() => setConfirmation(null)}><footer className="dialog-footer"><button className="secondary" onClick={() => setConfirmation(null)}>{t('cancel')}</button><button className="primary" onClick={() => { confirmation.action(); setConfirmation(null); }}>{confirmation.label}</button></footer></Dialog>}
  </div>;
}
