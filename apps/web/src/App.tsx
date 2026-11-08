import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { effectiveControllerMode, getControllerMode } from '@chocolate-studio/midi';
import type { StudioConfiguration, SwitchId } from '@chocolate-studio/midi';
import { differences } from './editor.js';
import type { Locale, Sequence } from './editor.js';
import { database } from './storage.js';
import { useStudio } from './useStudio.js';
import { unavailableHardware } from './hardware.js';
import type { DeviceRead, HardwareService } from './hardware.js';
import { configurationFromBytes } from './hardware-mapping.js';
import { HardwarePanel } from './HardwarePanel.js';
import { ConnectionStep } from './ConnectionStep.js';
import { GuidedEditor } from './GuidedEditor.js';
import { EquipmentStep } from './EquipmentStep.js';
import { ModeStep } from './ModeStep.js';
import { ModeEditor, ModeSettings } from './ModeEditor.js';
import { InterfaceEditor } from './InterfaceEditor.js';
import { useModeTranslation } from './mode-i18n.js';
import { Destinations, Presets } from './EditorViews.js';
import { MusicalReview } from './MusicalReview.js';
import { ControllerReview } from './ControllerReview.js';
import { Dialog, Empty, Icon, NameField } from './components.js';
import { shellEn, shellPt } from './shell-i18n.js';

