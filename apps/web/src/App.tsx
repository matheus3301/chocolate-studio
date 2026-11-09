import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useTranslation } from "react-i18next";
import {
  CONTROLLER_MODES,
  effectiveControllerMode,
  getControllerMode,
} from "@chocolate-studio/midi";
import type { StudioConfiguration, SwitchId } from "@chocolate-studio/midi";
import { differences, sameConfiguration } from "./editor.js";
import type { Locale, Sequence } from "./editor.js";
import { database } from "./storage.js";
import { useStudio } from "./useStudio.js";
import { unavailableHardware } from "./hardware.js";
import type {
  DeviceRead,
  HardwareService,
  VerifiedDeviceRead,
} from "./hardware.js";
import { configurationFromBytes } from "./hardware-mapping.js";
import { HardwarePanel } from "./HardwarePanel.js";
import { ConnectionExperience } from "./ConnectionExperience.js";
import { SaveBar } from "./SaveBar.js";
import { GuidedEditor } from "./GuidedEditor.js";
import { ModeEditor, ModeSettings } from "./ModeEditor.js";
import { InterfaceEditor } from "./InterfaceEditor.js";
import { Destinations, Presets } from "./EditorViews.js";
import { MusicalReview } from "./MusicalReview.js";
import { ControllerReview } from "./ControllerReview.js";
import { Dialog, Empty, Icon } from "./components.js";
import { useWorkbenchTranslation } from "./workbench-i18n.js";

type Tool =
  | "connection"
  | "mode"
  | "controller"
  | "external"
  | "recovery"
  | "equipment"
  | "presets"
  | "diagnostics"
  | "export"
  | null;