type Step = 'connect' | 'read' | 'mode' | 'equipment' | 'editor' | 'test' | 'help';
type View = 'board' | 'presets' | 'destinations' | 'backups' | 'diagnostics';
export function App({ hardware = unavailableHardware }: { hardware?: HardwareService }) {
  const { t, i18n } = useTranslation();
  const { mt, locale } = useModeTranslation();
  // Resource registration is idempotent; the catalog supplies its own localized text.
  if (!i18n.hasResourceBundle('en', 'shell')) {
    i18n.addResourceBundle('en', 'shell', shellEn);
    i18n.addResourceBundle('pt-BR', 'shell', shellPt);
  }
  const s = (key: keyof typeof shellEn) => t(key, { ns: 'shell' });
  const studio = useStudio();
  const device = useSyncExternalStore(hardware.subscribe, hardware.getSnapshot, hardware.getSnapshot);
  const [step, setStep] = useState<Step>('connect');
  const [view, setView] = useState<View>('board');
  const [groupId, setGroup] = useState('group-1');
  const [switchId, setSwitch] = useState<SwitchId>('A');
  const [sequence, setSequence] = useState<Sequence>('primary');
  const [destinationId, setDestination] = useState<string>();
  const [readCandidate, setReadCandidate] = useState<DeviceRead | null>(null);
  const [modeConfirmed, setModeConfirmed] = useState(false);
  const [backupName, setBackupName] = useState('');
  const [confirmation, setConfirmation] = useState<{ title: string; label: string; action: () => void } | null>(null);
  const [pendingAction, setPendingAction] = useState(false);
  const [pendingInterface, setPendingInterface] = useState(false);
  const [pendingHardware, setPendingHardware] = useState(false);
  const [physicalResult, setPhysicalResult] = useState<'unconfirmed' | 'confirmed'>('unconfirmed');
  const fileInput = useRef<HTMLInputElement>(null);
  const heading = useRef<HTMLElement>(null);
  const [diffPage, setDiffPage] = useState(0);
  const diff = useMemo(() => studio.incoming ? differences(studio.configuration, studio.incoming) : [], [studio.configuration, studio.incoming]);
  const connected = device.selection !== null && device.identity !== null;
  const hardwareBusy = ['busy', 'connecting', 'requesting'].includes(device.status);
  const locked = studio.loading || studio.busy || hardwareBusy || pendingHardware;
  const externalLocked = locked || pendingAction || pendingInterface;
  const currentRead = readCandidate && device.observed?.rawBackup.id === readCandidate.rawBackup.id && connected;
  const activeMode = effectiveControllerMode(studio.configuration);
  const selectedMode = getControllerMode(activeMode);
  const hasConfiguredDestination = studio.configuration.destinations.some(destination => destination.profile);
  useEffect(() => { heading.current?.focus(); }, [step, view]);
  useEffect(() => { setPhysicalResult('unconfirmed'); }, [studio.configuration, device.verified]);
  const confirm = (title: string, label: string, action: () => void) => setConfirmation({ title, label, action });
  const editorProps = { configuration: studio.configuration, onChange: studio.setConfiguration, groupId, onGroup: setGroup,
    switchId, onSwitch: setSwitch, sequence, onSequence: setSequence, confirm };
  function edit() { setView('board'); setStep(modeConfirmed ? 'editor' : 'mode'); }
  function chooseEquipment() { setView('board'); setStep('equipment'); }
  function chooseMode() { setView('board'); setStep('mode'); }
  function afterMode(mode: number) { setModeConfirmed(true); setView('board'); setStep(mode === 3 && !hasConfiguredDestination ? 'equipment' : 'editor'); }
  function reviewRead(read: DeviceRead) {
    // Reattach only exact matching local intent after a fresh connection; the device does not store labels/profiles.
    try {
      const reconciled = configurationFromBytes(new Uint8Array(read.rawBackup.bytes), studio.configuration);
      setReadCandidate({ ...read, ...reconciled }); setModeConfirmed(false); setStep('read');
    } catch { studio.setNotice('hardware.unrecognizedFields'); }
  }
  async function acceptRead() {
    if (!currentRead || !readCandidate) return;
    if (await studio.replaceDraft(readCandidate.configuration)) {
      setGroup(readCandidate.configuration.groups[0]!.id); setSwitch('A'); setSequence('primary'); chooseMode();
    }
  }
  function openTool(target: View) { setView(target); setStep('editor'); }
  async function changeLanguage(locale: Locale) {
    await i18n.changeLanguage(locale); document.documentElement.lang = locale;
    try { await database.preferences.put({ id: 'locale', value: locale }); }
    catch { studio.setNotice('storageUnavailable'); }
  }
  const activity = [...studio.events.map(event => ({ id: event.id, time: event.time, text: t(event.key), bytes: '' })),
    ...device.history.map(event => ({ id: event.id, time: event.time, text: t(event.summary, { defaultValue: event.summary }), bytes: event.bytes?.map(b => b.toString(16).padStart(2, '0')).join(' ') ?? '' }))]
    .sort((a, b) => b.time - a.time).slice(0, 200);
  const stepNumber = step === 'connect' || step === 'read' ? 0 : step === 'mode' ? 1 : 2;
  return <div className="guided-shell">
    <a className="skip-link" href="#workspace">{s('flowEdit')}</a>
    <header className="guided-topbar">
      <a className="wordmark" href="#workspace" onClick={event => { if (externalLocked) event.preventDefault(); }}><span>Chocolate<span className="brand-dot">.</span></span><small>STUDIO</small></a>
      <span className={`save-state ${studio.dirty ? 'dirty' : ''}`} role="status">{studio.dirty ? t('unsaved') : t('saved')}</span>
      <details className="guided-menu project-disclosure"><summary>{s('flowFiles')}</summary><div className="guided-menu-items">
        <div className="project-settings">
          <NameField label={t('projectName')} value={studio.configuration.name} disabled={externalLocked} onChange={name => studio.setConfiguration({ ...studio.configuration, name })} />
          <label className="field"><span>{t('language')}</span><select value={i18n.language} disabled={externalLocked} onChange={event => void changeLanguage(event.target.value as Locale)}><option value="pt-BR">Português</option><option value="en">English</option></select></label>
        </div>
        <button disabled={externalLocked || !studio.persistent || !studio.dirty} onClick={() => void studio.save()}>{s('flowLocalSave')}</button>
        <button disabled={studio.loading || pendingAction || pendingInterface || pendingHardware} onClick={() => studio.exportProject()}>{s('flowExport')}</button>
        <button disabled={externalLocked} onClick={() => fileInput.current?.click()}>{s('flowImport')}</button>
        <button disabled={externalLocked} onClick={() => openTool('backups')}>{t('backups')}</button>
      </div></details>
      <input className="visually-hidden" type="file" tabIndex={-1} accept=".json,application/json" aria-label={t('import')} ref={fileInput} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; setDiffPage(0); if (file) void studio.importProject(file); }} />
    </header>
    <main id="workspace" className="guided-content" ref={heading} tabIndex={-1}>
      {studio.notice && <div className="notice" role="alert"><p>{t(studio.notice, { defaultValue: studio.notice })}</p>{studio.notice === 'conflict' && <button className="secondary" onClick={() => confirm(t('reloadConfirm'), t('reloadSaved'), () => void studio.reloadSaved())}>{t('reloadSaved')}</button>}<button className="icon-button" aria-label={t('dismiss')} onClick={() => studio.setNotice(null)}><Icon name="close" /></button></div>}
      {studio.loading ? <p role="status">{t('loading')}</p> : <>
        {step !== 'test' && step !== 'help' && <ol className="flow-progress" aria-label={mt('settings')}>{[s('flowConnect'), mt('mode'), mt('settings')].map((label, index) => <li key={label} aria-current={stepNumber === index ? 'step' : undefined}>{index + 1}. {label}</li>)}</ol>}
        {step === 'connect' && <section className="guided-setup"><ConnectionStep onPendingChange={setPendingHardware} service={hardware} state={device} onRead={reviewRead} onOffline={chooseMode} onNotice={studio.setNotice} />
          <button className="text-button" disabled={externalLocked} onClick={chooseMode}>{s('flowContinue')}</button></section>}
        {step === 'read' && <section className="panel guided-setup"><h1>{s('flowReadTitle')}</h1><p>{s('flowReadHint')}</p>
          {!currentRead && <p role="alert">{s('flowReadExpired')}</p>}
          {readCandidate && <><p className="helper">{s('flowKeepHint')}</p>{!!readCandidate.warnings.length && <details><summary>{s('flowReadDetails')}</summary>{readCandidate.warnings.map((warning, index) => <p className="helper" key={`${warning}-${index}`}>{t(warning, { defaultValue: warning })}</p>)}</details>}
            <details><summary>{s('flowReadChanges')}</summary><ControllerReview before={studio.configuration} after={readCandidate.configuration} /><MusicalReview before={studio.configuration} after={readCandidate.configuration} /></details></>}
          <div className="guided-step-actions"><button className="secondary" disabled={externalLocked} onClick={() => setStep('connect')}>{s('flowReadAgain')}</button><button className="secondary" disabled={externalLocked} onClick={chooseMode}>{s('flowKeepDraft')}</button><button className="primary" disabled={locked || !currentRead || !studio.persistent} onClick={() => void acceptRead()}>{s('flowUseRead')}</button></div></section>}
        {step === 'mode' && <ModeStep key={`${studio.configuration.id}:${studio.configuration.controller?.mode}`} configuration={studio.configuration} onChange={studio.setConfiguration} onComplete={afterMode} onBack={() => setStep(connected && readCandidate ? 'read' : 'connect')} disabled={externalLocked} {...(connected && device.observed?.controller ? { currentMode: device.observed.controller.rawMode } : {})} />}
        {step === 'equipment' && <EquipmentStep configuration={studio.configuration} onChange={studio.setConfiguration} onComplete={id => { setDestination(id); edit(); }} onBack={chooseMode} {...(destinationId ? { destinationId } : {})} disabled={externalLocked} />}
        {step === 'editor' && <>
          <div className="guided-toolbar"><div><p className="guided-status" role="status">{connected ? device.observed ? s('flowConnected') : s('flowNoRead') : s('flowDraft')}</p><strong className="editor-mode">{selectedMode?.label[locale] ?? mt('unknown')}</strong></div><div className="button-row">
            {view !== 'board' && <button className="secondary" disabled={externalLocked} onClick={edit}>{s('flowBack')}</button>}
            <button className="secondary" disabled={externalLocked} onClick={() => setStep('connect')}>{connected ? s('flowConnection') : t('connectPedal')}</button>
            <button className="secondary" disabled={externalLocked} onClick={chooseMode}>{mt('change')}</button>
            {(activeMode === 3 || activeMode === 11) && <button className="text-button" disabled={externalLocked} onClick={chooseEquipment}>{s('flowEquipmentChange')}</button>}
          </div></div>
          {(pendingAction || pendingInterface) && <p className="notice" role="status">{s('flowPendingAction')}</p>}
          {!connected && <p className="helper">{s('flowConnectionHelp')}</p>}
          <fieldset className="editor-fieldset" disabled={locked || pendingInterface}>
            {view === 'board' && (activeMode === 3 ? <><GuidedEditor sequence={sequence} onSequence={setSequence} configuration={studio.configuration} onChange={studio.setConfiguration} groupId={groupId} onGroup={setGroup} switchId={switchId} onSwitch={setSwitch} confirm={confirm} {...(destinationId ? { destinationId } : {})} disabled={locked} onPendingChange={setPendingAction} /><ModeSettings configuration={studio.configuration} onChange={studio.setConfiguration} disabled={pendingAction || locked} /></> : <ModeEditor key={activeMode} configuration={studio.configuration} onChange={studio.setConfiguration} confirm={confirm} onPendingChange={setPendingAction} disabled={locked} />)}
            {view === 'presets' && <Presets {...editorProps} />}
            {view === 'destinations' && <Destinations configuration={studio.configuration} onChange={studio.setConfiguration} />}
            {view === 'backups' && <><h1>{t('backups')}</h1><p>{t('backupHint')}</p><section className="panel backup-create"><NameField label={t('backupName')} value={backupName} onChange={setBackupName} /><button className="primary" disabled={!studio.persistent} onClick={() => void studio.createBackup(backupName)}>{t('createBackup')}</button></section>
              {!studio.backups.length && <Empty title={t('noBackups')} detail={t('noBackupsHint')} />}
              {studio.backups.map(backup => <article className="panel backup-card" key={backup.id}><div className="backup-info"><h2>{backup.name}</h2><p>{backup.configuration.name}</p><time dateTime={new Date(backup.createdAt).toISOString()}>{new Date(backup.createdAt).toLocaleString(i18n.language)}</time></div><div className="button-row"><button className="secondary" onClick={() => { studio.setIncoming(backup.configuration); setDiffPage(0); }}>{t('restore')}</button><button className="text-button" onClick={() => studio.exportProject(backup.configuration)}>{t('download')}</button><button className="text-button danger" onClick={() => confirm(t('deleteBackup'), t('delete'), () => void studio.deleteBackup(backup.id))}>{t('delete')}</button></div></article>)}</>}
            {view === 'diagnostics' && <section className="panel activity-panel"><header className="section-heading"><h1>{s('flowDiagnostics')}</h1><button className="text-button" onClick={() => { studio.setEvents([]); hardware.clearHistory(); }}>{t('clear')}</button></header><ol className="activity-list">{activity.map(event => <li key={event.id}><time dateTime={new Date(event.time).toISOString()}>{new Date(event.time).toLocaleTimeString(i18n.language)}</time><p>{event.text}{event.bytes && <code>{event.bytes}</code>}</p></li>)}</ol>{!activity.length && <p>{t('noActivity')}</p>}</section>}
          </fieldset>
          {view === 'board' && <InterfaceEditor configuration={studio.configuration} onChange={studio.setConfiguration} confirm={confirm} onPendingChange={setPendingInterface} disabled={locked || pendingAction || !selectedMode} />}
          {view === 'board' && <fieldset className="editor-fieldset" disabled={pendingAction || pendingInterface || !modeConfirmed || !selectedMode}><HardwarePanel compact onPendingChange={setPendingHardware} service={hardware} state={device} configuration={studio.configuration} onReviewRead={(configuration: StudioConfiguration) => { studio.setIncoming(configuration); setDiffPage(0); }} onNotice={studio.setNotice} onVerified={() => { setPhysicalResult('unconfirmed'); setStep('test'); }} /></fieldset>}
          <details className="guided-menu"><summary>{s('flowUtilities')}</summary><div className="button-row"><button disabled={externalLocked} onClick={() => openTool('presets')}>{t('presets')}</button><button disabled={externalLocked} onClick={() => openTool('destinations')}>{t('destinations')}</button><button disabled={externalLocked} onClick={() => openTool('diagnostics')}>{s('flowDiagnostics')}</button></div></details>
          <p className="helper">{physicalResult === 'confirmed' ? s('flowTestConfirmed') : device.verified ? s('flowTestUnconfirmed') : ''}</p>
        </>}
        {step === 'test' && <section className="panel guided-setup"><h1>{s('flowTestTitle')}</h1><p role="status">{device.verified ? s('flowVerified') : s('flowTestUnconfirmed')}</p><p>{s('flowTestHint')}</p><div className="guided-step-actions"><button className="primary" onClick={() => { setPhysicalResult('confirmed'); edit(); }}>{s('flowTestYes')}</button><button className="secondary" onClick={() => setStep('help')}>{s('flowTestNo')}</button><button className="text-button" onClick={edit}>{s('flowTestLater')}</button></div></section>}
        {step === 'help' && <section className="panel guided-setup"><h1>{s('flowHelpTitle')}</h1><ol><li>{s('flowHelpRoute')}</li><li>{s('flowHelpChannel')}</li><li>{s('flowHelpGesture')}</li></ol><p>{s('flowHelpPreserved')}</p><button className="primary" onClick={edit}>{s('flowBack')}</button></section>}
      </>}
    </main>
    <footer className="app-footer"><span>Chocolate Studio</span><span>{t('localOnly')}</span><span>0.1.0-beta.4</span></footer>
    {studio.incoming && <Dialog title={t('reviewTitle')} onClose={() => { if (!studio.busy) studio.setIncoming(null); }}><p>{s('flowFileReview')}</p><div className="review-names"><strong>{studio.configuration.name}</strong><Icon name="arrow" /><strong>{studio.incoming.name}</strong></div><ControllerReview before={studio.configuration} after={studio.incoming} /><MusicalReview before={studio.configuration} after={studio.incoming} />
      <details><summary>{t('technicalDetails')} · {t('changeCount', { count: diff.length })}</summary><div className="diff-scroll"><table><thead><tr><th>{t('field')}</th><th>{t('before')}</th><th>{t('after')}</th></tr></thead><tbody>{diff.slice(diffPage * 100, (diffPage + 1) * 100).map(change => <tr key={change.path.join('/')}><th scope="row">{change.path.join(' / ')}</th><td>{change.before}</td><td>{change.after}</td></tr>)}</tbody></table></div>{diff.length > 100 && <div className="pagination"><button disabled={!diffPage} onClick={() => setDiffPage(diffPage - 1)}>{t('previous')}</button><span>{diffPage + 1} / {Math.ceil(diff.length / 100)}</span><button disabled={(diffPage + 1) * 100 >= diff.length} onClick={() => setDiffPage(diffPage + 1)}>{t('next')}</button></div>}</details>
      <footer className="dialog-footer"><button className="secondary" disabled={studio.busy} onClick={() => studio.setIncoming(null)}>{t('cancel')}</button><button className="primary" disabled={studio.busy || !studio.persistent || !diff.length} onClick={() => void (async () => { if (await studio.replaceDraft()) { setSequence('primary'); setModeConfirmed(false); chooseMode(); } })()}>{t('replaceDraft')}</button></footer></Dialog>}
    {confirmation && <Dialog title={confirmation.title} onClose={() => setConfirmation(null)}><footer className="dialog-footer"><button className="secondary" onClick={() => setConfirmation(null)}>{t('cancel')}</button><button className="primary" onClick={() => { confirmation.action(); setConfirmation(null); }}>{confirmation.label}</button></footer></Dialog>}
  </div>;
}