export function App({
  hardware = unavailableHardware,
}: {
  hardware?: HardwareService;
}) {
  const { t, i18n } = useTranslation();
  const { wt, locale } = useWorkbenchTranslation();
  const studio = useStudio();
  const device = useSyncExternalStore(
    hardware.subscribe,
    hardware.getSnapshot,
    hardware.getSnapshot,
  );
  const [editing, setEditing] = useState(false);
  const [tool, setTool] = useState<Tool>(null);
  const [groupId, setGroup] = useState("group-1");
  const [switchId, setSwitch] = useState<SwitchId>("A");
  const [sequence, setSequence] = useState<Sequence>("primary");
  const [pendingAction, setPendingAction] = useState(false);
  const [pendingInterface, setPendingInterface] = useState(false);
  const [pendingHardware, setPendingHardware] = useState(false);
  const [adopting, setAdopting] = useState(false);
  const [readCandidate, setReadCandidate] = useState<DeviceRead | null>(null);
  const [modeDraft, setModeDraft] = useState(
    effectiveControllerMode(studio.configuration),
  );
  const [customizing, setCustomizing] = useState(false);
  const [confirmation, setConfirmation] = useState<{
    title: string;
    label: string;
    action: () => void;
  } | null>(null);
  const [recoveryTab, setRecoveryTab] = useState<"editor" | "controller">(
    "editor",
  );
  const [exportName, setExportName] = useState("chocolate-config");
  const [diffPage, setDiffPage] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const fileMenu = useRef<HTMLDetailsElement>(null);
  const controllerMenu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const dismiss = (event: PointerEvent | KeyboardEvent) => {
      for (const menu of [fileMenu.current, controllerMenu.current]) {
        if (
          menu?.open &&
          (event instanceof KeyboardEvent
            ? event.key === "Escape"
            : !menu.contains(event.target as Node))
        )
          menu.open = false;
      }
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", dismiss);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", dismiss);
    };
  }, []);
  const readGeneration = useRef(0);
  const handledRead = useRef<{
    service: HardwareService;
    epoch: number | undefined;
    id: string;
  } | null>(null);
  const connected = !!device.identity && !!device.selection;
  const hardwareBusy =
    pendingHardware ||
    ["busy", "requesting", "connecting"].includes(device.status);
  const locked = studio.loading || studio.busy || hardwareBusy || adopting;
  const incomplete = pendingAction || pendingInterface;
  const activeMode = effectiveControllerMode(studio.configuration);
  const mode = getControllerMode(activeMode);
  const readMode = connected
    ? (device.observed?.controller?.rawMode ??
      device.observed?.configuration.controller?.mode)
    : undefined;
  const diff = useMemo(
    () =>
      studio.incoming ? differences(studio.configuration, studio.incoming) : [],
    [studio.configuration, studio.incoming],
  );
  const confirm = (title: string, label: string, action: () => void) =>
    setConfirmation({ title, label, action });
  function closeTool() {
    if (!locked && !pendingInterface) setTool(null);
  }
  function openTool(next: Tool) {
    if (incomplete || locked) return;
    if (fileMenu.current) fileMenu.current.open = false;
    if (controllerMenu.current) controllerMenu.current.open = false;
    if (next === "mode") {
      setModeDraft(activeMode);
      setCustomizing(false);
    }
    setTool(next);
  }
  function customize() {
    setModeDraft(activeMode >= 5 && activeMode <= 9 ? 10 : 3);
    setCustomizing(true);
    setTool("mode");
  }
  function editorSelection(next: StudioConfiguration) {
    setGroup(next.groups[0]!.id);
    setSwitch("A");
    setSequence("primary");
  }
  async function adopt(read: DeviceRead) {
    const current = hardware.getSnapshot();
    if (
      !current.selection ||
      !current.identity ||
      current.observed?.rawBackup.id !== read.rawBackup.id
    ) {
      studio.setNotice("connection:previewExpired");
      return;
    }
    const generation = ++readGeneration.current;
    setAdopting(true);
    try {
      if (await studio.adoptRead(read.configuration)) {
        if (generation !== readGeneration.current) return;
        editorSelection(read.configuration);
        setReadCandidate(null);
        setTool(null);
        setEditing(true);
      }
    } finally {
      if (generation === readGeneration.current) setAdopting(false);
    }
  }
  function reviewRead(read: DeviceRead) {
    const current = hardware.getSnapshot();
    if (
      handledRead.current?.service === hardware &&
      handledRead.current.epoch === current.connectionEpoch &&
      handledRead.current.id === read.rawBackup.id
    )
      return;
    handledRead.current = {
      service: hardware,
      epoch: current.connectionEpoch,
      id: read.rawBackup.id,
    };
    try {
      const reconciled = {
        ...read,
        ...configurationFromBytes(
          new Uint8Array(read.rawBackup.bytes),
          studio.configuration,
        ),
      };
      const differs = !sameConfiguration(
        studio.configuration,
        reconciled.configuration,
      );
      if (studio.hasRecoveryDraft && differs) {
        setReadCandidate(reconciled);
        setTool(null);
      } else void adopt(reconciled);
    } catch {
      studio.setNotice("hardware.unrecognizedFields");
    }
  }
  async function verified(read: VerifiedDeviceRead) {
    // Local labels and inactive mappings must not be replaced by a narrower active-mode write.
    const verifiedConfiguration = configurationFromBytes(
      new Uint8Array(read.rawBackup.bytes),
      studio.configuration,
    ).configuration;
    await studio.markDeviceSynced(verifiedConfiguration);
  }
  async function changeLanguage(next: Locale) {
    await i18n.changeLanguage(next);
    document.documentElement.lang = next;
    try {
      await database.preferences.put({ id: "locale", value: next });
    } catch {
      studio.setNotice("storageUnavailable");
    }
  }
  const editorProps = {
    configuration: studio.configuration,
    onChange: studio.setConfiguration,
    groupId,
    onGroup: setGroup,
    switchId,
    onSwitch: setSwitch,
    sequence,
    onSequence: setSequence,
    confirm,
  };
  const contextualTools = {
    onManageDestinations: () => openTool("equipment"),
    onManagePresets: () => openTool("presets"),
  };
  const connectionProps = {
    service: hardware,
    state: device,
    onRead: reviewRead,
    onOffline: () => {
      setEditing(true);
      setTool(null);
    },
    onNotice: studio.setNotice,
    onPendingChange: setPendingHardware,
  };
  const activity = [
    ...studio.events.map((e) => ({
      id: e.id,
      time: e.time,
      text: t(e.key),
      bytes: "",
    })),
    ...device.history.map((e) => ({
      id: e.id,
      time: e.time,
      text: t(e.summary, { defaultValue: e.summary }),
      bytes:
        e.bytes?.map((b) => b.toString(16).padStart(2, "0")).join(" ") ?? "",
    })),
  ]
    .sort((a, b) => b.time - a.time)
    .slice(0, 200);
  const recoveryCopies = [...studio.memoryBackups, ...studio.backups];
  const titles: Record<Exclude<Tool, null>, string> = {
    connection: wt("connection"),
    mode: wt("mode"),
    controller: wt("channelAndDisplay"),
    external: wt("externalPedal"),
    recovery: wt("recovery"),
    equipment: wt("equipment"),
    presets: wt("presetReferences"),
    diagnostics: wt("diagnostics"),
    export: wt("exportTitle"),
  };

  return (
    <div className="workbench-shell">
      <a className="skip-link" href="#workspace">
        {wt("edit")}
      </a>
      <header className="workbench-topbar">
        <a className="workbench-brand" href="#workspace">
          Chocolate<span>STUDIO</span>
        </a>
        <nav className="workbench-app-tools" aria-label="Chocolate Studio">
          <details className="workbench-file-menu" ref={fileMenu}>
            <summary>{wt("file")}</summary>
            <div className="workbench-menu-items">
              <button
                disabled={locked || incomplete}
                onClick={() => {
                  fileMenu.current!.open = false;
                  fileInput.current?.click();
                }}
              >
                <Icon name="upload" />
                {wt("open")}
              </button>
              <button
                disabled={studio.loading || incomplete || adopting}
                onClick={() => {
                  setExportName(
                    studio.configuration.name
                      .replace(/[^\p{L}\p{N}._-]+/gu, "-")
                      .slice(0, 80) || "chocolate-config",
                  );
                  openTool("export");
                }}
              >
                <Icon name="download" />
                {wt("download")}
              </button>
              <button
                disabled={locked || incomplete}
                onClick={() => openTool("recovery")}
              >
                <Icon name="backup" />
                {wt("recovery")}
              </button>
            </div>
          </details>
          <label className="workbench-language">
            <span className="visually-hidden">{wt("language")}</span>
            <select
              aria-label={wt("language")}
              value={locale}
              onChange={(event) =>
                void changeLanguage(event.target.value as Locale)
              }
            >
              <option lang="pt-BR" value="pt-BR">
                Português
              </option>
              <option lang="en" value="en">
                English
              </option>
            </select>
          </label>
        </nav>
        <input
          className="visually-hidden"
          type="file"
          tabIndex={-1}
          accept=".json,application/json"
          aria-label={t("import")}
          ref={fileInput}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            setDiffPage(0);
            if (file) void studio.importProject(file);
          }}
        />
      </header>
      <main
        id="workspace"
        className={`workbench-content${editing ? " workbench-editing" : ""}`}
        tabIndex={-1}
      >
        {studio.notice && (
          <div className="notice" role="alert">
            <p>{t(studio.notice, { defaultValue: studio.notice })}</p>
            {studio.notice === "conflict" && (
              <button
                className="secondary"
                onClick={() =>
                  confirm(
                    t("reloadConfirm"),
                    t("reloadSaved"),
                    () => void studio.reloadSaved(),
                  )
                }
              >
                {t("reloadSaved")}
              </button>
            )}
            <button
              className="icon-button"
              aria-label={t("dismiss")}
              onClick={() => studio.setNotice(null)}
            >
              <Icon name="close" />
            </button>
          </div>
        )}
        {studio.loading || adopting ? (
          <p className="workbench-opening" role="status">
            {adopting ? wt("reading") : t("loading")}
          </p>
        ) : (
          <>
            {!editing && (
              <div className="workbench-entry">
                <h1>{wt("startConnect")}</h1>
                <ConnectionExperience {...connectionProps} />
                {studio.hasRecoveryDraft && (
                  <button
                    className="text-button"
                    disabled={locked}
                    onClick={() => setEditing(true)}
                  >
                    {wt("resume")}
                  </button>
                )}
              </div>
            )}
            {editing && (
              <>
                <header className="workbench-controller-header">
                  <div>
                    <h1>{wt("device")}</h1>
                    <button
                      className={`workbench-connection-state${connected ? " is-connected" : ""}`}
                      onClick={() => openTool("connection")}
                      disabled={locked || incomplete}
                    >
                      <span aria-hidden="true" />
                      {connected
                        ? wt("connected")
                        : device.observed
                          ? wt("disconnected")
                          : wt("offline")}
                      <span aria-hidden="true">⌄</span>
                    </button>
                  </div>
                  <div className="workbench-controller-tools">
                    <button
                      className="workbench-mode-button"
                      aria-label={`${wt("mode")}: ${mode?.label[locale] ?? wt("unknownMode")}`}
                      onClick={() => openTool("mode")}
                      disabled={locked || incomplete}
                    >
                      <span>{wt("mode")}</span>
                      <strong>
                        {mode?.label[locale] ?? wt("unknownMode")}{" "}
                        <span aria-hidden="true">⌄</span>
                      </strong>
                    </button>
                    <details
                      className="workbench-controller-menu"
                      ref={controllerMenu}
                    >
                      <summary>{wt("controllerOptions")}</summary>
                      <div className="workbench-menu-items">
                        <button
                          disabled={locked || incomplete || !mode}
                          onClick={() => openTool("controller")}
                        >
                          {wt("channelAndDisplay")}
                        </button>
                        <button
                          disabled={locked || incomplete || !mode}
                          onClick={() => openTool("external")}
                        >
                          {wt("externalPedal")}
                        </button>
                        <button
                          disabled={locked || incomplete}
                          onClick={() => openTool("diagnostics")}
                        >
                          {wt("diagnostics")}
                        </button>
                      </div>
                    </details>
                  </div>
                </header>
                {readMode !== undefined && readMode !== activeMode && (
                  <p className="workbench-mode-change" role="status">
                    {wt("onController")}:{" "}
                    {getControllerMode(readMode)?.label[locale] ??
                      wt("unknownMode")}{" "}
                    → {wt("editingMode")}:{" "}
                    {mode?.label[locale] ?? wt("unknownMode")}
                  </p>
                )}
                {!mode && <p className="notice">{wt("unknownHint")}</p>}
                {pendingInterface && (
                  <p className="workbench-incomplete" role="status">
                    {wt("incomplete")}
                  </p>
                )}
                <fieldset
                  className="editor-fieldset"
                  disabled={locked || pendingInterface}
                >
                  {activeMode === 3 ? (
                    <GuidedEditor
                      {...editorProps}
                      {...contextualTools}
                      disabled={locked}
                      onPendingChange={setPendingAction}
                    />
                  ) : (
                    <ModeEditor
                      key={activeMode}
                      configuration={studio.configuration}
                      onChange={studio.setConfiguration}
                      confirm={confirm}
                      onPendingChange={setPendingAction}
                      disabled={locked}
                      hideSettings
                      onCustomize={customize}
                      {...contextualTools}
                    />
                  )}
                </fieldset>
                <SaveBar
                  service={hardware}
                  state={device}
                  configuration={studio.configuration}
                  onNotice={studio.setNotice}
                  onVerified={verified}
                  onPendingChange={setPendingHardware}
                  disabled={
                    incomplete ||
                    studio.busy ||
                    adopting ||
                    !mode ||
                    tool !== null
                  }
                  onConnect={() => openTool("connection")}
                />
              </>
            )}
          </>
        )}
      </main>
      {tool && (
        <Dialog title={titles[tool]} onClose={closeTool}>
          {tool === "connection" && (
            <>
              <ConnectionExperience {...connectionProps} />
              <button
                className="text-button"
                disabled={locked}
                onClick={() => setTool("diagnostics")}
              >
                {wt("diagnostics")}
              </button>
            </>
          )}
          {tool === "mode" && (
            <form
              className="workbench-mode-form"
              onSubmit={(event) => {
                event.preventDefault();
                if (
                  studio.setConfiguration({
                    ...studio.configuration,
                    controller: {
                      ...studio.configuration.controller,
                      mode: modeDraft,
                    },
                  })
                ) {
                  setTool(null);
                  setSequence("primary");
                }
              }}
            >
              <p>{customizing ? wt("advancedReason") : wt("modeHint")}</p>
              <label className="field">
                <span>{wt("mode")}</span>
                <select
                  value={modeDraft}
                  disabled={locked}
                  onChange={(event) => setModeDraft(Number(event.target.value))}
                >
                  {!getControllerMode(modeDraft) && (
                    <option value={modeDraft}>{wt("unknownMode")}</option>
                  )}
                  {[
                    {
                      label: wt("midiModes"),
                      modes: CONTROLLER_MODES.filter((m) => m.raw <= 4),
                    },
                    {
                      label: wt("keyboardModes"),
                      modes: CONTROLLER_MODES.filter(
                        (m) => m.raw >= 5 && m.raw <= 11,
                      ),
                    },
                    {
                      label: wt("otherModes"),
                      modes: CONTROLLER_MODES.filter((m) => m.raw === 12),
                    },
                  ].map((category) => (
                    <optgroup label={category.label} key={category.label}>
                      {category.modes.map((m) => (
                        <option key={m.id} value={m.raw}>
                          {m.label[locale]}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
              <p className="workbench-mode-description">
                {getControllerMode(modeDraft)?.description[locale]}
              </p>
              {modeDraft !== activeMode && (
                <p className="helper">{wt("modeChangeHint")}</p>
              )}
              <footer className="dialog-footer">
                <button type="button" className="secondary" onClick={closeTool}>
                  {wt("cancel")}
                </button>
                <button
                  className="primary"
                  disabled={locked || !getControllerMode(modeDraft)}
                >
                  {wt("useMode")}
                </button>
              </footer>
            </form>
          )}
          {tool === "controller" && (
            <>
              <p className="helper">{wt("optionsHint")}</p>
              <ModeSettings
                configuration={studio.configuration}
                onChange={studio.setConfiguration}
                disabled={locked}
                embedded
              />
            </>
          )}
          {tool === "external" && (
            <InterfaceEditor
              configuration={studio.configuration}
              onChange={studio.setConfiguration}
              confirm={confirm}
              onPendingChange={setPendingInterface}
              disabled={locked}
              embedded
            />
          )}
          {tool === "equipment" && (
            <Destinations
              configuration={studio.configuration}
              onChange={studio.setConfiguration}
            />
          )}
          {tool === "presets" && <Presets {...editorProps} />}
          {tool === "export" && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                studio.exportProject({
                  ...studio.configuration,
                  name: exportName.trim() || "chocolate-config",
                });
                setTool(null);
              }}
            >
              <label className="field">
                <span>{wt("exportName")}</span>
                <input
                  value={exportName}
                  maxLength={128}
                  required
                  onChange={(event) => setExportName(event.target.value)}
                />
              </label>
              <footer className="dialog-footer">
                <button className="secondary" type="button" onClick={closeTool}>
                  {wt("cancel")}
                </button>
                <button className="primary">{wt("downloadAction")}</button>
              </footer>
            </form>
          )}
          {tool === "recovery" && (
            <>
              <div className="segmented workbench-recovery-tabs">
                <button
                  aria-pressed={recoveryTab === "editor"}
                  className={recoveryTab === "editor" ? "active" : ""}
                  onClick={() => setRecoveryTab("editor")}
                >
                  {wt("editorCopies")}
                </button>
                <button
                  aria-pressed={recoveryTab === "controller"}
                  className={recoveryTab === "controller" ? "active" : ""}
                  onClick={() => setRecoveryTab("controller")}
                >
                  {wt("controllerCopies")}
                </button>
              </div>
              {recoveryTab === "editor" ? (
                <>
                  <p className="helper">{wt("copyHint")}</p>
                  {!recoveryCopies.length && (
                    <Empty title={wt("noCopies")} detail={wt("noCopiesHint")} />
                  )}{" "}
                  {recoveryCopies.map((copy) => (
                    <article className="workbench-copy" key={copy.id}>
                      <div>
                        <h3>{copy.name}</h3>
                        {studio.memoryBackups.some(
                          (item) => item.id === copy.id,
                        ) && <p className="warning-text">{wt("memoryOnly")}</p>}
                        <time dateTime={new Date(copy.createdAt).toISOString()}>
                          {new Date(copy.createdAt).toLocaleString(locale)}
                        </time>
                      </div>
                      <div className="button-row">
                        <button
                          className="secondary"
                          onClick={() => {
                            studio.setIncoming(copy.configuration);
                            setDiffPage(0);
                            setTool(null);
                          }}
                        >
                          {wt("openCopy")}
                        </button>
                        <button
                          className="text-button"
                          onClick={() =>
                            studio.exportProject(copy.configuration)
                          }
                        >
                          {t("download")}
                        </button>
                        {!studio.memoryBackups.some(
                          (item) => item.id === copy.id,
                        ) && (
                          <button
                            className="text-button danger"
                            onClick={() =>
                              confirm(
                                t("deleteBackup"),
                                t("delete"),
                                () => void studio.deleteBackup(copy.id),
                              )
                            }
                          >
                            {t("delete")}
                          </button>
                        )}
                      </div>
                    </article>
                  ))}
                </>
              ) : (
                <>
                  <p className="helper">{wt("rawHint")}</p>
                  <HardwarePanel
                    recoveryOnly
                    service={hardware}
                    state={device}
                    configuration={studio.configuration}
                    onReviewRead={(configuration) => {
                      studio.setIncoming(configuration);
                      setTool(null);
                    }}
                    onNotice={studio.setNotice}
                    onPendingChange={setPendingHardware}
                  />
                </>
              )}
            </>
          )}
          {tool === "diagnostics" && (
            <>
              <p className="helper">{wt("helpHint")}</p>
              <button
                className="text-button"
                onClick={() => {
                  studio.setEvents([]);
                  hardware.clearHistory();
                }}
              >
                {t("clear")}
              </button>
              <ol className="activity-list">
                {activity.map((e) => (
                  <li key={e.id}>
                    <time dateTime={new Date(e.time).toISOString()}>
                      {new Date(e.time).toLocaleTimeString(locale)}
                    </time>
                    <p>
                      {e.text}
                      {e.bytes && <code>{e.bytes}</code>}
                    </p>
                  </li>
                ))}
              </ol>
              {!activity.length && <p>{t("noActivity")}</p>}
            </>
          )}
        </Dialog>
      )}
      {readCandidate && (
        <Dialog
          title={wt("localRecovery")}
          onClose={() => {
            if (!adopting) {
              setReadCandidate(null);
              setEditing(true);
            }
          }}
        >
          <p>{wt("localRecoveryHint")}</p>
          <ControllerReview
            before={studio.configuration}
            after={readCandidate.configuration}
          />
          <MusicalReview
            before={studio.configuration}
            after={readCandidate.configuration}
          />
          <footer className="dialog-footer">
            <button
              className="secondary"
              disabled={adopting}
              onClick={() => {
                setReadCandidate(null);
                setEditing(true);
              }}
            >
              {wt("keepLocal")}
            </button>
            <button
              className="primary"
              disabled={
                adopting ||
                !connected ||
                device.observed?.rawBackup.id !== readCandidate.rawBackup.id
              }
              onClick={() => void adopt(readCandidate)}
            >
              {wt("useRead")}
            </button>
          </footer>
        </Dialog>
      )}
      {studio.incoming && (
        <Dialog
          title={wt("importTitle")}
          onClose={() => {
            if (!studio.busy) studio.setIncoming(null);
          }}
        >
          <p>{wt("filesHint")}</p>
          <ControllerReview
            before={studio.configuration}
            after={studio.incoming}
          />
          <MusicalReview
            before={studio.configuration}
            after={studio.incoming}
          />
          <details className="technical-review">
            <summary>
              {t("technicalDetails")} ·{" "}
              {t("changeCount", { count: diff.length })}
            </summary>
            <div className="diff-scroll">
              <table>
                <thead>
                  <tr>
                    <th>{t("field")}</th>
                    <th>{t("before")}</th>
                    <th>{t("after")}</th>
                  </tr>
                </thead>
                <tbody>
                  {diff
                    .slice(diffPage * 100, (diffPage + 1) * 100)
                    .map((change) => (
                      <tr key={change.path.join("/")}>
                        <th scope="row">{change.path.join(" / ")}</th>
                        <td>{change.before}</td>
                        <td>{change.after}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            {diff.length > 100 && (
              <div className="pagination">
                <button
                  disabled={!diffPage}
                  onClick={() => setDiffPage(diffPage - 1)}
                >
                  {t("previous")}
                </button>
                <span>
                  {diffPage + 1}/{Math.ceil(diff.length / 100)}
                </span>
                <button
                  disabled={(diffPage + 1) * 100 >= diff.length}
                  onClick={() => setDiffPage(diffPage + 1)}
                >
                  {t("next")}
                </button>
              </div>
            )}
          </details>
          <footer className="dialog-footer">
            <button
              className="secondary"
              disabled={studio.busy}
              onClick={() => studio.setIncoming(null)}
            >
              {wt("cancel")}
            </button>
            <button
              className="primary"
              disabled={studio.busy || !diff.length}
              onClick={() =>
                void (async () => {
                  const incoming = studio.incoming;
                  if (incoming && (await studio.replaceDraft())) {
                    editorSelection(incoming);
                    setEditing(true);
                    setTool(null);
                  }
                })()
              }
            >
              {wt("replace")}
            </button>
          </footer>
        </Dialog>
      )}
      {confirmation && (
        <Dialog
          title={confirmation.title}
          onClose={() => setConfirmation(null)}
        >
          <footer className="dialog-footer">
            <button className="secondary" onClick={() => setConfirmation(null)}>
              {wt("cancel")}
            </button>
            <button
              className="primary"
              onClick={() => {
                confirmation.action();
                setConfirmation(null);
              }}
            >
              {confirmation.label}
            </button>
          </footer>
        </Dialog>
      )}
    </div>
  );
}
